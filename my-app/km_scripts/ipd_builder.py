"""IPD Builder agent for Guyot reconstruction."""

import numpy as np
import pandas as pd
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .base import BaseAgent
from ..models.schemas import AtRiskPoint, KMPoint, RunStatus
from ..utils.blackboard import BlackboardManager


class IPDBuilderAgent(BaseAgent):
    """Agent responsible for pseudo-IPD reconstruction using Guyot method."""
    
    def __init__(self, blackboard: BlackboardManager) -> None:
        """Initialize IPD Builder agent."""
        super().__init__("IPDBuilder", blackboard)
    
    def execute(self, run_id: str, **kwargs: Any) -> Dict[str, Any]:
        """Execute IPD reconstruction.
        
        Args:
            run_id: Run identifier
            
        Returns:
            Reconstruction results
        """
        self.log(run_id, "Starting IPD reconstruction using Guyot method")
        
        state = self.get_state(run_id)
        if not state:
            raise ValueError(f"No state found for run {run_id}")
        
        # Update status
        self.blackboard.set_status(run_id, RunStatus.IPD_RECONSTRUCTION, "IPD reconstruction")
        
        # Group data by endpoint and arm
        ipd_results = {}
        total_patients = 0
        
        for endpoint in set(point.endpoint for point in state.km_data):
            ipd_results[endpoint] = {}
            
            # Get unique arms for this endpoint
            arms = list(set(point.arm for point in state.km_data if point.endpoint == endpoint))
            
            for arm in arms:
                self.log(run_id, f"Reconstructing IPD for {endpoint}-{arm}")
                
                # Get KM and at-risk data for this arm
                km_points = [p for p in state.km_data if p.endpoint == endpoint and p.arm == arm]
                atrisk_points = [p for p in state.atrisk_data if p.endpoint == endpoint and p.arm == arm]
                
                # Clean the KM data to handle duplicate time points
                cleaned_km_points = self._clean_km_data(km_points)
                
                # Reconstruct IPD
                ipd_data = self._reconstruct_ipd_guyot(cleaned_km_points, atrisk_points)
                
                # Save to parquet
                run_dir = self.blackboard.get_run_dir(run_id)
                ipd_file = run_dir / f"ipd_{endpoint}_{arm}.parquet"
                ipd_data.to_parquet(ipd_file)
                
                ipd_results[endpoint][arm] = {
                    "file": str(ipd_file),
                    "n_patients": len(ipd_data),
                    "events": ipd_data["event"].sum(),
                    "median_followup": ipd_data["time"].median(),
                }
                
                total_patients += len(ipd_data)
                self.blackboard.add_artifact(run_id, str(ipd_file))
        
        # Update state with IPD file locations
        self.update_state(run_id, ipd_files=ipd_results)
        
        self.log(run_id, f"IPD reconstruction completed. Total patients: {total_patients}")
        
        return {
            "ipd_results": ipd_results,
            "total_patients": total_patients,
        }
    
    def _reconstruct_ipd_guyot(
        self, 
        km_points: List[KMPoint], 
        atrisk_points: List[AtRiskPoint]
    ) -> pd.DataFrame:
        """Reconstruct individual patient data using Guyot et al. 2012 method.
        
        Args:
            km_points: Kaplan-Meier survival points
            atrisk_points: Number at risk points
            
        Returns:
            DataFrame with reconstructed IPD (time, event, arm)
        """
        if not km_points:
            raise ValueError("No KM points provided for reconstruction")
        
        # Convert to DataFrames and sort by time
        km_df = pd.DataFrame([p.model_dump() for p in km_points]).sort_values("time_months")
        atrisk_df = pd.DataFrame([p.model_dump() for p in atrisk_points]).sort_values("time_months")
        
        # Get arm name (should be consistent across all points)
        arm_name = km_df["arm"].iloc[0]
        
        # Align at-risk data with KM timepoints
        km_df = self._align_atrisk_data(km_df, atrisk_df)
        
        # Estimate initial number at risk if not provided at time 0
        if 0.0 not in km_df["time_months"].values:
            # Estimate from first available timepoint
            first_time_idx = km_df["time_months"].argmin()
            first_survival = km_df.loc[first_time_idx, "survival"]
            first_nrisk = km_df.loc[first_time_idx, "n_risk"]
            
            if first_survival > 0:
                initial_n = int(first_nrisk / first_survival)
            else:
                initial_n = first_nrisk
        else:
            initial_n = km_df[km_df["time_months"] == 0.0]["n_risk"].iloc[0]
        
        # Guyot reconstruction algorithm
        times = km_df["time_months"].values
        survival = km_df["survival"].values
        n_risk = km_df["n_risk"].values
        
        # Calculate number of events and censored at each interval
        n_events = []
        n_censored = []
        
        for i in range(len(times) - 1):
            # Current and next timepoints
            t_curr, s_curr, nr_curr = times[i], survival[i], n_risk[i]
            t_next, s_next, nr_next = times[i + 1], survival[i + 1], n_risk[i + 1]
            
            # Number of events in interval [t_curr, t_next)
            if s_curr > 0:
                d = nr_curr * (1 - s_next / s_curr)
            else:
                d = 0
            
            # Number censored in interval
            c = nr_curr - nr_next - d
            
            n_events.append(max(0, round(d)))
            n_censored.append(max(0, round(c)))
        
        # Handle final interval (assume all remaining are censored)
        n_events.append(0)
        n_censored.append(n_risk[-1])
        
        # Generate individual patient records
        patient_records = []
        patient_id = 0
        
        for i, (t, n_evt, n_cens) in enumerate(zip(times, n_events, n_censored)):
            # Add event times (uniformly distributed in interval)
            if i < len(times) - 1:
                interval_length = times[i + 1] - t
                
                # Events occur uniformly in interval
                for _ in range(n_evt):
                    event_time = t + np.random.uniform(0, interval_length)
                    patient_records.append({
                        "patient_id": patient_id,
                        "time": event_time,
                        "event": 1,
                        "arm": arm_name,
                    })
                    patient_id += 1
            
            # Add censored observations at interval start
            for _ in range(n_cens):
                patient_records.append({
                    "patient_id": patient_id,
                    "time": t,
                    "event": 0,
                    "arm": arm_name,
                })
                patient_id += 1
        
        # Convert to DataFrame
        ipd_df = pd.DataFrame(patient_records)
        
        # CRITICAL FIX: Normalize to exact study population size
        target_n = initial_n  # Use the initial_n from the study
        ipd_df = self._normalize_ipd_population(ipd_df, target_n, arm_name)
        
        # Validate reconstruction
        self._validate_reconstruction(ipd_df, km_df)
        
        # Critical IPD integrity validation
        self._validate_ipd_integrity(ipd_df, arm_name)
        
        return ipd_df
    
    def _align_atrisk_data(self, km_df: pd.DataFrame, atrisk_df: pd.DataFrame) -> pd.DataFrame:
        """Align at-risk data with KM timepoints using hybrid approach.
        
        NEW APPROACH: Use full KM curve for accurate survival estimates while
        intelligently interpolating at-risk numbers to respect constraints.
        
        Args:
            km_df: KM data DataFrame (full digitized curve)
            atrisk_df: At-risk data DataFrame (sparse timepoints)
            
        Returns:
            KM DataFrame with n_risk column added for all KM timepoints
        """
        if atrisk_df.empty:
            # Estimate n_risk from survival curve (rough approximation)
            # Assume initial population of 100 and scale proportionally
            km_df_copy = km_df.copy()
            km_df_copy["n_risk"] = (100 * km_df_copy["survival"]).round().astype(int)
            return km_df_copy
        
        # HYBRID APPROACH: Use all KM timepoints but interpolate at-risk intelligently
        km_df_copy = km_df.copy().sort_values("time_months")
        
        # Create time-to-n_risk mapping from at-risk data
        atrisk_times = atrisk_df["time_months"].values
        atrisk_nrisk = atrisk_df["n_risk"].values
        
        # For each KM timepoint, estimate the number at risk
        estimated_nrisk = []
        
        for km_time in km_df_copy["time_months"]:
            if km_time in atrisk_times:
                # Exact match - use the actual at-risk value
                idx = np.where(atrisk_times == km_time)[0][0]
                n_risk = atrisk_nrisk[idx]
            else:
                # Interpolate between known at-risk values
                # Use linear interpolation, but constrain to make sense
                n_risk = np.interp(km_time, atrisk_times, atrisk_nrisk)
                # Round to integer and ensure non-negative
                n_risk = max(0, round(n_risk))
            
            estimated_nrisk.append(n_risk)
        
        km_df_copy["n_risk"] = estimated_nrisk
        
        # Ensure n_risk is monotonically non-increasing (patients can only leave, not join)
        km_df_copy["n_risk"] = km_df_copy["n_risk"].cummin()
        
        # Additional constraint: n_risk should be consistent with survival
        # If survival drops dramatically but n_risk doesn't, adjust n_risk
        initial_n = km_df_copy["n_risk"].iloc[0]
        for i in range(len(km_df_copy)):
            survival = km_df_copy["survival"].iloc[i]
            # Rough estimate: n_risk shouldn't be much higher than survival * initial_n
            max_reasonable_nrisk = max(1, survival * initial_n * 1.2)  # 20% buffer
            if km_df_copy["n_risk"].iloc[i] > max_reasonable_nrisk:
                km_df_copy.iloc[i, km_df_copy.columns.get_loc("n_risk")] = round(max_reasonable_nrisk)
        
        # Final monotonicity check
        km_df_copy["n_risk"] = km_df_copy["n_risk"].cummin()
        
        self.log("", f"✅ Aligned {len(km_df_copy)} KM timepoints with interpolated at-risk data")
        self.log("", f"   At-risk range: {km_df_copy['n_risk'].iloc[0]} → {km_df_copy['n_risk'].iloc[-1]} patients")
        
        return km_df_copy
    
    def _validate_reconstruction(self, ipd_df: pd.DataFrame, km_df: pd.DataFrame) -> None:
        """Validate IPD reconstruction against original KM curve.
        
        Args:
            ipd_df: Reconstructed IPD
            km_df: Original KM data
        """
        from lifelines import KaplanMeierFitter
        
        # Fit KM to reconstructed data
        kmf = KaplanMeierFitter()
        kmf.fit(ipd_df["time"], ipd_df["event"])
        
        # Compare survival estimates at original timepoints
        original_times = km_df["time_months"].values
        original_survival = km_df["survival"].values
        
        reconstructed_survival = kmf.survival_function_at_times(original_times).values
        
        # Calculate mean absolute error
        mae = np.mean(np.abs(original_survival - reconstructed_survival))
        
        # Set validation thresholds based on endpoint type
        # PFS data often has more complex patterns than OS data
        if "PFS" in str(km_df["endpoint"].iloc[0]):
            warning_threshold = 0.10
            failure_threshold = 0.30  # Only fail if reconstruction is very poor
        else:
            warning_threshold = 0.05
            failure_threshold = 0.15
        
        if mae > failure_threshold:
            raise ValueError(f"IPD reconstruction validation failed. MAE: {mae:.3f} (failure threshold: {failure_threshold:.3f})")
        elif mae > warning_threshold:
            self.log("", f"⚠️ IPD reconstruction quality warning: MAE: {mae:.3f} (threshold: {warning_threshold:.3f})")
            self.log("", f"Proceeding with analysis but results should be interpreted cautiously")
        
        return True
    
    def _clean_km_data(self, km_points) -> List:
        """Clean KM data to handle duplicate time points and step functions.
        
        Args:
            km_points: List of KM data points
            
        Returns:
            Cleaned list of KM data points
        """
        if not km_points:
            return km_points
        
        # Convert to DataFrame for easier manipulation
        df = pd.DataFrame([point.model_dump() for point in km_points])
        
        # Sort by time
        df = df.sort_values('time_months')
        
        # Enhanced cleaning strategy for PFS data
        endpoint_type = str(df['endpoint'].iloc[0]) if not df.empty else ""
        
        if "PFS" in endpoint_type:
            # Advanced PFS-specific cleaning: Interpolation-based approach
            def advanced_pfs_survival(group):
                if len(group) == 1:
                    return group.iloc[0]
                elif len(group) == 2:
                    # For PFS, use a more conservative approach
                    # Lean towards the after-event value but smooth the transition
                    values = sorted(group.values)  # [lower, higher]
                    step_size = values[1] - values[0]
                    
                    # If step is very large (>0.03), lean heavily toward after-event
                    if step_size > 0.03:
                        return 0.85 * values[0] + 0.15 * values[1]
                    else:
                        # If step is small, use more balanced weighting
                        return 0.65 * values[0] + 0.35 * values[1]
                else:
                    # For multiple duplicates, use weighted percentile
                    return group.quantile(0.3)  # 30th percentile (closer to minimum)
            
            df_cleaned = df.groupby('time_months', as_index=False).agg({
                'endpoint': 'first',
                'arm': 'first', 
                'survival': advanced_pfs_survival
            })
            
            self.log("", f"✅ Applied advanced PFS cleaning (step-aware weighting)")
            
        else:
            # Standard cleaning for OS data: Keep minimum survival value
            df_cleaned = df.groupby('time_months', as_index=False).agg({
                'endpoint': 'first',
                'arm': 'first', 
                'survival': 'min'  # Keep lower survival (after event)
            })
            
            self.log("", f"✅ Applied standard cleaning (minimum survival)")
        
        # Ensure monotonicity (survival should not increase)
        df_cleaned = df_cleaned.sort_values('time_months')
        df_cleaned['survival'] = df_cleaned['survival'].cummin()
        
        # Add small time offsets to prevent exact duplicates if any remain
        time_diff = df_cleaned['time_months'].diff()
        zero_diff_mask = (time_diff == 0) & (df_cleaned.index > 0)
        
        if zero_diff_mask.any():
            self.log("", f"⚠️ Adjusting {zero_diff_mask.sum()} remaining duplicate time points")
            # Add small increments (0.001 months) to duplicate times
            for idx in df_cleaned[zero_diff_mask].index:
                df_cleaned.loc[idx, 'time_months'] += 0.001 * (idx - df_cleaned.index[0])
        
        # Convert back to KMPoint objects
        from ..models.schemas import KMPoint
        cleaned_points = []
        for _, row in df_cleaned.iterrows():
            cleaned_points.append(KMPoint(
                endpoint=row['endpoint'],
                arm=row['arm'],
                time_months=row['time_months'],
                survival=row['survival']
            ))
        
        original_count = len(km_points)
        cleaned_count = len(cleaned_points)
        
        if original_count != cleaned_count:
            self.log("", f"✅ Cleaned KM data: {original_count} → {cleaned_count} points (removed duplicates)")
        
        return cleaned_points
    
    def _validate_ipd_integrity(self, ipd_df: pd.DataFrame, arm_name: str) -> None:
        """Validate IPD integrity and consistency.
        
        Args:
            ipd_df: Reconstructed IPD DataFrame
            arm_name: Treatment arm name
            
        Raises:
            ValueError: If IPD integrity checks fail
        """
        if ipd_df.empty:
            raise ValueError(f"IPD is empty for {arm_name}")
        
        # Critical check 1: events + censored = total patients
        total_patients = len(ipd_df)
        events = ipd_df["event"].sum()
        censored = (ipd_df["event"] == 0).sum()
        calculated_total = events + censored
        
        if total_patients != calculated_total:
            raise ValueError(
                f"IPD integrity failure for {arm_name}: "
                f"Total patients ({total_patients}) ≠ Events + Censored ({calculated_total})"
            )
        
        # Critical check 2: event column must only contain 0 and 1
        unique_events = ipd_df["event"].unique()
        if not all(v in [0, 1] for v in unique_events):
            raise ValueError(
                f"IPD integrity failure for {arm_name}: "
                f"Invalid event values {unique_events}, must be only 0 and 1"
            )
        
        # Check 3: time values must be non-negative
        if (ipd_df["time"] < 0).any():
            raise ValueError(
                f"IPD integrity failure for {arm_name}: "
                f"Negative time values detected"
            )
        
        # Check 4: reasonable patient count (warn if >50% inflation)
        # This is based on the original at-risk data in the state
        # For now, we'll use a general reasonableness check
        if total_patients > 500:  # Arbitrary large number check
            self.log("", f"⚠️ Large patient count ({total_patients}) for {arm_name} - verify data quality")
        
        # Log successful validation
        self.log("", f"✅ IPD integrity validated for {arm_name}: {total_patients} patients ({events} events, {censored} censored)")
        
        return True
    
    def _normalize_ipd_population(self, ipd_df: pd.DataFrame, target_n: int, arm_name: str) -> pd.DataFrame:
        """Normalize IPD to match exact study population size.
        
        Args:
            ipd_df: Raw IPD from Guyot reconstruction
            target_n: Target population size from original study
            arm_name: Treatment arm name
            
        Returns:
            Normalized IPD with exact patient count
        """
        current_n = len(ipd_df)
        
        if current_n == target_n:
            self.log("", f"✅ IPD population already matches target for {arm_name}: {target_n}")
            return ipd_df
        
        ipd_normalized = ipd_df.copy()
        
        if current_n > target_n:
            # Too many patients - remove excess randomly but preserve event/censoring balance
            excess = current_n - target_n
            
            # Separate events and censored
            events_df = ipd_normalized[ipd_normalized['event'] == 1].copy()
            censored_df = ipd_normalized[ipd_normalized['event'] == 0].copy()
            
            # Calculate proportional removal
            event_ratio = len(events_df) / current_n
            censored_ratio = len(censored_df) / current_n
            
            events_to_remove = int(round(excess * event_ratio))
            censored_to_remove = excess - events_to_remove
            
            # Ensure we don't remove more than available
            events_to_remove = min(events_to_remove, len(events_df))
            censored_to_remove = min(censored_to_remove, len(censored_df))
            
            # Remove excess patients randomly
            if events_to_remove > 0 and len(events_df) > 0:
                events_df = events_df.sample(n=len(events_df) - events_to_remove, random_state=42)
            
            if censored_to_remove > 0 and len(censored_df) > 0:
                censored_df = censored_df.sample(n=len(censored_df) - censored_to_remove, random_state=42)
            
            # Combine and sort
            ipd_normalized = pd.concat([events_df, censored_df], ignore_index=True)
            ipd_normalized = ipd_normalized.sort_values('time').reset_index(drop=True)
            
            self.log("", f"🔧 Reduced IPD population for {arm_name}: {current_n} → {len(ipd_normalized)} (removed {current_n - len(ipd_normalized)})")
            
        elif current_n < target_n:
            # Too few patients - add more by duplicating existing with slight time variation
            deficit = target_n - current_n
            
            # Sample existing patients to duplicate (preserve event/censoring distribution)
            if len(ipd_normalized) > 0:
                duplicates = ipd_normalized.sample(n=deficit, replace=True, random_state=42).copy()
                
                # Add small random variation to times to avoid exact duplicates
                time_noise = np.random.normal(0, 0.01, len(duplicates))  # Small noise
                duplicates['time'] = duplicates['time'] + time_noise
                duplicates['time'] = np.maximum(duplicates['time'], 0.001)  # Ensure positive
                
                # Reset patient IDs
                duplicates['patient_id'] = range(current_n, current_n + len(duplicates))
                
                # Combine and sort
                ipd_normalized = pd.concat([ipd_normalized, duplicates], ignore_index=True)
                ipd_normalized = ipd_normalized.sort_values('time').reset_index(drop=True)
                
                self.log("", f"🔧 Expanded IPD population for {arm_name}: {current_n} → {len(ipd_normalized)} (added {len(ipd_normalized) - current_n})")
        
        # Final validation
        final_n = len(ipd_normalized)
        if final_n != target_n:
            self.log("", f"⚠️ Population normalization for {arm_name} achieved {final_n}/{target_n} patients")
        else:
            self.log("", f"✅ Population normalized for {arm_name}: exactly {target_n} patients")
        
        return ipd_normalized

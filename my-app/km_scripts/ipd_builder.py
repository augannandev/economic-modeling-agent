"""IPD Builder agent for Guyot reconstruction."""

import numpy as np
import pandas as pd
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .base import BaseAgent  # type: ignore
from ..models.schemas import AtRiskPoint, KMPoint, RunStatus  # type: ignore
from ..utils.blackboard import BlackboardManager  # type: ignore


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
        
        CRITICAL FIXES APPLIED:
        1. Step-function interpolation: Uses left-continuous interpolation to preserve
           KM curve step-function nature (survival stays constant until events occur)
        2. Event timing: Places events very close to timepoints (80-99% of interval)
           to match when survival actually drops in step functions
        3. Exact matching: Uses exact KM values when at-risk table timepoints match
           KM curve timepoints exactly
        
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
            # Guyot formula: d = n_risk * (1 - S(t_next) / S(t_curr))
            # This assumes survival changes linearly, but for step functions we need to be careful
            if s_curr > 0 and s_next < s_curr:
                # Standard Guyot formula - valid for step functions
                d = nr_curr * (1 - s_next / s_curr)
            elif s_curr > 0:
                # No survival drop (s_next >= s_curr) - no events, only censoring
                d = 0
            else:
                # Already at 0 survival - no more events possible
                d = 0
            
            # Number censored in interval
            # c = n_risk(t_curr) - n_risk(t_next) - events
            c = nr_curr - nr_next - d
            
            # Ensure non-negative values (rounding can cause small negatives)
            d = max(0, d)
            c = max(0, c)
            
            n_events.append(max(0, round(d)))
            n_censored.append(max(0, round(c)))
        
        # Handle final interval (assume all remaining are censored)
        n_events.append(0)
        n_censored.append(n_risk[-1])
        
        # LOG: Event distribution by interval for debugging
        self.log("", f"📈 Event distribution across {len(times)-1} intervals:")
        total_events = sum(n_events)
        for i in range(min(len(times)-1, 8)):  # Show first 8 intervals
            t_start, t_end = times[i], times[i+1] if i < len(times)-1 else times[i]
            self.log("", f"   [{t_start:.1f}-{t_end:.1f}mo]: {n_events[i]} events, {n_censored[i]} censored")
        if len(times) > 9:
            self.log("", f"   ... and {len(times)-9} more intervals")
        self.log("", f"   Total events: {total_events}, Total censored: {sum(n_censored)}")
        
        # Generate individual patient records
        # IMPROVED: Better event timing to match step function behavior
        patient_records = []
        patient_id = 0
        
        for i, (t, n_evt, n_cens) in enumerate(zip(times, n_events, n_censored)):
            if i < len(times) - 1:
                interval_length = times[i + 1] - t
                
                # IMPROVED EVENT TIMING:
                # Place events RIGHT BEFORE the next timepoint to match step function behavior
                # In KM curves, survival drops at event times, so events should occur
                # just before the timepoint where survival drops
                for j in range(n_evt):
                    # Place events in the last 20% of interval, very close to next timepoint
                    # This ensures survival drops occur at the correct timepoint
                    base_offset = 0.8 + 0.19 * (j / max(1, n_evt))  # Range: 0.8 to 0.99 of interval
                    small_jitter = np.random.uniform(-0.01, 0.01) * interval_length
                    event_time = t + (base_offset * interval_length) + small_jitter
                    # Ensure event time stays within interval, very close to next timepoint
                    event_time = max(t + 0.001, min(event_time, times[i + 1] - 0.0001))
                    
                    patient_records.append({
                        "patient_id": patient_id,
                        "time": event_time,
                        "event": 1,
                        "arm": arm_name,
                    })
                    patient_id += 1
            
            # Censoring occurs THROUGHOUT the interval (patients can drop out anytime)
            # But we place them at the START of interval for consistency with at-risk counts
            for j in range(n_cens):
                # Small spread for censored patients within first half of interval
                if i < len(times) - 1:
                    censor_time = t + np.random.uniform(0, 0.3) * (times[i + 1] - t)
                else:
                    censor_time = t
                    
                patient_records.append({
                    "patient_id": patient_id,
                    "time": censor_time,
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
        """Align at-risk data with KM timepoints using AT-RISK TABLE AS PRIMARY GRID.
        
        IMPROVED APPROACH (v2): Use at-risk table timepoints as the primary reconstruction
        grid, and interpolate survival values at those points. This avoids the error 
        accumulation that occurs when using fine-grained KM curves with interpolated at-risk.
        
        Args:
            km_df: KM data DataFrame (full digitized curve)
            atrisk_df: At-risk data DataFrame (sparse timepoints from published table)
            
        Returns:
            DataFrame with n_risk from table and survival interpolated at table timepoints
        """
        if atrisk_df.empty:
            # No at-risk data - fall back to using KM curve with estimated at-risk
            self.log("", "⚠️ No at-risk table provided, using survival-based estimation")
            km_df_copy = km_df.copy()
            # Estimate initial N from the curve shape
            initial_n = 100  # Default assumption
            km_df_copy["n_risk"] = (initial_n * km_df_copy["survival"]).round().astype(int)
            return km_df_copy
        
        # IMPROVED: Use at-risk table timepoints as the PRIMARY reconstruction grid
        atrisk_df_copy = atrisk_df.copy().sort_values("time_months")
        km_df_sorted = km_df.copy().sort_values("time_months")
        
        # Get arm and endpoint from KM data
        arm_name = km_df_sorted["arm"].iloc[0]
        endpoint = km_df_sorted["endpoint"].iloc[0]
        
        # Extract KM curve data for step-function interpolation
        km_times = km_df_sorted["time_months"].values
        km_survival = km_df_sorted["survival"].values
        
        # Interpolate survival at each at-risk table timepoint
        # CRITICAL FIX: Use step-function (left-continuous) interpolation, not linear
        # KM curves are step functions - survival stays constant until an event occurs
        result_rows = []
        
        for _, row in atrisk_df_copy.iterrows():
            t = row["time_months"]
            n_risk = row["n_risk"]
            
            # Check if this timepoint exactly matches a KM curve point
            exact_match_idx = np.where(np.abs(km_times - t) < 1e-6)[0]
            if len(exact_match_idx) > 0:
                # Use exact KM value if timepoints match
                survival = km_survival[exact_match_idx[0]]
            else:
                # Step-function interpolation: find the most recent KM point <= t
                # This preserves the step-function nature of KM curves
                mask = km_times <= t
                if np.any(mask):
                    # Use survival from the most recent timepoint <= t
                    survival = km_survival[mask][-1]
                else:
                    # If t is before first KM point, use first survival value
                    survival = km_survival[0] if len(km_survival) > 0 else 1.0
            
            result_rows.append({
                "time_months": t,
                "survival": survival,
                "n_risk": int(n_risk),
                "arm": arm_name,
                "endpoint": endpoint,
            })
        
        result_df = pd.DataFrame(result_rows)
        
        # Ensure survival is monotonically non-increasing
        result_df["survival"] = result_df["survival"].cummin()
        
        # Ensure n_risk is monotonically non-increasing
        result_df["n_risk"] = result_df["n_risk"].cummin()
        
        self.log("", f"✅ Using at-risk table as primary grid: {len(result_df)} timepoints")
        self.log("", f"   At-risk range: {result_df['n_risk'].iloc[0]} → {result_df['n_risk'].iloc[-1]} patients")
        self.log("", f"   Survival range: {result_df['survival'].iloc[0]:.3f} → {result_df['survival'].iloc[-1]:.3f}")
        
        return result_df
    
    def _validate_reconstruction(self, ipd_df: pd.DataFrame, km_df: pd.DataFrame) -> None:
        """Validate IPD reconstruction against original KM curve.
        
        Args:
            ipd_df: Reconstructed IPD
            km_df: Original KM data (with n_risk from published table)
        """
        from lifelines import KaplanMeierFitter
        
        # Fit KM to reconstructed data
        kmf = KaplanMeierFitter()
        kmf.fit(ipd_df["time"], ipd_df["event"])
        
        # Compare survival estimates at original timepoints
        original_times = km_df["time_months"].values
        original_survival = km_df["survival"].values
        
        reconstructed_survival = kmf.survival_function_at_times(original_times).values
        
        # Calculate mean absolute error for survival
        survival_mae = np.mean(np.abs(original_survival - reconstructed_survival))
        
        # ENHANCED: Also validate at-risk numbers if available
        if "n_risk" in km_df.columns:
            self._validate_atrisk_numbers(ipd_df, km_df)
        
        # Set validation thresholds based on endpoint type
        if "PFS" in str(km_df["endpoint"].iloc[0]):
            warning_threshold = 0.10
            failure_threshold = 0.30
        else:
            warning_threshold = 0.05
            failure_threshold = 0.15
        
        if survival_mae > failure_threshold:
            raise ValueError(f"IPD reconstruction validation failed. Survival MAE: {survival_mae:.3f} (failure threshold: {failure_threshold:.3f})")
        elif survival_mae > warning_threshold:
            self.log("", f"⚠️ IPD reconstruction quality warning: Survival MAE: {survival_mae:.3f} (threshold: {warning_threshold:.3f})")
            self.log("", f"Proceeding with analysis but results should be interpreted cautiously")
        else:
            self.log("", f"✅ IPD reconstruction validated: Survival MAE: {survival_mae:.3f}")
        
        return True
    
    def _validate_atrisk_numbers(self, ipd_df: pd.DataFrame, km_df: pd.DataFrame) -> None:
        """Validate reconstructed at-risk numbers against published table.
        
        This is a critical validation step to ensure the IPD accurately reflects
        the censoring pattern from the original study.
        
        Args:
            ipd_df: Reconstructed IPD
            km_df: KM data with n_risk from published table
        """
        if "n_risk" not in km_df.columns:
            return
        
        # Calculate at-risk from IPD at each table timepoint
        published_times = km_df["time_months"].values
        published_nrisk = km_df["n_risk"].values
        
        discrepancies = []
        
        for t, published_n in zip(published_times, published_nrisk):
            # Count patients still at risk at time t in reconstructed IPD
            # At-risk = patients with time >= t
            ipd_atrisk = len(ipd_df[ipd_df["time"] >= t])
            
            # Calculate absolute and relative difference
            abs_diff = ipd_atrisk - published_n
            rel_diff = abs_diff / published_n if published_n > 0 else 0
            
            discrepancies.append({
                "time": t,
                "published": published_n,
                "reconstructed": ipd_atrisk,
                "abs_diff": abs_diff,
                "rel_diff": rel_diff,
            })
        
        # Log summary
        discrepancy_df = pd.DataFrame(discrepancies)
        mean_abs_diff = discrepancy_df["abs_diff"].abs().mean()
        mean_rel_diff = discrepancy_df["rel_diff"].abs().mean()
        max_rel_diff = discrepancy_df["rel_diff"].abs().max()
        
        self.log("", f"📊 At-risk validation: Mean diff = {mean_abs_diff:.1f} patients ({mean_rel_diff*100:.1f}%)")
        
        # Warn if discrepancies are large
        if max_rel_diff > 0.20:  # More than 20% difference at any point
            self.log("", f"⚠️ Large at-risk discrepancy detected (max {max_rel_diff*100:.1f}%)")
            self.log("", f"   This may affect model fitting accuracy")
            # Log the worst discrepancy points
            worst = discrepancy_df.nlargest(3, "rel_diff", keep="first")
            for _, row in worst.iterrows():
                self.log("", f"   t={row['time']:.1f}mo: published={row['published']}, reconstructed={row['reconstructed']}")
        elif mean_rel_diff > 0.10:  # More than 10% average difference
            self.log("", f"⚠️ Moderate at-risk discrepancies (mean {mean_rel_diff*100:.1f}%)")
        else:
            self.log("", f"✅ At-risk numbers match published table well")
    
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
        from ..models.schemas import KMPoint  # type: ignore
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

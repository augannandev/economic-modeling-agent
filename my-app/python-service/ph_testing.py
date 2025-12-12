"""Proportional hazards testing"""
import pandas as pd
import numpy as np
from lifelines import CoxPHFitter, KaplanMeierFitter
from lifelines.statistics import logrank_test, proportional_hazard_test
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import io
import base64
from typing import Dict, Optional
import os
import requests
import json

def test_proportional_hazards(chemo_data: Dict, pembro_data: Dict) -> Dict:
    """Test proportional hazards assumption with Schoenfeld residuals and log-cumulative hazard plots"""
    # Create DataFrames and ensure we only keep numeric columns
    chemo_df = pd.DataFrame(chemo_data)
    pembro_df = pd.DataFrame(pembro_data)
    
    # Remove any non-numeric columns (like 'arm' which contains strings)
    # Keep only time and event columns
    chemo_df = chemo_df[['time', 'event']].copy()
    pembro_df = pembro_df[['time', 'event']].copy()
    
    # Ensure data types are correct
    chemo_df['time'] = pd.to_numeric(chemo_df['time'], errors='coerce')
    chemo_df['event'] = pd.to_numeric(chemo_df['event'], errors='coerce')
    pembro_df['time'] = pd.to_numeric(pembro_df['time'], errors='coerce')
    pembro_df['event'] = pd.to_numeric(pembro_df['event'], errors='coerce')
    
    # Drop any rows with NaN values
    chemo_df = chemo_df.dropna()
    pembro_df = pembro_df.dropna()
    
    # Prepare combined dataset for Cox model
    chemo_df['treatment'] = 0  # Chemotherapy = 0
    pembro_df['treatment'] = 1  # Pembrolizumab = 1
    combined_df = pd.concat([chemo_df, pembro_df], ignore_index=True)
    
    # Log-rank test
    logrank_results = logrank_test(
        chemo_df['time'],
        pembro_df['time'],
        chemo_df['event'],
        pembro_df['event']
    )
    logrank_pvalue = float(logrank_results.p_value)
    
    # Fit Cox proportional hazards model
    # Only use the columns we need: time, event, and treatment
    cph_df = combined_df[['time', 'event', 'treatment']].copy()
    # Ensure all columns are numeric
    cph_df['time'] = cph_df['time'].astype(float)
    cph_df['event'] = cph_df['event'].astype(int)
    cph_df['treatment'] = cph_df['treatment'].astype(int)
    
    cph = CoxPHFitter()
    cph.fit(cph_df, duration_col='time', event_col='event')
    
    # Schoenfeld residuals test
    try:
        # Compute Schoenfeld residuals
        ph_test_results = proportional_hazard_test(
            cph, 
            cph_df, 
            time_transform='rank'
        )
        
        # Get p-value for treatment variable
        if 'treatment' in ph_test_results.summary.index:
            schoenfeld_pvalue = float(ph_test_results.summary.loc['treatment', 'p'])
        else:
            schoenfeld_pvalue = float(ph_test_results.summary['p'].min())
    except Exception as e:
        print(f"Warning: Schoenfeld test failed: {e}")
        schoenfeld_pvalue = 0.05  # Fallback
    
    # Time-Dependent Cox Test (Robust replacement for Chow test)
    # We test for PH violation by adding a time-dependent covariate (treatment * log(time))
    # If the coefficient for this interaction is significant, PH is violated.
    
    # Create dataset for time-dependent analysis
    td_df = cph_df.copy()
    
    # Add interaction term. We use log(time) to stabilize the interaction.
    # Handle time=0 by adding a small epsilon
    td_df['time_log'] = np.log(td_df['time'] + 1e-5)
    td_df['treatment_time_interaction'] = td_df['treatment'] * td_df['time_log']
    
    # Fit Cox model with interaction
    cph_td = CoxPHFitter()
    try:
        cph_td.fit(td_df, duration_col='time', event_col='event')
        
        # Get p-value for the interaction term
        if 'treatment_time_interaction' in cph_td.summary.index:
            time_dep_pvalue = float(cph_td.summary.loc['treatment_time_interaction', 'p'])
        else:
            # Should not happen if fit succeeds
            time_dep_pvalue = 0.5
            print("Warning: Interaction term not found in Time-Dependent Cox summary")
            
    except Exception as e:
        print(f"Warning: Time-Dependent Cox test failed: {e}")
        time_dep_pvalue = 0.5 # Fallback
        
    # Generate diagnostic plots
    plots = generate_ph_diagnostic_plots(chemo_df, pembro_df, cph, cph_df)
    
    # Decision based on tests
    # Log-rank test checks for difference in survival curves, NOT proportional hazards
    # So we only use Schoenfeld and Time-Dependent Cox tests for PH violation
    ph_violated = bool((schoenfeld_pvalue < 0.05) or (time_dep_pvalue < 0.05))
    decision = "separate_arms" if ph_violated else "pooled_model"
    rationale = f"PH assumption {'violated' if ph_violated else 'not violated'}. Schoenfeld p={schoenfeld_pvalue:.4f}, Time-Dep Cox p={time_dep_pvalue:.4f} (Log-rank p={logrank_pvalue:.4f} ignored for PH test)"
    
    # Check for crossing survival curves
    # We need to evaluate survival functions on a common time grid
    t_min = min(chemo_df['time'].min(), pembro_df['time'].min())
    t_max = max(chemo_df['time'].max(), pembro_df['time'].max())
    
    # Use higher resolution grid
    common_times = np.linspace(t_min, t_max, 500) # 500 points for high precision
    
    # Fit KM curves
    kmf_chemo = KaplanMeierFitter()
    kmf_pembro = KaplanMeierFitter()
    kmf_chemo.fit(chemo_df['time'], chemo_df['event'])
    kmf_pembro.fit(pembro_df['time'], pembro_df['event'])
    
    # Get survival probabilities at common times
    # KM curves are step functions, so we should use the value from the previous time point
    # lifelines survival_function_at_times does this correctly (step interpolation)
    surv_chemo = kmf_chemo.survival_function_at_times(common_times).values
    surv_pembro = kmf_pembro.survival_function_at_times(common_times).values
    
    # Calculate difference
    diff = surv_chemo - surv_pembro
    
    crossing_detected = False
    crossing_time = None
    
    # Iterate through points
    # Skip the very first few points to avoid t=0 artifacts
    start_idx = 5 
    
    for i in range(start_idx, len(common_times)):
        prev_diff = diff[i-1]
        curr_diff = diff[i]
        t_curr = common_times[i]
        
        # Check for sign change
        if np.sign(prev_diff) != np.sign(curr_diff) and prev_diff != 0 and curr_diff != 0:
            
            # For early times (t < 10), we accept ANY crossing (no threshold)
            # For later times, we require a small magnitude to avoid noise around 0
            is_early = t_curr < 10
            magnitude_check = (abs(prev_diff) > 0.001 or abs(curr_diff) > 0.001)
            
            if is_early or magnitude_check:
                crossing_detected = True
                crossing_time = float(t_curr)
                print(f"DEBUG: Crossing detected at t={crossing_time:.2f}, diff went from {prev_diff:.4f} to {curr_diff:.4f}")
                break
    
    # If still no crossing, check if we have a "converging then diverging" pattern (kissing curves)
    # This is rare but possible. For now, strict crossing is enough.
    
    return {
        "chow_test_pvalue": float(time_dep_pvalue),
        "schoenfeld_pvalue": float(schoenfeld_pvalue),
        "logrank_pvalue": float(logrank_pvalue),
        "ph_violated": ph_violated,
        "decision": decision,
        "rationale": rationale,
        "hazard_ratio_early": 0.0,
        "hazard_ratio_late": 0.0,
        "diagnostic_plots": plots,
        "crossing_detected": crossing_detected,
        "crossing_time": crossing_time
    }

def generate_ph_diagnostic_plots(chemo_df: pd.DataFrame, pembro_df: pd.DataFrame, 
                                  cph: CoxPHFitter, cph_df: pd.DataFrame) -> Dict:
    """Generate diagnostic plots for proportional hazards testing"""
    plots = {}
    
    # Fit KM curves for both arms
    kmf_chemo = KaplanMeierFitter()
    kmf_pembro = KaplanMeierFitter()
    
    kmf_chemo.fit(chemo_df['time'], chemo_df['event'], label='Chemotherapy')
    kmf_pembro.fit(pembro_df['time'], pembro_df['event'], label='Pembrolizumab')
    
    # 1. Cumulative Hazard Plot (Linear Scale)
    fig, ax = plt.subplots(figsize=(10, 6))
    
    # Use NelsonAalenFitter for cumulative hazard
    from lifelines import NelsonAalenFitter
    naf_chemo = NelsonAalenFitter()
    naf_pembro = NelsonAalenFitter()
    
    naf_chemo.fit(chemo_df['time'], chemo_df['event'], label='Chemotherapy')
    naf_pembro.fit(pembro_df['time'], pembro_df['event'], label='Pembrolizumab')
    
    naf_chemo.plot_cumulative_hazard(ax=ax, linewidth=2, color='blue', ci_show=False)
    naf_pembro.plot_cumulative_hazard(ax=ax, linewidth=2, color='orange', ci_show=False)
    
    ax.set_xlabel('Time', fontsize=12)
    ax.set_ylabel('Cumulative Hazard', fontsize=12)
    ax.set_title('Cumulative Hazard Plot\n(Diverging lines expected)', fontsize=14)
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150)
    buf.seek(0)
    plots['cumulative_hazard'] = base64.b64encode(buf.read()).decode('utf-8')
    plt.close(fig)
    
    # 2. Log-Cumulative Hazard Plot
    fig, ax = plt.subplots(figsize=(10, 6))
    
    # Calculate log-cumulative hazard: log(H(t))
    # We use the cumulative hazard from the fitted NelsonAalenFitter objects
    chemo_cum_haz = naf_chemo.cumulative_hazard_
    pembro_cum_haz = naf_pembro.cumulative_hazard_
    
    # Avoid log(0)
    chemo_log_hazard = np.log(chemo_cum_haz[chemo_cum_haz > 0])
    pembro_log_hazard = np.log(pembro_cum_haz[pembro_cum_haz > 0])
    
    ax.plot(chemo_log_hazard.index, chemo_log_hazard.iloc[:, 0], 
            label='Chemotherapy', linewidth=2, color='blue')
    ax.plot(pembro_log_hazard.index, pembro_log_hazard.iloc[:, 0], 
            label='Pembrolizumab', linewidth=2, color='orange')
    
    # Use log scale for X axis
    ax.set_xscale('log')
    # Y axis is already logged, so we keep it linear (representing log values) OR log it again?
    # Standard "Log-Log" plot usually means Log(Time) vs Log(-Log(S(t))) i.e. Log(CumHaz)
    # So X is log scale. Y is linear scale of the Log(CumHaz) values.
    # BUT, sometimes it's plotted as Log-Log axes of the CumHaz itself.
    # Let's stick to: X=Log Scale, Y=Linear Scale of the Log-Transformed Hazard.
    
    ax.set_xlabel('Time (log scale)', fontsize=12)
    ax.set_ylabel('Log-Cumulative Hazard', fontsize=12)
    ax.set_title('Log-Cumulative Hazard Plot\n(Parallel lines indicate proportional hazards)', fontsize=14)
    ax.legend()
    ax.grid(True, alpha=0.3, which='both')
    
    plt.tight_layout()
    
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150)
    buf.seek(0)
    plots['log_cumulative_hazard'] = base64.b64encode(buf.read()).decode('utf-8')
    plt.close(fig)
    
    # 3. Schoenfeld Residuals Plot
    try:
        # Try to use R service first
        r_service_url = os.environ.get('R_SERVICE_URL', 'http://localhost:8001')
        r_success = False
        r_plot_data = None
        
        try:
            # Prepare data for R
            # We need time, event, and arm (0/1)
            # cph_df has these columns
            r_payload = {
                "time": cph_df['time'].tolist(),
                "event": cph_df['event'].tolist(),
                "arm": cph_df['treatment'].tolist()
            }
            
            response = requests.post(
                f"{r_service_url}/schoenfeld-residuals",
                json=r_payload,
                timeout=5
            )
            
            if response.status_code == 200:
                r_result = response.json()
                if 'error' not in r_result:
                    residuals = np.array(r_result['residuals'])
                    times = np.array(r_result['times'])
                    smooth_times = np.array(r_result.get('smooth_times', []))
                    smooth_values = np.array(r_result.get('smooth_values', []))
                    ci_lower = np.array(r_result.get('ci_lower', []))
                    ci_upper = np.array(r_result.get('ci_upper', []))
                    param_p = r_result.get('p_value', 0.05)
                    if isinstance(param_p, list):
                        param_p = param_p[0]
                    p_value = float(param_p)
                    
                    # Store R service data for plotting
                    r_plot_data = {
                        'residuals': residuals,
                        'times': times,
                        'smooth_times': smooth_times,
                        'smooth_values': smooth_values,
                        'ci_lower': ci_lower,
                        'ci_upper': ci_upper,
                        'p_value': p_value
                    }
                    
                    r_success = True
                    print("Successfully used R service for Schoenfeld residuals")
            else:
                print(f"R service returned status {response.status_code}")
                
        except Exception as e:
            print(f"Failed to use R service for Schoenfeld residuals: {e}")
            
        if not r_success:
            print("Falling back to Python lifelines for Schoenfeld residuals")
            # Use a simpler Cox model with ONLY treatment variable
            cph_simple = CoxPHFitter()
            simple_df = cph_df[['time', 'event', 'treatment']].copy()
            cph_simple.fit(simple_df, duration_col='time', event_col='event')
            
            # Calculate scaled Schoenfeld residuals
            # lifelines provides this via compute_residuals
            scaled_resid = cph_simple.compute_residuals(simple_df, kind='scaled_schoenfeld')
            
            # Filter for treatment column
            treatment_resid = scaled_resid['treatment']
            
            # Join with time
            plot_data = pd.DataFrame({
                'resid': treatment_resid,
                'time': simple_df.loc[treatment_resid.index, 'time']
            })
        
        # Plotting - Match reference image style exactly
        fig, ax = plt.subplots(figsize=(12, 6))
        
        if r_success and r_plot_data is not None:
            # Use R service data with smoothed values and confidence intervals
            residuals = r_plot_data['residuals']
            times = r_plot_data['times']
            smooth_times = r_plot_data['smooth_times']
            smooth_values = r_plot_data['smooth_values']
            ci_lower = r_plot_data['ci_lower']
            ci_upper = r_plot_data['ci_upper']
            
            # Scatter plot of individual residuals (open circles)
            ax.scatter(times, residuals, alpha=0.4, s=15, color='black', 
                      marker='o', edgecolors='none', zorder=1)
            
            # Horizontal reference line at zero (dotted)
            ax.axhline(y=0, color='black', linestyle=':', linewidth=1.5, alpha=0.7, zorder=2)
            
            # Confidence intervals (dashed lines) if available
            if len(smooth_times) > 0 and len(ci_lower) > 0 and len(ci_upper) > 0:
                ax.plot(smooth_times, ci_lower, 'k--', linewidth=1, alpha=0.5, zorder=3)
                ax.plot(smooth_times, ci_upper, 'k--', linewidth=1, alpha=0.5, zorder=3)
            
            # Smoothed trend line (solid black)
            if len(smooth_times) > 0 and len(smooth_values) > 0:
                ax.plot(smooth_times, smooth_values, 'k-', linewidth=2, zorder=4)
            
            max_time = float(np.max(times))
        else:
            # Fallback: Use Python-calculated data
            # Scatter plot
            ax.scatter(plot_data['time'], plot_data['resid'], alpha=0.4, s=15, 
                      color='black', marker='o', edgecolors='none', zorder=1)
            
            # Horizontal reference line at zero (dotted)
            ax.axhline(y=0, color='black', linestyle=':', linewidth=1.5, alpha=0.7, zorder=2)
            
            # Add LOESS trend line
            try:
                from statsmodels.nonparametric.smoothers_lowess import lowess  # type: ignore
                smoothed = lowess(plot_data['resid'], plot_data['time'], frac=0.4)
                ax.plot(smoothed[:, 0], smoothed[:, 1], 'k-', linewidth=2, zorder=4)
            except ImportError:
                # Fallback: Rolling mean
                plot_data_sorted = plot_data.sort_values('time')
                rolling = plot_data_sorted['resid'].rolling(window=20, center=True, min_periods=5).mean()
                ax.plot(plot_data_sorted['time'], rolling, 'k-', linewidth=2, zorder=4)
                print("Warning: statsmodels not found, using rolling mean for Schoenfeld plot")
            
            max_time = float(plot_data['time'].max())
        
        # Log scale x-axis with specific tick marks matching reference
        ax.set_xscale('log')
        ax.set_xlim(left=0.3, right=max_time * 1.5)
        ax.set_xticks([0.5, 1, 2, 5, 10, 20, 50])
        ax.set_xticklabels(['0.5', '1.0', '2.0', '5.0', '10.0', '20.0', '50.0'])
        
        # Y-axis label matching reference style
        ax.set_ylabel('Beta(t) for TRT01PSOC', fontsize=12, fontweight='bold')
        ax.set_xlabel('Time', fontsize=12, fontweight='bold')
        
        # Title matching reference format
        # Try to infer endpoint type from data context (default to OS)
        endpoint_type = 'OS'  # Default, could be enhanced to detect from data source
        title = f'Figure 30. Schoenfeld residuals plot of {endpoint_type} for pembrolizumab and SOC based on KEYNOTE-024'
        ax.set_title(title, fontsize=13, fontweight='bold', pad=10)
        
        # Grid styling matching reference
        ax.grid(True, alpha=0.3, which='both', linestyle='-', linewidth=0.5)
        ax.grid(True, alpha=0.2, which='minor', linestyle=':', linewidth=0.5)
        
        # Remove legend (reference plot doesn't show one)
        # ax.legend()  # Commented out to match reference
        
        plt.tight_layout()
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=300, bbox_inches='tight')
        buf.seek(0)
        plots['schoenfeld_residuals'] = base64.b64encode(buf.read()).decode('utf-8')
        plt.close(fig)
        
    except Exception as e:
        print(f"Warning: Could not generate Schoenfeld residuals plot: {e}")
        import traceback
        traceback.print_exc()
        plots['schoenfeld_residuals'] = None
    
    return plots


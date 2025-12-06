"""Piecewise survival model fitting with cutpoint detection"""
import pandas as pd
import numpy as np
from scipy import stats
from survival_models import fit_one_piece_model
from typing import Dict

def detect_cutpoint_chow_test(data: Dict, weeks_start: int = 12, weeks_end: int = 52) -> float:
    """
    Detect optimal cutpoint using a rigorous Likelihood Ratio Test (Chow Test for Survival).
    Scans potential cutpoints and finds the one that maximizes the improvement in model fit
    (Likelihood Ratio) when allowing hazard rates to differ before and after the cutpoint.
    """
    df = pd.DataFrame(data)
    
    # Convert time to weeks if needed
    max_time = df['time'].max()
    is_months = max_time < 100
    if is_months:  # Assume months, convert to weeks
        df['time_weeks'] = df['time'] * 4.33
    else:
        df['time_weeks'] = df['time']
        
    # Add small epsilon to avoid zero duration errors in ExponentialFitter
    df['time_weeks'] = df['time_weeks'] + 1e-5
    
    # Import fitter for scanning
    from lifelines import ExponentialFitter
    
    best_cutpoint = weeks_start
    max_lrt = -1.0
    
    # Fit null model (constant hazard over full duration)
    null_fitter = ExponentialFitter().fit(df['time_weeks'], df['event'])
    ll_null = null_fitter.log_likelihood_
    
    # Scan through potential cutpoints
    # We step by 2 weeks to be efficient but granular enough
    search_range = range(weeks_start, min(weeks_end, int(df['time_weeks'].max())), 2)
    
    for cutpoint in search_range:
        # Split data
        pre_mask = df['time_weeks'] <= cutpoint
        pre_data = df[pre_mask]
        post_data = df[~pre_mask].copy()
        
        # Ensure sufficient events in both segments for stable fitting
        if pre_data['event'].sum() < 5 or post_data['event'].sum() < 5:
            continue
            
        try:
            # Fit early segment
            # For early segment, we treat it as right-censored at cutpoint? 
            # No, the data is already split. Deaths before cutpoint are events.
            # Censored before cutpoint are censored.
            # Those surviving past cutpoint are censored at cutpoint for the early fit?
            # Actually, for a piecewise constant hazard model:
            # L_total = L_early + L_late
            
            # 1. Early Fit:
            # Patients who die before cutpoint: observed death.
            # Patients who survive past cutpoint: censored at cutpoint.
            early_time = df['time_weeks'].clip(upper=cutpoint)
            early_event = df['event'].copy()
            early_event[df['time_weeks'] > cutpoint] = 0 # Censored at cutpoint
            
            early_fitter = ExponentialFitter().fit(early_time, early_event)
            ll_early = early_fitter.log_likelihood_
            
            # 2. Late Fit:
            # Only patients who survived to cutpoint are included (conditional probability).
            # Time is shifted: t_new = t_old - cutpoint
            post_data['time_shifted'] = post_data['time_weeks'] - cutpoint
            
            late_fitter = ExponentialFitter().fit(post_data['time_shifted'], post_data['event'])
            ll_late = late_fitter.log_likelihood_
            
            # Calculate Likelihood Ratio Statistic
            # LRT = 2 * (LL_alternative - LL_null)
            # LL_alternative = LL_early + LL_late
            ll_alt = ll_early + ll_late
            lrt = 2 * (ll_alt - ll_null)
            
            if lrt > max_lrt:
                max_lrt = lrt
                best_cutpoint = cutpoint
                
        except Exception:
            continue
    
    # Convert back to original time units
    if is_months:
        return best_cutpoint / 4.33
    return float(best_cutpoint)

def fit_piecewise_model(data: Dict, arm: str, distribution: str, cutpoint: float) -> Dict:
    """Fit piecewise parametric model"""
    df = pd.DataFrame(data)
    
    # Split data at cutpoint
    pre_data = df[df['time'] <= cutpoint].copy()
    post_data = df[df['time'] > cutpoint].copy()
    
    # Use KM for pre-cutpoint period
    from lifelines import KaplanMeierFitter
    kmf = KaplanMeierFitter()
    kmf.fit(pre_data['time'], pre_data['event'])
    
    # Fit parametric model for post-cutpoint period
    # Adjust time to start from cutpoint
    post_data_adjusted = post_data.copy()
    post_data_adjusted['time'] = post_data_adjusted['time'] - cutpoint
    
    model_result = fit_one_piece_model(
        {
            "time": post_data_adjusted['time'].tolist(),
            "event": post_data_adjusted['event'].tolist(),
            "arm": post_data_adjusted['arm'].tolist()
        },
        arm,
        distribution
    )
    
    # Update model result with cutpoint
    model_result["cutpoint"] = cutpoint
    model_result["approach"] = "piecewise"
    
    return model_result


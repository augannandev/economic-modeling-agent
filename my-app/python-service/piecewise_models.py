"""Piecewise survival model fitting with cutpoint detection"""
import pandas as pd
import numpy as np
from scipy import stats
from survival_models import fit_one_piece_model
from typing import Dict, Optional

# Safe imports for fitters
try:
    from lifelines import ExponentialFitter, WeibullFitter, LogNormalFitter, LogLogisticFitter
except ImportError:
    # Essential fitters missing, let it fail at module level or handle downstream
    ExponentialFitter = None

try:
    from lifelines import GeneralizedGammaFitter
except ImportError:
    GeneralizedGammaFitter = None

try:
    from custom_gompertz import GompertzFitter
except ImportError:
    GompertzFitter = None

def detect_cutpoint_chow_test(data: Dict, weeks_start: int = 12, weeks_end: int = 52) -> Dict:
    """
    Detect optimal cutpoint using a rigorous Likelihood Ratio Test (Chow Test for Survival).
    Scans potential cutpoints and finds the one that maximizes the improvement in model fit
    (Likelihood Ratio) when allowing hazard rates to differ before and after the cutpoint.
    
    Returns:
        Dict containing:
        - cutpoint: float (in original time units, typically months)
        - cutpoint_weeks: float (in weeks)
        - lrt_statistic: float (Likelihood Ratio Test statistic)
        - lrt_pvalue: float (p-value from chi-squared with 1 df)
        - ll_null: float (log-likelihood of one-piece model)
        - ll_alternative: float (log-likelihood of piecewise model)
        - n_events_pre: int (events before cutpoint)
        - n_events_post: int (events after cutpoint)
        - n_at_risk_pre: int (patients at risk before cutpoint)
        - n_at_risk_post: int (patients at risk after cutpoint)
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
    best_ll_alt = None
    best_n_events_pre = 0
    best_n_events_post = 0
    best_n_at_risk_pre = 0
    best_n_at_risk_post = 0
    
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
        
        # Count events and at-risk in each segment
        n_events_pre = int(pre_data['event'].sum())
        n_events_post = int(post_data['event'].sum())
        n_at_risk_pre = len(pre_data)
        n_at_risk_post = len(post_data)
        
        # Ensure sufficient events in both segments for stable fitting
        if n_events_pre < 5 or n_events_post < 5:
            continue
            
        try:
            # Fit early segment
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
                best_ll_alt = ll_alt
                best_n_events_pre = n_events_pre
                best_n_events_post = n_events_post
                best_n_at_risk_pre = n_at_risk_pre
                best_n_at_risk_post = n_at_risk_post
                
        except Exception:
            continue
    
    # Calculate p-value from LRT statistic (chi-squared with 1 degree of freedom)
    # The piecewise model has 2 parameters (lambda_early, lambda_late) vs 1 for null (lambda)
    lrt_pvalue = 1 - stats.chi2.cdf(max_lrt, df=1) if max_lrt > 0 else 1.0
    
    # Convert cutpoint back to original time units
    cutpoint_months = best_cutpoint / 4.33 if is_months else best_cutpoint
    
    return {
        "cutpoint": float(cutpoint_months),
        "cutpoint_weeks": float(best_cutpoint),
        "lrt_statistic": float(max_lrt),
        "lrt_pvalue": float(lrt_pvalue),
        "ll_null": float(ll_null),
        "ll_alternative": float(best_ll_alt) if best_ll_alt is not None else float(ll_null),
        "n_events_pre": best_n_events_pre,
        "n_events_post": best_n_events_post,
        "n_at_risk_pre": best_n_at_risk_pre,
        "n_at_risk_post": best_n_at_risk_post
    }

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
            "event": post_data_adjusted['event'].tolist()
        },
        arm,
        distribution
    )
    
    # Calculate predictions
    # S(t) = S_km(cutpoint) * S_parametric(t - cutpoint)
    # S_parametric(0) = 1
    
    # Get KM survival at cutpoint
    # Use the KM fitter from pre-period
    try:
        prob_at_cutpoint = float(kmf.predict(cutpoint))
    except:
        prob_at_cutpoint = float(kmf.survival_function_.iloc[-1].iloc[0]) if not kmf.survival_function_.empty else 0.0

    predictions = {}
    for t in [60, 120]:
        if t <= cutpoint:
            # Use KM prediction directly if t <= cutpoint (unlikely for extrapolation task but possible)
            pred = float(kmf.predict(t))
        else:
            # Extrapolate
            t_adj = t - cutpoint
            # Get parametric survival
            # We need the fitter object, but fit_one_piece_model returns a dict.
            # Ideally we refit or extract params. 
            # But fit_one_piece_model returns predictions for the adjusted time frame!
            # Let's extract them from model_result if we can trust it matches our t_adj
            # But model_result['predictions'] used t=60 and t=120 on the ADJUSTED timeline.
            # That corresponds to t_total = 60 + cutpoint. Not what we want.
            
            # We need S_parametric(t - cutpoint).
            # S_parametric(t) = exp(-(t/scale)^shape) etc.
            # This is hard to do generically without the fitter object.
            # Better approach: Pass specific times to fit_one_piece_model? 
            # No, fit_one_piece_model interface is fixed.
            
            # Use the 'predictions' from model_result?
            # model_result['predictions']['60'] is S_param(60). This is S(cutpoint + 60) for the whole model.
            # So predictions['60'] corresponds to t_total = cutpoint + 60.
            
            # This is tricky.
            # Re-instantiate the fitter?
            pass

    # REVISED STRATEGY: 
    # Since we can't easily access the fitter object from fit_one_piece_model result,
    # and we don't want to duplicate distributions logic.
    # We will assume that for extrapolation, t > cutpoint.
    # We can reconstruct the parametric curve if we know the distribution and parameters.
    # OR simpler: The fit_one_piece_model function just returned. It calculated predictions.
    # But those predictions are for t=60 and t=120 relative to the START of the parametric segment!
    # i.e., t_adj = 60 => t_real = cutpoint + 60.
    
    # We want prediction for t_real = 60.
    # t_adj = 60 - cutpoint.
    # If cutpoint < 60, we need S_param(60 - cutpoint).
    # The default fit_one_piece_model predicts at 60 and 120.
    # If cutpoint is e.g. 20 weeks (~4.6 months), then:
    # We have S_param(60) -> survival 60 months AFTER cutpoint (t=64.6).
    # We have S_param(120) -> survival 120 months AFTER cutpoint (t=124.6).
    
    # This is not exactly what we want.
    # However, since we are editing the files, we can modify fit_one_piece_model to accept custom prediction times!
    # But fit_one_piece_model signature is fixed in the endpoint.
    
    # Let's import the Fitter classes and recalculate.
    # Fitters mapping
    fitters = {
        'exponential': ExponentialFitter,
        'weibull': WeibullFitter,
        'log-normal': LogNormalFitter,
        'log-logistic': LogLogisticFitter
    }
    
    if GeneralizedGammaFitter:
        fitters['generalized-gamma'] = GeneralizedGammaFitter
        
    if GompertzFitter:
        fitters['gompertz'] = GompertzFitter
    
    if distribution not in fitters:
        raise ValueError(f"Distribution '{distribution}' is not supported or available in this environment.")
        
    Fitter = fitters[distribution]
    fitter = Fitter()
    
    # Re-fit the parametric part locally to get the fitter object
    # (Fast enough)
    fitter.fit(post_data_adjusted['time'], post_data_adjusted['event'])
    
    predictions = {}
    for t in [60, 120]:
        if t <= cutpoint:
             predictions[str(t)] = float(kmf.predict(t))
        else:
             t_adj = t - cutpoint
             # Get survival probability using the appropriate method
             if hasattr(fitter, 'predict_survival'):
                 # Custom GompertzFitter
                 s_param = float(fitter.predict_survival([t_adj])[0])
             elif hasattr(fitter, 'survival_function_at_times'):
                 # Standard lifelines fitters
                 result = fitter.survival_function_at_times([t_adj])
                 if hasattr(result, 'values'):
                     s_param = float(result.values.flatten()[0])
                 else:
                     s_param = float(result.flatten()[0] if hasattr(result, 'flatten') else result[0])
             else:
                 # Fallback: interpolate from survival_function_
                 sf = fitter.survival_function_
                 if t_adj <= sf.index.max():
                     s_param = float(np.interp(t_adj, sf.index, sf.iloc[:, 0]))
                 else:
                     s_param = float(sf.iloc[-1, 0])
             predictions[str(t)] = prob_at_cutpoint * s_param

    model_result["cutpoint"] = cutpoint
    model_result["approach"] = "piecewise"
    model_result["predictions"] = predictions
    
    return model_result


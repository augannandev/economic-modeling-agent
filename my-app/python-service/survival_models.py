"""Survival model fitting functions"""
import pandas as pd
import numpy as np
from lifelines import (
    KaplanMeierFitter, 
    WeibullFitter, 
    ExponentialFitter, 
    LogNormalFitter, 
    LogLogisticFitter, 
    GeneralizedGammaFitter,
    SplineFitter
)
from custom_spline_models import RoystonParmarFitter
from custom_gompertz import GompertzFitter
from typing import Dict, List, Optional
import json

def fit_spline_model(data: Dict, arm: str, scale: str, knots: int) -> Dict:
    """Fit flexible parametric spline model using SplineFitter
    
    Args:
        data: Dictionary with 'time' and 'event' arrays
        arm: Treatment arm ('chemo' or 'pembro')
        scale: Scale for spline ('hazard', 'odds', or 'normal') - note: SplineFitter models cumulative hazard
        knots: Number of internal knots (1, 2, or 3)
    
    Returns:
        Dictionary with model results
    """
    df = pd.DataFrame(data)
    
    # Handle zero times by adding a small epsilon
    times = df['time'].copy()
    times[times <= 0] = 1e-5
    
    # Use custom Royston-Parmar Fitter which supports hazard, odds, and normal scales
    
    try:
        fitter = RoystonParmarFitter(scale=scale, knots=knots)
        fitter.fit(times, df['event'])
        
        # Extract parameters
        params = {'coeffs': fitter.params_.tolist()}
        
        # Get AIC/BIC
        aic = fitter.AIC_
        bic = fitter.BIC_
        log_likelihood = fitter.log_likelihood_
        
        # Generate survival curve
        max_time = df['time'].max()
        survival_times = np.linspace(0, max_time, 100)
        survival_probs = fitter.predict_survival(survival_times)
        
        return {
            "model_id": f"{arm}_{scale}_knots{knots}_spline",
            "arm": arm,
            "approach": "spline",
            "scale": scale,
            "knots": knots,
            "parameters": params,
            "aic": aic,
            "bic": bic,
            "bic": bic,
            "log_likelihood": log_likelihood,
            "predictions": {
                "60": float(fitter.predict_survival(60).item() if hasattr(fitter.predict_survival(60), 'item') else fitter.predict_survival(60)),
                "120": float(fitter.predict_survival(120).item() if hasattr(fitter.predict_survival(120), 'item') else fitter.predict_survival(120))
            }
        }
    except Exception as e:
        # Log the error for debugging
        print(f"Error fitting spline model for {arm} with {knots} knots: {e}")
        # Fallback: return basic structure if fitting fails
        return {
            "model_id": f"{arm}_{scale}_knots{knots}_spline",
            "arm": arm,
            "approach": "spline",
            "scale": scale,
            "knots": knots,
            "parameters": {"error": str(e)},
            "aic": None,
            "bic": None,
            "log_likelihood": None
        }

def fit_km_curves(chemo_data: Dict, pembro_data: Dict) -> Dict:
    """Fit Kaplan-Meier curves for both arms"""
    chemo_df = pd.DataFrame(chemo_data)
    pembro_df = pd.DataFrame(pembro_data)
    
    kmf_chemo = KaplanMeierFitter()
    kmf_chemo.fit(chemo_df['time'], chemo_df['event'])
    
    kmf_pembro = KaplanMeierFitter()
    kmf_pembro.fit(pembro_df['time'], pembro_df['event'])
    
    # Get survival estimates
    times_chemo = kmf_chemo.timeline.tolist()
    survival_chemo = kmf_chemo.survival_function_.values.flatten().tolist()
    ci_lower_chemo = kmf_chemo.confidence_interval_.iloc[:, 0].values.tolist()
    ci_upper_chemo = kmf_chemo.confidence_interval_.iloc[:, 1].values.tolist()
    
    times_pembro = kmf_pembro.timeline.tolist()
    survival_pembro = kmf_pembro.survival_function_.values.flatten().tolist()
    ci_lower_pembro = kmf_pembro.confidence_interval_.iloc[:, 0].values.tolist()
    ci_upper_pembro = kmf_pembro.confidence_interval_.iloc[:, 1].values.tolist()
    
    return {
        "chemo": {
            "times": times_chemo,
            "survival": survival_chemo,
            "confidence_lower": ci_lower_chemo,
            "confidence_upper": ci_upper_chemo
        },
        "pembro": {
            "times": times_pembro,
            "survival": survival_pembro,
            "confidence_lower": ci_lower_pembro,
            "confidence_upper": ci_upper_pembro
        }
    }

def fit_one_piece_model(data: Dict, arm: str, distribution: str) -> Dict:
    """Fit one-piece parametric survival model"""
    df = pd.DataFrame(data)
    
    # Map distribution names to fitters
    fitters = {
        'exponential': ExponentialFitter,
        'weibull': WeibullFitter,
        'log-normal': LogNormalFitter,
        'log-logistic': LogLogisticFitter,
        'gompertz': GompertzFitter,
        'generalized-gamma': GeneralizedGammaFitter
    }
    
    if distribution not in fitters:
        raise ValueError(f"Unknown distribution: {distribution}")
    
    Fitter = fitters[distribution]
    fitter = Fitter()
    
    # Handle zero times by adding a small epsilon, as parametric models require t > 0
    times = df['time'].copy()
    times[times <= 0] = 1e-5
    
    fitter.fit(times, df['event'])
    
    # Extract parameters
    if hasattr(fitter, 'params_'):
        if isinstance(fitter.params_, dict):
            params = fitter.params_
        else:
            params = fitter.params_.to_dict()
    else:
        params = {}
    
    # Calculate AIC/BIC
    aic = fitter.AIC_ if hasattr(fitter, 'AIC_') else None
    bic = fitter.BIC_ if hasattr(fitter, 'BIC_') else None
    log_likelihood = fitter.log_likelihood_ if hasattr(fitter, 'log_likelihood_') else None
    
    return {
        "model_id": f"{arm}_{distribution}_one_piece",
        "arm": arm,
        "approach": "one-piece",
        "distribution": distribution,
        "parameters": params,
        "aic": float(aic) if aic is not None else None,
        "bic": float(bic) if bic is not None else None,
        "log_likelihood": float(log_likelihood) if log_likelihood is not None else None,
        "predictions": {
            "60": float(fitter.predict_survival_function(60).item() if hasattr(fitter.predict_survival_function(60), 'item') else fitter.predict_survival_function(60)),
            "120": float(fitter.predict_survival_function(120).item() if hasattr(fitter.predict_survival_function(120), 'item') else fitter.predict_survival_function(120))
        }
    }


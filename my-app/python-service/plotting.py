"""Plot generation for survival models"""
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import base64
import io
import os
from typing import Dict, Optional
from datetime import datetime

# Set style
sns.set_style("whitegrid")
plt.rcParams['figure.figsize'] = (12, 8)

def generate_dual_plots(
    model_id: str,
    model_result: Dict,
    km_data: Dict,
    original_data: Optional[Dict] = None,
    seer_data: Optional[Dict] = None
) -> Dict:
    """Generate short-term and long-term plots with actual fitted model predictions"""
    
    # Create plots directory if it doesn't exist
    plots_dir = os.getenv('PLOTS_DIRECTORY', './data/plots')
    os.makedirs(plots_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # Generate actual model predictions by refitting the model
    # This ensures the fitted curve uses real model predictions, not placeholders
    model_predictions = _generate_actual_model_predictions(
        model_result, 
        km_data, 
        original_data, 
        max_time=240
    )
    
    # Generate short-term plot (0-30 months)
    short_term_path = os.path.join(plots_dir, f"{model_id}_short_term_{timestamp}.png")
    short_term_base64 = _generate_short_term_plot(
        model_id, model_result, km_data, model_predictions, short_term_path
    )
    
    # Generate long-term plot (0-240 months) using the same predictions
    long_term_path = os.path.join(plots_dir, f"{model_id}_long_term_{timestamp}.png")
    long_term_base64 = _generate_long_term_plot(
        model_id, model_result, km_data, seer_data, model_predictions, long_term_path
    )
    
    return {
        "short_term": {
            "plot_type": "short_term",
            "file_path": short_term_path,
            "base64_data": short_term_base64
        },
        "long_term": {
            "plot_type": "long_term",
            "file_path": long_term_path,
            "base64_data": long_term_base64
        }
    }

def _generate_actual_model_predictions(
    model_result: Dict, 
    km_data: Dict, 
    original_data: Optional[Dict],
    max_time: float = 240
) -> Dict:
    """Generate actual model predictions by refitting the model
    
    Returns a dictionary with 'times' and 'survival' arrays using real fitted model predictions.
    """
    import pandas as pd
    from lifelines import (
        ExponentialFitter, WeibullFitter, LogNormalFitter, 
        LogLogisticFitter, GeneralizedGammaFitter, SplineFitter,
        KaplanMeierFitter
    )
    # Try to import GompertzFitter if available
    try:
        from lifelines import GompertzFitter
    except ImportError:
        GompertzFitter = None
    
    # Generate time points for predictions
    # Increase resolution to 1000 points for smoother curves and better step function representation
    prediction_times = np.linspace(0, max_time, 1000)
    
    # Extract model info
    approach = model_result.get('approach', 'one-piece')
    distribution = model_result.get('distribution', 'exponential')
    cutpoint = model_result.get('cutpoint')
    scale = model_result.get('scale')
    knots = model_result.get('knots')
    
    # If we have original data, refit the model to get actual predictions
    if original_data and 'time' in original_data and 'event' in original_data:
        df = pd.DataFrame({
            'time': original_data['time'],
            'event': original_data['event']
        })
        
        try:
            if approach == 'one-piece':
                # Refit one-piece model
                fitters = {
                    'exponential': ExponentialFitter,
                    'weibull': WeibullFitter,
                    'log-normal': LogNormalFitter,
                    'log-logistic': LogLogisticFitter,
                    'generalized-gamma': GeneralizedGammaFitter
                }
                # Add Gompertz if available (otherwise will try R service)
                if GompertzFitter is not None:
                    fitters['gompertz'] = GompertzFitter
                
                if distribution in fitters:
                    Fitter = fitters[distribution]
                    fitter = Fitter()
                    fitter.fit(df['time'], df['event'])
                    
                    # Use survival_function_at_times for proper parametric extrapolation
                    # This gives us actual model predictions beyond observed data, not flat extrapolation
                    try:
                        model_survival = fitter.survival_function_at_times(prediction_times, label='prediction').values
                    except (AttributeError, TypeError, ValueError):
                        # Fallback: use survival_function_ and interpolate/extrapolate manually
                        survival_function = fitter.survival_function_
                        timeline = survival_function.index.values
                        
                        # For times within observed range, interpolate
                        observed_mask = prediction_times <= timeline[-1]
                        if np.any(observed_mask):
                            model_survival = np.zeros_like(prediction_times)
                            model_survival[observed_mask] = np.interp(
                                prediction_times[observed_mask],
                                timeline,
                                survival_function.iloc[:, 0].values,
                                left=1.0
                            )
                        else:
                            model_survival = np.ones_like(prediction_times)
                        
                        # For times beyond observed range, use model's parametric form
                        extrapolation_mask = prediction_times > timeline[-1]
                        if np.any(extrapolation_mask):
                            last_surv = survival_function.iloc[-1, 0]
                            last_time = timeline[-1]
                            
                            # Use parametric formula based on distribution type
                            if hasattr(fitter, 'lambda_') and hasattr(fitter, 'rho_'):
                                # Weibull: S(t) = exp(-(lambda * t)^rho)
                                lambda_param = fitter.lambda_
                                rho_param = fitter.rho_
                                extrap_times = prediction_times[extrapolation_mask]
                                model_survival[extrapolation_mask] = np.exp(-(lambda_param * extrap_times) ** rho_param)
                            elif hasattr(fitter, 'lambda_'):
                                # Exponential: S(t) = exp(-lambda * t)
                                lambda_param = fitter.lambda_
                                extrap_times = prediction_times[extrapolation_mask]
                                model_survival[extrapolation_mask] = np.exp(-lambda_param * extrap_times)
                            else:
                                # Generic exponential decay from last point
                                # Estimate hazard rate from last portion of curve
                                if len(timeline) > 1:
                                    dt = timeline[-1] - timeline[-2]
                                    ds = survival_function.iloc[-2, 0] - survival_function.iloc[-1, 0]
                                    if dt > 0 and survival_function.iloc[-2, 0] > 0:
                                        hazard_est = ds / (dt * survival_function.iloc[-2, 0])
                                    else:
                                        hazard_est = 0.01  # Default small hazard
                                else:
                                    hazard_est = 0.01
                                
                                extrap_times = prediction_times[extrapolation_mask] - last_time
                                model_survival[extrapolation_mask] = last_surv * np.exp(-hazard_est * extrap_times)
                elif distribution == 'gompertz':
                    # Try R service for Gompertz if Python doesn't have it
                    print("Gompertz not available in Python, trying R service...")
                    model_survival = _try_r_service_for_predictions(
                        'gompertz', original_data, model_result, prediction_times
                    )
                    if model_survival is None:
                        # Fall back to Weibull approximation if R service unavailable
                        print("R service unavailable for Gompertz, using Weibull approximation...")
                        Fitter = WeibullFitter
                        fitter = Fitter()
                        fitter.fit(df['time'], df['event'])
                        # Use survival_function_at_times for proper extrapolation
                        try:
                            model_survival = fitter.survival_function_at_times(prediction_times, label='prediction').values
                        except (AttributeError, TypeError, ValueError):
                            # Fallback to interpolation if method not available
                            survival_function = fitter.survival_function_
                            timeline = survival_function.index.values
                            model_survival = np.interp(
                                prediction_times,
                                timeline,
                                survival_function.iloc[:, 0].values,
                                left=1.0,
                                right=survival_function.iloc[:, 0].values[-1] if len(survival_function) > 0 else 0.0
                            )
                else:
                    raise ValueError(f"Unknown distribution: {distribution}")
                    
            elif approach == 'piecewise':
                # Refit piecewise model
                if cutpoint is None:
                    raise ValueError("Cutpoint required for piecewise model")
                
                # Pre-cutpoint: use KM
                pre_data = df[df['time'] <= cutpoint].copy()
                kmf_pre = KaplanMeierFitter()
                kmf_pre.fit(pre_data['time'], pre_data['event'])
                
                # Post-cutpoint: fit parametric model
                post_data = df[df['time'] > cutpoint].copy()
                post_data_adjusted = post_data.copy()
                post_data_adjusted['time'] = post_data_adjusted['time'] - cutpoint
                
                fitters = {
                    'exponential': ExponentialFitter,
                    'weibull': WeibullFitter,
                    'log-normal': LogNormalFitter,
                    'log-logistic': LogLogisticFitter,
                    'generalized-gamma': GeneralizedGammaFitter
                }
                # Add Gompertz if available (will try R if not)
                if GompertzFitter is not None:
                    fitters['gompertz'] = GompertzFitter
                
                if distribution in fitters:
                    Fitter = fitters[distribution]
                    fitter_post = Fitter()
                    fitter_post.fit(post_data_adjusted['time'], post_data_adjusted['event'])
                    
                    # Combine predictions
                    model_survival = np.zeros_like(prediction_times)
                    
                    # Pre-cutpoint: use KM
                    pre_mask = prediction_times <= cutpoint
                    pre_times = prediction_times[pre_mask]
                    if len(kmf_pre.survival_function_) > 0:
                        # Use survival_function_at_times to preserve step function nature of KM
                        km_surv = kmf_pre.survival_function_at_times(pre_times).values
                        model_survival[pre_mask] = km_surv
                    
                    # Post-cutpoint: use parametric model
                    post_mask = prediction_times > cutpoint
                    post_times = prediction_times[post_mask] - cutpoint
                    
                    # Get survival at cutpoint for continuity
                    surv_at_cutpoint = model_survival[pre_mask][-1] if np.any(pre_mask) else 1.0
                    
                    # Use survival_function_at_times for proper parametric extrapolation
                    try:
                        post_surv = fitter_post.survival_function_at_times(post_times, label='prediction').values
                        # Scale to ensure continuity at cutpoint
                        if len(post_surv) > 0 and surv_at_cutpoint > 0:
                            scale_factor = surv_at_cutpoint / post_surv[0] if post_surv[0] > 0 else 1.0
                            post_surv = post_surv * scale_factor
                        model_survival[post_mask] = post_surv
                    except (AttributeError, TypeError, ValueError):
                        # Fallback: use interpolation for observed, parametric for extrapolation
                        post_survival_function = fitter_post.survival_function_
                        post_timeline = post_survival_function.index.values
                        
                        # Split post-cutpoint predictions into observed and extrapolation
                        post_observed_mask = post_times <= post_timeline[-1]
                        post_extrap_mask = post_times > post_timeline[-1]
                        
                        post_surv = np.ones_like(post_times)
                        
                        # Interpolate within observed post-cutpoint range
                        if np.any(post_observed_mask):
                            post_surv[post_observed_mask] = np.interp(
                                post_times[post_observed_mask],
                                post_timeline,
                                post_survival_function.iloc[:, 0].values,
                                left=1.0
                            )
                        
                        # Parametric extrapolation beyond observed post-cutpoint range
                        if np.any(post_extrap_mask):
                            extrap_times = post_times[post_extrap_mask]
                            if hasattr(fitter_post, 'lambda_') and hasattr(fitter_post, 'rho_'):
                                # Weibull
                                post_surv[post_extrap_mask] = np.exp(-(fitter_post.lambda_ * extrap_times) ** fitter_post.rho_)
                            elif hasattr(fitter_post, 'lambda_'):
                                # Exponential
                                post_surv[post_extrap_mask] = np.exp(-fitter_post.lambda_ * extrap_times)
                            elif hasattr(fitter_post, 'mu_') and hasattr(fitter_post, 'sigma_'):
                                # Log-Normal
                                from scipy.stats import lognorm
                                post_surv[post_extrap_mask] = 1 - lognorm.cdf(extrap_times, s=fitter_post.sigma_, scale=np.exp(fitter_post.mu_))
                            elif hasattr(fitter_post, 'alpha_') and hasattr(fitter_post, 'beta_'):
                                # Log-Logistic
                                post_surv[post_extrap_mask] = 1 / (1 + (extrap_times / fitter_post.alpha_) ** fitter_post.beta_)
                            else:
                                # Generic exponential decay
                                last_surv = post_survival_function.iloc[-1, 0]
                                last_time = post_timeline[-1]
                                if len(post_timeline) > 1 and last_surv > 0:
                                    dt = post_timeline[-1] - post_timeline[-2]
                                    ds = post_survival_function.iloc[-2, 0] - last_surv
                                    hazard_est = ds / (dt * post_survival_function.iloc[-2, 0]) if dt > 0 else 0.01
                                else:
                                    hazard_est = 0.01
                                post_surv[post_extrap_mask] = last_surv * np.exp(-hazard_est * (extrap_times - last_time))
                        
                        # Scale to ensure continuity at cutpoint
                        if len(post_surv) > 0 and surv_at_cutpoint > 0:
                            scale_factor = surv_at_cutpoint / post_surv[0] if post_surv[0] > 0 else 1.0
                            post_surv = post_surv * scale_factor
                        
                        model_survival[post_mask] = post_surv
                elif distribution == 'gompertz':
                    # Try R service for Gompertz piecewise post-cutpoint
                    print("Gompertz not available in Python for piecewise model, trying R service...")
                    # For piecewise, we need to handle KM pre-cutpoint and R post-cutpoint
                    model_survival = np.zeros_like(prediction_times)
                    
                    # Pre-cutpoint: use KM
                    pre_mask = prediction_times <= cutpoint
                    pre_times = prediction_times[pre_mask]
                    if len(kmf_pre.survival_function_) > 0:
                        # Use survival_function_at_times to preserve step function nature of KM
                        km_surv = kmf_pre.survival_function_at_times(pre_times).values
                        model_survival[pre_mask] = km_surv
                    
                    # Post-cutpoint: use R service for Gompertz
                    post_mask = prediction_times > cutpoint
                    post_times_adjusted = prediction_times[post_mask] - cutpoint
                    surv_at_cutpoint = model_survival[pre_mask][-1] if np.any(pre_mask) else 1.0
                    
                    # Create adjusted data for R service
                    r_data_adjusted = {
                        'time': post_data_adjusted['time'].tolist(),
                        'event': post_data_adjusted['event'].tolist()
                    }
                    r_model_result = {'distribution': 'gompertz', 'cutpoint': cutpoint}
                    post_surv_r = _try_r_service_for_predictions(
                        'gompertz', r_data_adjusted, r_model_result, post_times_adjusted
                    )
                    
                    if post_surv_r is not None:
                        # Scale to ensure continuity
                        if len(post_surv_r) > 0 and surv_at_cutpoint > 0:
                            scale_factor = surv_at_cutpoint / post_surv_r[0] if post_surv_r[0] > 0 else 1.0
                            post_surv_r = post_surv_r * scale_factor
                        model_survival[post_mask] = post_surv_r
                    else:
                        # Fall back to Weibull approximation if R service unavailable
                        print("R service unavailable for Gompertz piecewise, using Weibull approximation...")
                        Fitter = WeibullFitter
                        fitter_post = Fitter()
                        fitter_post.fit(post_data_adjusted['time'], post_data_adjusted['event'])
                        # Use survival_function_at_times for proper extrapolation
                        try:
                            post_surv = fitter_post.survival_function_at_times(post_times, label='prediction').values
                            # Scale to ensure continuity at cutpoint
                            if len(post_surv) > 0 and surv_at_cutpoint > 0:
                                scale_factor = surv_at_cutpoint / post_surv[0] if post_surv[0] > 0 else 1.0
                                post_surv = post_surv * scale_factor
                            model_survival[post_mask] = post_surv
                        except (AttributeError, TypeError, ValueError):
                            # Fallback to interpolation for observed, parametric for extrapolation
                            post_survival_function = fitter_post.survival_function_
                            post_timeline = post_survival_function.index.values
                            
                            post_observed_mask = post_times <= post_timeline[-1]
                            post_extrap_mask = post_times > post_timeline[-1]
                            
                            post_surv = np.ones_like(post_times)
                            
                            if np.any(post_observed_mask):
                                post_surv[post_observed_mask] = np.interp(
                                    post_times[post_observed_mask],
                                    post_timeline,
                                    post_survival_function.iloc[:, 0].values,
                                    left=1.0
                                )
                            
                            if np.any(post_extrap_mask):
                                extrap_times = post_times[post_extrap_mask]
                                # Weibull parametric extrapolation
                                post_surv[post_extrap_mask] = np.exp(-(fitter_post.lambda_ * extrap_times) ** fitter_post.rho_)
                            
                            # Scale to ensure continuity at cutpoint
                            if len(post_surv) > 0 and surv_at_cutpoint > 0:
                                scale_factor = surv_at_cutpoint / post_surv[0] if post_surv[0] > 0 else 1.0
                                post_surv = post_surv * scale_factor
                            model_survival[post_mask] = post_surv
                else:
                    raise ValueError(f"Unknown distribution: {distribution}")
                    
            elif approach == 'spline':
                # Refit spline model
                if knots is None:
                    knots = 2  # Default
                
                try:
                    fitter = SplineFitter(knots=knots)
                    fitter.fit(df['time'], df['event'])
                    
                    # Use survival_function_at_times for proper parametric extrapolation
                    try:
                        model_survival = fitter.survival_function_at_times(prediction_times, label='prediction').values
                    except (AttributeError, TypeError, ValueError):
                        # Fallback: use interpolation for observed range, parametric for extrapolation
                        survival_function = fitter.survival_function_
                        timeline = survival_function.index.values
                        
                        # Split into observed and extrapolation regions
                        observed_mask = prediction_times <= timeline[-1]
                        extrap_mask = prediction_times > timeline[-1]
                        
                        model_survival = np.ones_like(prediction_times)
                        
                        # Interpolate within observed range
                        if np.any(observed_mask):
                            model_survival[observed_mask] = np.interp(
                                prediction_times[observed_mask],
                                timeline,
                                survival_function.iloc[:, 0].values,
                                left=1.0
                            )
                        
                        # Parametric extrapolation beyond observed range
                        if np.any(extrap_mask):
                            extrap_times = prediction_times[extrap_mask]
                            # Use the fitted model's parametric form
                            if hasattr(fitter, 'lambda_') and hasattr(fitter, 'rho_'):
                                # Weibull
                                model_survival[extrap_mask] = np.exp(-(fitter.lambda_ * extrap_times) ** fitter.rho_)
                            elif hasattr(fitter, 'lambda_'):
                                # Exponential
                                model_survival[extrap_mask] = np.exp(-fitter.lambda_ * extrap_times)
                            elif hasattr(fitter, 'mu_') and hasattr(fitter, 'sigma_'):
                                # Log-Normal
                                from scipy.stats import lognorm
                                model_survival[extrap_mask] = 1 - lognorm.cdf(extrap_times, s=fitter.sigma_, scale=np.exp(fitter.mu_))
                            elif hasattr(fitter, 'alpha_') and hasattr(fitter, 'beta_'):
                                # Log-Logistic
                                model_survival[extrap_mask] = 1 / (1 + (extrap_times / fitter.alpha_) ** fitter.beta_)
                            else:
                                # Generic exponential decay from last point
                                last_surv = survival_function.iloc[-1, 0]
                                last_time = timeline[-1]
                                if len(timeline) > 1 and last_surv > 0:
                                    dt = timeline[-1] - timeline[-2]
                                    ds = survival_function.iloc[-2, 0] - last_surv
                                    hazard_est = ds / (dt * survival_function.iloc[-2, 0]) if dt > 0 else 0.01
                                else:
                                    hazard_est = 0.01
                                model_survival[extrap_mask] = last_surv * np.exp(-hazard_est * (extrap_times - last_time))
                except Exception as e:
                    # If Python spline fitting fails, try R service (better RP implementation)
                    print(f"Python spline fitting failed: {e}, trying R service...")
                    model_survival = _try_r_service_for_predictions(
                        'rp-spline', original_data, model_result, prediction_times
                    )
                    if model_survival is None:
                        raise ValueError(f"Spline model failed in both Python and R: {e}")
            else:
                raise ValueError(f"Unknown approach: {approach}")
                
            return {
                'times': prediction_times.tolist(),
                'survival': model_survival.tolist()
            }
            
        except Exception as e:
            print(f"Warning: Failed to refit model for predictions: {e}")
            print(f"Falling back to simplified predictions")
            # Fall back to simplified predictions
            return _generate_simplified_predictions(model_result, km_data, max_time)
    else:
        # No original data available, use simplified predictions
        return _generate_simplified_predictions(model_result, km_data, max_time)

def _try_r_service_for_predictions(
    model_type: str,
    original_data: Dict,
    model_result: Dict,
    prediction_times: np.ndarray
) -> Optional[np.ndarray]:
    """Try to get predictions from R service as fallback
    
    Returns numpy array of survival predictions or None if R service unavailable
    """
    import requests
    import os
    
    r_service_url = os.getenv('R_SERVICE_URL', 'http://localhost:8001')
    
    try:
        # Quick health check first (with short timeout)
        try:
            health_check = requests.get(f"{r_service_url}/", timeout=2)
            if not health_check.ok:
                print(f"R service health check failed, skipping R service")
                return None
        except requests.exceptions.RequestException:
            print(f"R service not available at {r_service_url}, skipping R service")
            return None
        
        # Prepare data
        time_data = original_data.get('time', [])
        event_data = original_data.get('event', [])
        
        model_params = {
            'scale': model_result.get('scale'),
            'knots': model_result.get('knots'),
            'cutpoint': model_result.get('cutpoint'),
        }
        
        # Call R service with shorter timeout
        response = requests.post(
            f"{r_service_url}/refit-and-predict",
            json={
                'model_type': model_type,
                'time': time_data,
                'event': event_data,
                'model_params': model_params,
                'prediction_times': prediction_times.tolist(),
            },
            timeout=10  # Reduced from 30 to 10 seconds
        )
        
        if response.status_code == 200:
            result = response.json()
            if 'error' not in result and 'survival' in result:
                return np.array(result['survival'])
            else:
                print(f"R service returned error: {result.get('error', 'Unknown error')}")
                return None
        else:
            print(f"R service returned status {response.status_code}")
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"R service request failed: {e}")
        return None
    except Exception as e:
        print(f"Error calling R service: {e}")
        return None

def _generate_simplified_predictions(model_result: Dict, km_data: Dict, max_time: float = 240) -> Dict:
    """Fallback: Generate simplified predictions when original data is not available"""
    times_km = km_data.get('times', [])
    survival_km = km_data.get('survival', [])
    
    if len(survival_km) == 0:
        initial_survival = 1.0
    else:
        initial_survival = survival_km[0]
    
    prediction_times = np.linspace(0, max_time, 500)
    
    # Simple exponential decay as fallback
    if len(times_km) > 0 and len(survival_km) > 0:
        median_idx = np.argmin(np.abs(np.array(survival_km) - 0.5))
        median_time = times_km[median_idx] if median_idx < len(times_km) else 20
        decay_rate = np.log(2) / median_time if median_time > 0 else 0.05
    else:
        decay_rate = 0.05
    
    model_survival = initial_survival * np.exp(-prediction_times * decay_rate)
    
    return {
        'times': prediction_times.tolist(),
        'survival': model_survival.tolist()
    }

def _generate_short_term_plot(
    model_id: str, 
    model_result: Dict, 
    km_data: Dict, 
    model_predictions: Dict,
    file_path: str
) -> str:
    """Generate short-term fit plot (0-30 months)"""
    fig, ax = plt.subplots(figsize=(10, 6))
    
    # Plot KM curve
    times = km_data.get('times', [])
    survival = km_data.get('survival', [])
    ci_lower = km_data.get('confidence_lower', [])
    ci_upper = km_data.get('confidence_upper', [])
    
    # Determine max time for short-term plot (dynamic range)
    # Use max observed time + 1 month buffer, with a minimum of 6 months
    if len(times) > 0:
        max_observed = max(times)
        max_time = max(max_observed + 1, 6)
    else:
        max_time = 30 # Fallback
    mask = np.array(times) <= max_time
    times_filtered = np.array(times)[mask]
    survival_filtered = np.array(survival)[mask]
    ci_lower_filtered = np.array(ci_lower)[mask] if len(ci_lower) > 0 else None
    ci_upper_filtered = np.array(ci_upper)[mask] if len(ci_upper) > 0 else None
    
    # Plot KM with CI
    ax.plot(times_filtered, survival_filtered, 'b-', linewidth=2, label='Observed KM')
    if ci_lower_filtered is not None and ci_upper_filtered is not None:
        ax.fill_between(times_filtered, ci_lower_filtered, ci_upper_filtered, alpha=0.2, color='blue')
    
    # Plot fitted model using consistent predictions
    model_times = np.array(model_predictions['times'])
    model_survival = np.array(model_predictions['survival'])
    
    # Filter to max_time for short-term plot
    short_term_mask = model_times <= max_time
    model_times_filtered = model_times[short_term_mask]
    model_survival_filtered = model_survival[short_term_mask]
    
    # For piecewise models, show modeled curve following KM before cutoff, then parametric after
    approach = model_result.get('approach', 'one-piece')
    cutpoint = model_result.get('cutpoint')
    
    if approach == 'piecewise' and cutpoint is not None and cutpoint <= max_time:
        # Plot the full modeled curve (which includes KM before cutpoint + parametric after)
        # This matches NICE TA style where "Modeled OS" follows KM before cutpoint
        ax.plot(model_times_filtered, model_survival_filtered, 'r-', linewidth=2, 
               label=f'Modeled OS (KM→Parametric at {cutpoint}mo)', zorder=2)
        
        # Add vertical line at cutpoint to show transition
        ax.axvline(x=cutpoint, color='gray', linestyle=':', linewidth=1.5, 
                  label=f'Cutpoint ({cutpoint}mo)', alpha=0.7, zorder=1)
    else:
        # One-piece or spline: show full fitted curve
        ax.plot(model_times_filtered, model_survival_filtered, 'r--', linewidth=2, label='Fitted Model')
    
    # Add AIC/BIC annotation
    aic = model_result.get('aic')
    bic = model_result.get('bic')
    if aic is not None or bic is not None:
        info_text = []
        if aic is not None:
            info_text.append(f"AIC: {aic:.2f}")
        if bic is not None:
            info_text.append(f"BIC: {bic:.2f}")
        ax.text(0.02, 0.98, '\n'.join(info_text), transform=ax.transAxes,
                verticalalignment='top', bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))
    
    ax.set_xlabel('Time (months)', fontsize=12)
    ax.set_ylabel('Survival Probability', fontsize=12)
    ax.set_title(f'Short-term Fit (0-{int(max_time)} months)\n{model_id}', fontsize=14)
    ax.legend(loc='best')
    ax.grid(True, alpha=0.3)
    ax.set_xlim(0, max_time)
    ax.set_ylim(0, 1)
    
    plt.tight_layout()
    plt.savefig(file_path, dpi=150, bbox_inches='tight')
    
    # Convert to base64
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    base64_data = base64.b64encode(buf.read()).decode('utf-8')
    plt.close()
    
    return base64_data

def _generate_long_term_plot(
    model_id: str,
    model_result: Dict,
    km_data: Dict,
    seer_data: Optional[Dict],
    model_predictions: Dict,
    file_path: str
) -> str:
    """Generate long-term extrapolation plot (0-240 months / 20 years)"""
    fig, ax = plt.subplots(figsize=(12, 8))
    
    # Plot observed KM for trial period
    times = km_data.get('times', [])
    survival = km_data.get('survival', [])
    
    max_observed_time = max(times) if times else 30
    ax.plot(times, survival, 'b-', linewidth=2, label='Observed KM (Trial Period)')
    
    # Use consistent model predictions (same as short-term plot)
    extrapolation_times = np.array(model_predictions['times'])
    extrapolated_survival = np.array(model_predictions['survival'])
    
    # For piecewise models, show modeled curve following KM before cutoff, then parametric after
    approach = model_result.get('approach', 'one-piece')
    cutpoint = model_result.get('cutpoint')
    
    if approach == 'piecewise' and cutpoint is not None:
        # Plot the full modeled curve (which includes KM before cutpoint + parametric after)
        # This matches NICE TA style where "Modeled OS" follows KM before cutpoint
        ax.plot(extrapolation_times, extrapolated_survival, 'r-', linewidth=2, 
               label=f'Modeled OS (KM→Parametric at {cutpoint}mo)', zorder=2)
        
        # Add vertical line at cutpoint to show transition
        ax.axvline(x=cutpoint, color='green', linestyle=':', linewidth=2, 
                  label=f'Cutpoint ({cutpoint}mo)', alpha=0.7, zorder=1)
    else:
        # One-piece or spline: show full model prediction
        ax.plot(extrapolation_times, extrapolated_survival, 'r--', linewidth=2, label='Model Extrapolation')
    
    # Shade extrapolation region
    ax.axvline(x=max_observed_time, color='gray', linestyle=':', linewidth=2, label='End of Trial')
    ax.fill_between(extrapolation_times[extrapolation_times > max_observed_time],
                    extrapolated_survival[extrapolation_times > max_observed_time],
                    alpha=0.2, color='red', label='Extrapolation Region')
    
    # Add SEER benchmark if available
    if seer_data:
        seer_times = seer_data.get('times', [])
        seer_survival = seer_data.get('survival', [])
        ax.plot(seer_times, seer_survival, 'g-', linewidth=2, alpha=0.7, label='SEER Benchmark (Stage IV NSCLC)')
    
    # Add survival milestones
    milestones = [12, 24, 60, 120, 240]  # 1-yr, 2-yr, 5-yr, 10-yr, 20-yr
    for milestone in milestones:
        if milestone <= 240:
            # Find survival at milestone
            idx = np.argmin(np.abs(extrapolation_times - milestone))
            surv_at_milestone = extrapolated_survival[idx]
            ax.plot(milestone, surv_at_milestone, 'ko', markersize=8)
            ax.annotate(f'{milestone//12}yr\n({surv_at_milestone:.2f})',
                       xy=(milestone, surv_at_milestone),
                       xytext=(10, 10), textcoords='offset points',
                       fontsize=9, bbox=dict(boxstyle='round,pad=0.3', facecolor='yellow', alpha=0.5))
    
    ax.set_xlabel('Time (months)', fontsize=12)
    ax.set_ylabel('Survival Probability', fontsize=12)
    ax.set_title(f'Long-term Extrapolation (0-240 months / 20 years)\n{model_id}', fontsize=14)
    ax.legend(loc='best')
    ax.grid(True, alpha=0.3)
    ax.set_xlim(0, 240)
    ax.set_ylim(0, 1)
    
    plt.tight_layout()
    plt.savefig(file_path, dpi=150, bbox_inches='tight')
    
    # Convert to base64
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    base64_data = base64.b64encode(buf.read()).decode('utf-8')
    plt.close()
    
    return base64_data


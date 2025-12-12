import numpy as np
from scipy.optimize import minimize

class GompertzFitter:
    def __init__(self):
        self.params_ = None
        self.AIC_ = None
        self.BIC_ = None
        self.log_likelihood_ = None

    def fit(self, durations, event_observed):
        durations = np.array(durations)
        event_observed = np.array(event_observed)
        
        # Handle zeros
        durations[durations <= 0] = 1e-5
        
        # Initial guess: lambda (scale) and gamma (shape)
        # Hazard h(t) = lambda * exp(gamma * t)
        # Log hazard = log(lambda) + gamma * t
        # Crude guess: lambda = events/time, gamma = 0
        rate = np.sum(event_observed) / np.sum(durations)
        init_params = [np.log(rate), 0.0] # working with log(lambda) for stability
        
        try:
            res = minimize(
                self._neg_log_likelihood,
                init_params,
                args=(durations, event_observed),
                method='Nelder-Mead' # Robust for simple 2-param
            )
            
            self.params_ = res.x
            self.log_likelihood_ = -res.fun
            self.AIC_ = 2 * len(self.params_) - 2 * self.log_likelihood_
            self.BIC_ = len(self.params_) * np.log(len(durations)) - 2 * self.log_likelihood_
            
        except Exception as e:
            print(f"Gompertz optimization failed: {e}")
            self.params_ = init_params
            self.AIC_ = None
            self.BIC_ = None
            
        return self

    def _neg_log_likelihood(self, params, t, e):
        log_lambda, gamma = params
        lambda_ = np.exp(log_lambda)
        
        # Hazard: h(t) = lambda * exp(gamma * t)
        # Cumulative Hazard: H(t) = (lambda/gamma) * (exp(gamma * t) - 1)
        # If gamma is close to 0, H(t) -> lambda * t (Exponential)
        
        if abs(gamma) < 1e-9:
            H_t = lambda_ * t
        else:
            H_t = (lambda_ / gamma) * (np.exp(gamma * t) - 1)
            
        # Log-likelihood = sum( e * log(h(t)) - H(t) )
        # log(h(t)) = log(lambda) + gamma * t
        
        log_h_t = log_lambda + gamma * t
        ll = np.sum(e * log_h_t - H_t)
        
        return -ll

    def predict_survival(self, times):
        if self._params is None:
            return np.zeros_like(times)
            
        log_lambda, gamma = self._params
        lambda_ = np.exp(log_lambda)
        times = np.array(times, dtype=float)
        
        if abs(gamma) < 1e-9:
            H_t = lambda_ * times
        else:
            H_t = (lambda_ / gamma) * (np.exp(gamma * times) - 1)
            
        return np.exp(-H_t)
        
    @property
    def params_(self):
        # Return dict for consistency with lifelines
        if self._params is None:
            return {}
        return {'lambda_': np.exp(self._params[0]), 'gamma_': self._params[1]}
    
    @params_.setter
    def params_(self, value):
        self._params = value

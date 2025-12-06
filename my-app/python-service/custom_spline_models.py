import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.stats import norm
import patsy

class RoystonParmarFitter:
    def __init__(self, scale='hazard', knots=1):
        self.scale = scale
        self.knots = knots
        self.params_ = None
        self.knots_ = None
        self.AIC_ = None
        self.BIC_ = None
        self.log_likelihood_ = None
        self.boundary_knots_ = None

    def _basis(self, log_t, knots, boundary_knots):
        """Generate natural cubic spline basis"""
        # Use patsy to generate natural cubic splines
        # df = knots + 1 (intercept) + 1 (linear) - 1 (constraint) ? 
        # Royston-Parmar uses restricted cubic splines.
        # Patsy's cr() is natural cubic spline.
        # We need to pass knot locations explicitly.
        
        # Construct formula for patsy
        # cr(x, knots=inner_knots, lower_bound=min, upper_bound=max)
        return patsy.dmatrix(
            "cr(x, knots=inner_knots, lower_bound=lower, upper_bound=upper) - 1",
            {"x": log_t, "inner_knots": knots, "lower": boundary_knots[0], "upper": boundary_knots[1]},
            return_type='dataframe'
        )

    def _neg_log_likelihood(self, params, X, events):
        # Calculate eta = X * beta
        eta = np.dot(X, params)
        
        # We need d(eta)/d(log t) to calculate the density f(t)
        # Since X is pre-calculated basis at log_t, we can't easily differentiate X wrt log_t here without the basis function.
        # BUT, we can pre-calculate X_deriv (derivative of basis wrt log_t) in fit()!
        # Let's assume self.X_deriv is available (we will add it to fit method)
        
        eta_prime = np.dot(self.X_deriv, params) # d(eta)/d(log t)
        
        # Avoid numerical issues
        eta = np.clip(eta, -20, 20)
        eta_prime = np.maximum(eta_prime, 1e-5) # Monotonicity constraint (soft)
        
        if self.scale == 'hazard':
            # eta = log(H(t)) => H(t) = exp(eta)
            # S(t) = exp(-H(t)) = exp(-exp(eta))
            # f(t) = h(t)S(t) = dH/dt * S(t)
            # H(t) = exp(eta)
            # dH/dt = exp(eta) * d(eta)/dt = exp(eta) * eta_prime * (1/t)
            # But we work in log-likelihood.
            # LL = event * log(f) + (1-event) * log(S)
            # log(S) = -exp(eta)
            # log(f) = log(dH/dt) + log(S) = eta + log(eta_prime) - log_t + log(S)
            
            log_S = -np.exp(eta)
            log_f = eta + np.log(eta_prime) - self.log_t + log_S
            
        elif self.scale == 'odds':
            # eta = log((1-S)/S) => S = 1 / (1 + exp(eta))
            # log(S) = -log(1 + exp(eta))
            # f(t) = -dS/dt = - dS/deta * deta/dt
            # dS/deta = -exp(eta) / (1+exp(eta))^2 = -S * (1-S)
            # deta/dt = eta_prime / t
            # f(t) = S * (1-S) * eta_prime / t
            # log(f) = log(S) + log(1-S) + log(eta_prime) - log_t
            
            # Numerical stability for log(1+exp(eta)) -> np.logaddexp(0, eta)
            log_S = -np.logaddexp(0, eta)
            log_1_minus_S = -np.logaddexp(0, -eta) # log(exp(eta)/(1+exp(eta))) = eta - log(1+exp(eta))
            
            log_f = log_S + log_1_minus_S + np.log(eta_prime) - self.log_t
            
        elif self.scale == 'normal':
            # eta = Phi^-1(1-S) => 1-S = Phi(eta) => S = 1 - Phi(eta) = Phi(-eta)
            # log(S) = log(Phi(-eta))
            # f(t) = -dS/dt = phi(eta) * deta/dt  (phi is PDF, Phi is CDF)
            # f(t) = phi(eta) * eta_prime / t
            # log(f) = log(phi(eta)) + log(eta_prime) - log_t
            
            log_S = norm.logcdf(-eta)
            log_f = norm.logpdf(eta) + np.log(eta_prime) - self.log_t
            
        ll = events * log_f + (1 - events) * log_S
        return -np.sum(ll)

    def fit(self, durations, event_observed):
        durations = np.array(durations)
        event_observed = np.array(event_observed)
        
        # Handle zeros
        durations[durations <= 0] = 1e-5
        self.log_t = np.log(durations)
        
        # Calculate knots
        uncensored_log_t = self.log_t[event_observed == 1]
        if len(uncensored_log_t) == 0:
            uncensored_log_t = self.log_t
            
        self.boundary_knots_ = np.array([uncensored_log_t.min(), uncensored_log_t.max()])
        
        if self.knots > 0:
            qs = np.linspace(0, 100, self.knots + 2)[1:-1]
            self.knots_ = np.percentile(uncensored_log_t, qs)
        else:
            self.knots_ = np.array([])
            
        # Generate basis matrix X
        X = self._basis(self.log_t, self.knots_, self.boundary_knots_)
        X = np.column_stack([np.ones(len(X)), X])
        
        # Generate derivative matrix X_deriv using finite differences
        epsilon = 1e-6
        log_t_plus = self.log_t + epsilon
        X_plus = self._basis(log_t_plus, self.knots_, self.boundary_knots_)
        X_plus = np.column_stack([np.ones(len(X_plus)), X_plus])
        self.X_deriv = (X_plus - X) / epsilon
        
        # Initial guess
        init_params = np.zeros(X.shape[1])
        if self.scale == 'hazard':
            init_params[0] = np.log(np.sum(event_observed) / np.sum(durations)) # crude hazard
        
        # Optimization
        try:
            res = minimize(
                self._neg_log_likelihood,
                init_params,
                args=(X, event_observed),
                method='BFGS', # L-BFGS-B might be safer but BFGS is standard
                options={'maxiter': 1000}
            )
            self.params_ = res.x
            self.log_likelihood_ = -res.fun
            self.AIC_ = 2 * len(self.params_) - 2 * self.log_likelihood_
            self.BIC_ = len(self.params_) * np.log(len(durations)) - 2 * self.log_likelihood_
        except Exception as e:
            print(f"Optimization failed: {e}")
            self.params_ = init_params # Fallback
            self.AIC_ = 9999
            self.BIC_ = 9999
        
        return self

    def predict_survival(self, times):
        times = np.array(times)
        times[times <= 0] = 1e-5
        log_t = np.log(times)
        
        X = self._basis(log_t, self.knots_, self.boundary_knots_)
        X = np.column_stack([np.ones(len(X)), X])
        
        eta = np.dot(X, self.params_)
        
        if self.scale == 'hazard':
            return np.exp(-np.exp(eta))
        elif self.scale == 'odds':
            return 1.0 / (1.0 + np.exp(eta))
        elif self.scale == 'normal':
            return norm.cdf(-eta)
        return np.zeros_like(times)

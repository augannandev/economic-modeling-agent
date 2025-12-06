"""
Test script to verify that long-term extrapolations use fitted parameters correctly.
This will fit several models and check that their extrapolations are different.
"""
import pandas as pd
import numpy as np
from lifelines import WeibullFitter, ExponentialFitter, LogNormalFitter, LogLogisticFitter
import matplotlib.pyplot as plt

# Load data
chemo_data = pd.read_parquet('../PseuodoIPD/ipd_EndpointType.OS_Chemotherapy.parquet')
pembro_data = pd.read_parquet('../PseuodoIPD/ipd_EndpointType.OS_Pembrolizumab.parquet')

# Use pembro data for testing
df = pd.DataFrame({
    'time': pembro_data['time'],
    'event': pembro_data['event']
})

print("=" * 80)
print("TESTING LONG-TERM EXTRAPOLATION WITH FITTED PARAMETERS")
print("=" * 80)

# Fit different models
models = {
    'Exponential': ExponentialFitter(),
    'Weibull': WeibullFitter(),
    'Log-Normal': LogNormalFitter(),
    'Log-Logistic': LogLogisticFitter()
}

# Prediction times (0 to 240 months)
prediction_times = np.linspace(0, 240, 500)

# Store predictions
predictions = {}

for name, fitter in models.items():
    print(f"\n{name} Model:")
    print("-" * 40)
    
    # Fit model
    fitter.fit(df['time'], df['event'])
    
    # Get fitted parameters
    if hasattr(fitter, 'lambda_') and hasattr(fitter, 'rho_'):
        print(f"  Parameters: λ={fitter.lambda_:.4f}, ρ={fitter.rho_:.4f}")
    elif hasattr(fitter, 'lambda_'):
        print(f"  Parameters: λ={fitter.lambda_:.4f}")
    elif hasattr(fitter, 'mu_') and hasattr(fitter, 'sigma_'):
        print(f"  Parameters: μ={fitter.mu_:.4f}, σ={fitter.sigma_:.4f}")
    elif hasattr(fitter, 'alpha_') and hasattr(fitter, 'beta_'):
        print(f"  Parameters: α={fitter.alpha_:.4f}, β={fitter.beta_:.4f}")
    
    # Get predictions using survival_function_at_times
    try:
        survival = fitter.survival_function_at_times(prediction_times).values
        predictions[name] = survival
        
        # Check extrapolation at key timepoints
        print(f"  Survival at 60 months: {survival[np.argmin(np.abs(prediction_times - 60))]:.4f}")
        print(f"  Survival at 120 months: {survival[np.argmin(np.abs(prediction_times - 120))]:.4f}")
        print(f"  Survival at 240 months: {survival[np.argmin(np.abs(prediction_times - 240))]:.4f}")
    except Exception as e:
        print(f"  ERROR: {e}")
        predictions[name] = None

# Verify predictions are different
print("\n" + "=" * 80)
print("VERIFICATION: Are extrapolations different?")
print("=" * 80)

valid_predictions = {k: v for k, v in predictions.items() if v is not None}

if len(valid_predictions) >= 2:
    # Compare at 240 months
    survival_240 = {name: pred[np.argmin(np.abs(prediction_times - 240))] 
                    for name, pred in valid_predictions.items()}
    
    print("\nSurvival at 240 months:")
    for name, surv in survival_240.items():
        print(f"  {name}: {surv:.6f}")
    
    # Check if they're all different
    values = list(survival_240.values())
    if len(set([round(v, 4) for v in values])) == len(values):
        print("\n✅ SUCCESS: All models produce DIFFERENT extrapolations!")
    else:
        print("\n❌ FAILURE: Some models produce IDENTICAL extrapolations!")
        print("   This suggests flat extrapolation bug is still present.")
else:
    print("❌ Not enough valid predictions to compare")

# Plot for visual verification
if len(valid_predictions) >= 2:
    plt.figure(figsize=(12, 6))
    
    for name, survival in valid_predictions.items():
        plt.plot(prediction_times, survival, linewidth=2, label=name)
    
    plt.xlabel('Time (months)', fontsize=12)
    plt.ylabel('Survival Probability', fontsize=12)
    plt.title('Long-term Extrapolation Comparison (0-240 months)', fontsize=14)
    plt.legend(loc='best')
    plt.grid(True, alpha=0.3)
    plt.xlim(0, 240)
    plt.ylim(0, 1)
    
    # Add vertical line at end of observed data
    max_time = df['time'].max()
    plt.axvline(x=max_time, color='gray', linestyle=':', linewidth=2, 
               label=f'End of observed data ({max_time:.1f}mo)', alpha=0.7)
    
    plt.tight_layout()
    plt.savefig('extrapolation_test.png', dpi=150, bbox_inches='tight')
    print(f"\n📊 Plot saved to: extrapolation_test.png")
    print("   Visual inspection: Lines should diverge significantly after observed data")

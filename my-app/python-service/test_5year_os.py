"""
Quick test to get 5-year OS for Log-Normal and Generalized Gamma
"""
import pandas as pd
import numpy as np
from lifelines import LogNormalFitter, GeneralizedGammaFitter

# Load data
pembro_data = pd.read_parquet('../PseuodoIPD/ipd_EndpointType.OS_Pembrolizumab.parquet')

df = pd.DataFrame({
    'time': pembro_data['time'],
    'event': pembro_data['event']
})

print("=" * 80)
print("5-YEAR OS PREDICTIONS")
print("=" * 80)

# Fit Log-Normal
print("\nLog-Normal Model:")
print("-" * 40)
lnf = LogNormalFitter()
lnf.fit(df['time'], df['event'])
print(f"Parameters: μ={lnf.mu_:.4f}, σ={lnf.sigma_:.4f}")
survival_60_ln = lnf.survival_function_at_times([60]).values[0]
print(f"5-year OS (60 months): {survival_60_ln:.4f} ({survival_60_ln*100:.2f}%)")

# Fit Generalized Gamma
print("\nGeneralized Gamma Model:")
print("-" * 40)
ggf = GeneralizedGammaFitter()
ggf.fit(df['time'], df['event'])
# Generalized Gamma has parameters: mu_, sigma_, lambda_
if hasattr(ggf, 'mu_') and hasattr(ggf, 'sigma_') and hasattr(ggf, 'lambda_'):
    print(f"Parameters: μ={ggf.mu_:.4f}, σ={ggf.sigma_:.4f}, λ={ggf.lambda_:.4f}")
survival_60_gg = ggf.survival_function_at_times([60]).values[0]
print(f"5-year OS (60 months): {survival_60_gg:.4f} ({survival_60_gg*100:.2f}%)")

print("\n" + "=" * 80)
print("COMPARISON")
print("=" * 80)
print(f"Log-Normal:        {survival_60_ln*100:.2f}%")
print(f"Generalized Gamma: {survival_60_gg*100:.2f}%")
print(f"Difference:        {abs(survival_60_ln - survival_60_gg)*100:.2f} percentage points")

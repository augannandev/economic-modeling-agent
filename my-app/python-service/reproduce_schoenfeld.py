import pandas as pd
import numpy as np
from lifelines import CoxPHFitter
from lifelines.statistics import proportional_hazard_test
import matplotlib.pyplot as plt

# Create synthetic data
np.random.seed(42)
n = 100
df = pd.DataFrame({
    'time': np.random.exponential(10, n),
    'event': np.random.binomial(1, 0.7, n),
    'treatment': np.random.binomial(1, 0.5, n)
})

# Fit Cox model
cph = CoxPHFitter()
cph.fit(df, duration_col='time', event_col='event')

# Check assumptions (this usually produces plots)
print("Checking assumptions...")
try:
    # This method usually plots directly to the active matplotlib figure
    fig = plt.figure(figsize=(10, 6))
    cph.check_assumptions(df, show_plots=True, p_value_threshold=1.0)
    
    ax = plt.gca()
    ax.set_xlabel('Time (log scale)', fontsize=12)
    ax.set_ylabel('Beta(t) for Treatment', fontsize=12)
    ax.set_title('Schoenfeld Residuals Plot\n(with LOESS trend and Confidence Intervals)', fontsize=14)
    ax.set_xscale('log')
    ax.grid(True, alpha=0.3, which='both')
    
    plt.savefig('lifelines_check_assumptions_refined.png')
    print("Saved lifelines_check_assumptions_refined.png")
except Exception as e:
    print(f"check_assumptions failed: {e}")

# Manual residuals
residuals = cph.compute_residuals(df, kind='scaled_schoenfeld')
print("\nResiduals head:")
print(residuals.head())

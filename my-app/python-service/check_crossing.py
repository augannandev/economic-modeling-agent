
import pandas as pd
from lifelines import KaplanMeierFitter
import numpy as np
import os

# Load data
base_path = '/Users/ansberthafreiku/dev/SurvivalAgent/my-app/PseuodoIPD'
chemo_path = os.path.join(base_path, 'ipd_EndpointType.OS_Chemotherapy.parquet')
pembro_path = os.path.join(base_path, 'ipd_EndpointType.OS_Pembrolizumab.parquet')

chemo_df = pd.read_parquet(chemo_path)
pembro_df = pd.read_parquet(pembro_path)

# Fit KM
kmf_chemo = KaplanMeierFitter().fit(chemo_df['time'], chemo_df['event'], label='Chemo')
kmf_pembro = KaplanMeierFitter().fit(pembro_df['time'], pembro_df['event'], label='Pembro')

# Get survival function at shared time points
# We'll use the union of all time points
all_times = sorted(list(set(chemo_df['time']) | set(pembro_df['time'])))
all_times = [t for t in all_times if t <= 24] # Focus on first 24 months

print(f"Checking for crossing in first 24 months ({len(all_times)} time points)...")

surv_chemo = kmf_chemo.survival_function_at_times(all_times)
surv_pembro = kmf_pembro.survival_function_at_times(all_times)

# Check difference
diff = surv_pembro - surv_chemo
crossings = []

prev_diff = diff.iloc[0]
for i, t in enumerate(all_times[1:], 1):
    curr_diff = diff.iloc[i]
    
    # Check sign change (crossing)
    if (prev_diff > 0 and curr_diff < 0) or (prev_diff < 0 and curr_diff > 0):
        crossings.append(t)
    
    # Check if they are very close (touching)
    if abs(curr_diff) < 0.01:
        print(f"Curves touching/close at t={t:.2f}, diff={curr_diff:.4f}")
        
    prev_diff = curr_diff

if crossings:
    print(f"\nCurves CROSS at times: {crossings}")
else:
    print("\nCurves do NOT cross in the first 24 months.")

# Print first few probabilities
print("\nSurvival Probabilities (First 6 months):")
for t in [0, 1, 2, 3, 4, 5, 6]:
    s_c = kmf_chemo.survival_function_at_times(t).values[0]
    s_p = kmf_pembro.survival_function_at_times(t).values[0]
    print(f"t={t}: Chemo={s_c:.3f}, Pembro={s_p:.3f}, Diff={s_p - s_c:.3f}")

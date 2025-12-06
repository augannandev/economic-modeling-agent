
import pandas as pd
import matplotlib.pyplot as plt
from lifelines import KaplanMeierFitter
import os

# Data paths
base_path = '/Users/ansberthafreiku/dev/SurvivalAgent/my-app/PseuodoIPD'
chemo_path = os.path.join(base_path, 'ipd_EndpointType.OS_Chemotherapy.parquet')
pembro_path = os.path.join(base_path, 'ipd_EndpointType.OS_Pembrolizumab.parquet')

# Load data
chemo_df = pd.read_parquet(chemo_path)
pembro_df = pd.read_parquet(pembro_path)

# Plot
plt.figure(figsize=(10, 6))
kmf = KaplanMeierFitter()

# Fit and plot Chemo
kmf.fit(chemo_df['time'], chemo_df['event'], label='Chemotherapy')
kmf.plot(ci_show=True)

# Fit and plot Pembro
kmf.fit(pembro_df['time'], pembro_df['event'], label='Pembrolizumab')
kmf.plot(ci_show=True)

plt.title('Kaplan-Meier Estimate of Overall Survival')
plt.xlabel('Time (Months)')
plt.ylabel('Survival Probability')
plt.grid(True, alpha=0.3)

# Save to artifacts directory
output_path = '/Users/ansberthafreiku/.gemini/antigravity/brain/6b6f5ddf-0846-40e3-892c-e4ff90493740/km_plot.png'
plt.savefig(output_path)
print(f"Plot saved to {output_path}")


import pandas as pd
import os
import sys

# Load data
base_path = '/Users/ansberthafreiku/dev/SurvivalAgent/my-app/PseuodoIPD'
chemo_path = os.path.join(base_path, 'ipd_EndpointType.OS_Chemotherapy.parquet')
pembro_path = os.path.join(base_path, 'ipd_EndpointType.OS_Pembrolizumab.parquet')

chemo_df = pd.read_parquet(chemo_path)
pembro_df = pd.read_parquet(pembro_path)

# Calculate split point used by Chow test
mid_time = (chemo_df['time'].max() + pembro_df['time'].max()) / 2
print(f"Split time (midpoint): {mid_time:.2f} months")

# Count events in late period (t > 12)
late_chemo = chemo_df[(chemo_df['time'] > 12) & (chemo_df['event'] == 1)]
late_pembro = pembro_df[(pembro_df['time'] > 12) & (pembro_df['event'] == 1)]

print(f"Chemo Events > 12m: {len(late_chemo)}")
print(f"Pembro Events > 12m: {len(late_pembro)}")

# Check max time again just to be sure
print(f"Chemo Max Time: {chemo_df['time'].max()}")
print(f"Pembro Max Time: {pembro_df['time'].max()}")

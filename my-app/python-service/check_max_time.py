import pandas as pd
import os

# Define paths
base_dir = os.path.dirname(os.path.abspath(__file__))
data_dir = os.path.join(base_dir, '..', 'PseuodoIPD')

# Load data
chemo_file = os.path.join(data_dir, 'ipd_EndpointType.OS_Chemotherapy.parquet')
pembro_file = os.path.join(data_dir, 'ipd_EndpointType.OS_Pembrolizumab.parquet')

df_chemo = pd.read_parquet(chemo_file)
df_pembro = pd.read_parquet(pembro_file)

print(f"Chemo Max Time: {df_chemo['time'].max()}")
print(f"Pembro Max Time: {df_pembro['time'].max()}")

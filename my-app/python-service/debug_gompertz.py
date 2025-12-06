import pandas as pd
from survival_models import fit_one_piece_model

# Load data
try:
    chemo_df = pd.read_parquet('../PseuodoIPD/ipd_EndpointType.OS_Chemotherapy.parquet')
    print(f"Loaded Chemo data: {len(chemo_df)} rows")
except Exception as e:
    print(f"Error loading data: {e}")
    exit(1)

chemo_data = {
    "time": chemo_df['time'].tolist(),
    "event": chemo_df['event'].tolist(),
    "arm": ["chemo"] * len(chemo_df)
}

print("\n--- Comparing Weibull vs Gompertz ---")

# Fit Weibull
res_w = fit_one_piece_model(chemo_data, "chemo", "weibull")
print(f"Weibull AIC: {res_w['aic']}")

# Fit Gompertz
res_g = fit_one_piece_model(chemo_data, "chemo", "gompertz")
print(f"Gompertz AIC: {res_g['aic']}")

if res_w['aic'] == res_g['aic']:
    print("❌ FAIL: AICs are identical!")
else:
    print("✅ SUCCESS: AICs are different!")

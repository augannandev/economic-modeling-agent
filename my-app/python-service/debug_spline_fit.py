import pandas as pd
from survival_models import fit_spline_model
import sys

# Load data
try:
    chemo_df = pd.read_parquet('../PseuodoIPD/ipd_EndpointType.OS_Chemotherapy.parquet')
    print(f"Loaded Chemo data: {len(chemo_df)} rows")
except Exception as e:
    print(f"Error loading data: {e}")
    sys.exit(1)

# Convert to dict format
chemo_data = {
    "time": chemo_df['time'].tolist(),
    "event": chemo_df['event'].tolist(),
    "arm": ["chemo"] * len(chemo_df)
}

scales = ['hazard', 'odds', 'normal']
knots_list = [1, 2, 3]

print("\n--- Testing Spline Models for Chemo ---")

results = {}

for scale in scales:
    for knots in knots_list:
        print(f"\nFitting scale={scale}, knots={knots}...")
        try:
            result = fit_spline_model(chemo_data, "chemo", scale, knots)
            if result['aic'] is None:
                 print(f"❌ Failed (AIC is None). Error in parameters: {result.get('parameters')}")
            else:
                print(f"✅ Success! AIC: {result['aic']}")
                results[(scale, knots)] = result['aic']
        except Exception as e:
            print(f"❌ Failed with exception: {e}")

print("\n--- Comparison of AIC values ---")
# Check if results are identical across scales for the same knots
for knots in knots_list:
    aic_hazard = results.get(('hazard', knots))
    aic_odds = results.get(('odds', knots))
    aic_normal = results.get(('normal', knots))
    
    print(f"Knots {knots}: Hazard={aic_hazard}, Odds={aic_odds}, Normal={aic_normal}")
    
    if aic_hazard == aic_odds == aic_normal and aic_hazard is not None:
        print(f"⚠️  WARNING: Results are IDENTICAL for all scales with {knots} knots. The 'scale' parameter is likely ignored.")

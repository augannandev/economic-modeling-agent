import pandas as pd
from lifelines import (
    KaplanMeierFitter, 
    WeibullFitter, 
    ExponentialFitter, 
    LogNormalFitter, 
    LogLogisticFitter, 
    GeneralizedGammaFitter
)
import sys
import os

# Load data
try:
    chemo_df = pd.read_parquet('../PseuodoIPD/ipd_EndpointType.OS_Chemotherapy.parquet')
    print(f"Loaded Chemo data: {len(chemo_df)} rows")
except Exception as e:
    print(f"Error loading data: {e}")
    sys.exit(1)

distributions = [
    'exponential', 
    'weibull', 
    'log-normal', 
    'log-logistic', 
    'gompertz', 
    'generalized-gamma'
]

from survival_models import fit_one_piece_model

print("\n--- Testing One-Piece Models for Chemo (using fixed function) ---")
# Convert dataframe to dict format expected by the function
chemo_data = {
    "time": chemo_df['time'].tolist(),
    "event": chemo_df['event'].tolist(),
    "arm": ["chemo"] * len(chemo_df)
}

for dist in distributions:
    print(f"\nFitting {dist}...")
    try:
        result = fit_one_piece_model(chemo_data, "chemo", dist)
        print(f"✅ Success! AIC: {result['aic']}")
    except Exception as e:
        print(f"❌ Failed: {e}")

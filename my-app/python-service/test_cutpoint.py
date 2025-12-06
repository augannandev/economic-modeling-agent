
import pandas as pd
import numpy as np
import sys
import os

# Add path to import modules
sys.path.append('/Users/ansberthafreiku/dev/SurvivalAgent/my-app/python-service')

# Mock matplotlib to avoid display issues
from unittest.mock import MagicMock
sys.modules['matplotlib'] = MagicMock()
sys.modules['matplotlib.pyplot'] = MagicMock()

from piecewise_models import detect_cutpoint_chow_test

# Load data
base_path = '/Users/ansberthafreiku/dev/SurvivalAgent/my-app/PseuodoIPD'
chemo_path = os.path.join(base_path, 'ipd_EndpointType.OS_Chemotherapy.parquet')
pembro_path = os.path.join(base_path, 'ipd_EndpointType.OS_Pembrolizumab.parquet')

chemo_df = pd.read_parquet(chemo_path)
pembro_df = pd.read_parquet(pembro_path)

# Prepare data dicts
chemo_dict = {
    "time": chemo_df['time'].tolist(),
    "event": chemo_df['event'].tolist(),
    "arm": ["chemo"] * len(chemo_df)
}
pembro_dict = {
    "time": pembro_df['time'].tolist(),
    "event": pembro_df['event'].tolist(),
    "arm": ["pembro"] * len(pembro_df)
}

print("--- Testing Cutpoint Detection (LRT) ---")

# Test Chemo Arm
print("\nDetecting cutpoint for Chemo Arm...")
cutpoint_chemo = detect_cutpoint_chow_test(chemo_dict)
print(f"Chemo Cutpoint: {cutpoint_chemo:.2f} months")

# Test Pembro Arm
print("\nDetecting cutpoint for Pembro Arm...")
cutpoint_pembro = detect_cutpoint_chow_test(pembro_dict)
print(f"Pembro Cutpoint: {cutpoint_pembro:.2f} months")

# KEYNOTE-024 Reference:
# Pembro: Week 32 (~7.4 months)
# SoC (Chemo): Week 38 (~8.8 months) or Week 25 (~5.8 months)

print("\nReference (KEYNOTE-024):")
print("Pembro: ~7.4 months")
print("Chemo: ~5.8 - 8.8 months")

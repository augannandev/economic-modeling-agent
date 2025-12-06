
import pandas as pd
import numpy as np
from ph_testing import test_proportional_hazards
import matplotlib.pyplot as plt
import os
import sys

# Redirect stdout/stderr to file
sys.stdout = open('result.log', 'w')
sys.stderr = sys.stdout

# Create dummy data
np.random.seed(42)
n = 100
chemo_data = {
    'time': np.random.exponential(10, n).tolist(),
    'event': np.random.randint(0, 2, n).tolist(),
    'arm': ['Chemotherapy'] * n
}
pembro_data = {
    'time': np.random.exponential(12, n).tolist(),
    'event': np.random.randint(0, 2, n).tolist(),
    'arm': ['Pembrolizumab'] * n
}

print("Testing Proportional Hazards (expecting R service call)...")
try:
    result = test_proportional_hazards(chemo_data, pembro_data)
    
    print("\nTest Results:")
    print(f"Schoenfeld p-value: {result['schoenfeld_pvalue']}")
    print(f"PH Violated: {result['ph_violated']}")
    
    if result['diagnostic_plots']['schoenfeld_residuals']:
        print("Schoenfeld plot generated successfully (Base64 length: {})".format(len(result['diagnostic_plots']['schoenfeld_residuals'])))
    else:
        print("Schoenfeld plot generation FAILED.")
        
except Exception as e:
    print(f"Test failed with error: {e}")
    import traceback
    traceback.print_exc()

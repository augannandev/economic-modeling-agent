import pandas as pd
import numpy as np
from ph_testing import test_proportional_hazards
import matplotlib.pyplot as plt

# Create synthetic data
np.random.seed(42)
n = 50
chemo_data = {
    'time': np.random.exponential(10, n).tolist(),
    'event': np.random.binomial(1, 0.7, n).tolist()
}
pembro_data = {
    'time': np.random.exponential(15, n).tolist(),
    'event': np.random.binomial(1, 0.6, n).tolist()
}

print("Running test_proportional_hazards...")
try:
    results = test_proportional_hazards(chemo_data, pembro_data)
    print("Success!")
    print(f"Schoenfeld p-value: {results['schoenfeld_pvalue']}")
    
    if results['diagnostic_plots']['schoenfeld_residuals']:
        print("Schoenfeld plot generated (base64 present)")
    else:
        print("Schoenfeld plot MISSING")
        
except Exception as e:
    print(f"Failed: {e}")
    import traceback
    traceback.print_exc()

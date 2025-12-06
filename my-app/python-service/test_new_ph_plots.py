import pandas as pd
import numpy as np
from ph_testing import test_proportional_hazards
import base64

def test_plots():
    # Create synthetic data
    np.random.seed(42)
    n = 100
    chemo_data = {
        'time': np.random.exponential(10, n).tolist(),
        'event': np.random.randint(0, 2, n).tolist(),
        'arm': ['Chemotherapy'] * n
    }
    pembro_data = {
        'time': np.random.exponential(15, n).tolist(),
        'event': np.random.randint(0, 2, n).tolist(),
        'arm': ['Pembrolizumab'] * n
    }

    print("Running PH test...")
    results = test_proportional_hazards(chemo_data, pembro_data)
    
    plots = results['diagnostic_plots']
    print(f"Plots keys: {list(plots.keys())}")
    
    expected_plots = ['cumulative_hazard', 'log_cumulative_hazard', 'schoenfeld_residuals']
    for plot_name in expected_plots:
        if plot_name in plots and plots[plot_name]:
            # Verify it's a valid base64 string
            try:
                base64.b64decode(plots[plot_name])
                print(f"✅ {plot_name} generated successfully (valid base64)")
            except Exception as e:
                print(f"❌ {plot_name} is invalid base64: {e}")
        else:
            print(f"❌ {plot_name} is missing or None")

if __name__ == "__main__":
    test_plots()

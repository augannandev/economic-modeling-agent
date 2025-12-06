
import pandas as pd
import numpy as np
import sys
import os

# Add path to import data loader
sys.path.append('/Users/ansberthafreiku/dev/SurvivalAgent/my-app/python-service')

# We need to mock the environment variable for data directory if it's used, 
# but data_loader.py in python-service just takes paths.
# The server passes paths. We need to find where the data is.
# Based on previous exploration, it's in my-app/data or my-app/PseuodoIPD/data?
# Let's check the file system.

def inspect_data():
    # Hardcoded paths based on file listing
    # We saw 'data' dir in 'my-app'.
    base_path = '/Users/ansberthafreiku/dev/SurvivalAgent/my-app/data'
    chemo_path = os.path.join(base_path, 'ipd_EndpointType.OS_Chemotherapy.parquet')
    pembro_path = os.path.join(base_path, 'ipd_EndpointType.OS_Pembrolizumab.parquet')
    
    print(f"Checking paths:\n{chemo_path}\n{pembro_path}")
    
    if not os.path.exists(chemo_path):
        print("Files not found in my-app/data. Trying PseuodoIPD...")
        base_path = '/Users/ansberthafreiku/dev/SurvivalAgent/my-app/PseuodoIPD'
        chemo_path = os.path.join(base_path, 'ipd_EndpointType.OS_Chemotherapy.parquet')
        pembro_path = os.path.join(base_path, 'ipd_EndpointType.OS_Pembrolizumab.parquet')

    if not os.path.exists(chemo_path):
        print("Files not found.")
        return

    try:
        chemo_df = pd.read_parquet(chemo_path)
        pembro_df = pd.read_parquet(pembro_path)
        
        print("\n--- Data Inspection ---")
        print(f"Chemo Arm: N={len(chemo_df)}, Events={chemo_df['event'].sum()}")
        print(f"Pembro Arm: N={len(pembro_df)}, Events={pembro_df['event'].sum()}")
        
        print("\nChemo Head:")
        print(chemo_df.head())
        
        # Check for crossing curves (simple check of median survival)
        # Simple KM
        from lifelines import KaplanMeierFitter
        kmf_c = KaplanMeierFitter().fit(chemo_df['time'], chemo_df['event'])
        kmf_p = KaplanMeierFitter().fit(pembro_df['time'], pembro_df['event'])
        
        print(f"\nMedian Survival Chemo: {kmf_c.median_survival_time_}")
        print(f"Median Survival Pembro: {kmf_p.median_survival_time_}")
        
        # Run the new PH test
        from ph_testing import test_proportional_hazards
        
        # Convert data to dict format expected by the function
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
        
        print("\n--- Running PH Test with Time-Dependent Cox ---")
        result = test_proportional_hazards(chemo_dict, pembro_dict)
        
        print(f"Schoenfeld p-value: {result['schoenfeld_pvalue']}")
        print(f"Time-Dep Cox p-value (was Chow): {result['chow_test_pvalue']}")
        print(f"Log-rank p-value (ignored): {result['logrank_pvalue']}")
        print(f"PH Violated: {result['ph_violated']}")
        print(f"Decision: {result['decision']}")
        print(f"Rationale: {result['rationale']}")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_data()

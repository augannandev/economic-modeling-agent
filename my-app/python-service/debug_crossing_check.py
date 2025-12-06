import pandas as pd
import numpy as np
from lifelines import KaplanMeierFitter
import os
import glob

def check_crossing():
    # Load data
    data_dir = "../PseuodoIPD"
    chemo_files = glob.glob(os.path.join(data_dir, "*Chemotherapy.parquet"))
    pembro_files = glob.glob(os.path.join(data_dir, "*Pembrolizumab.parquet"))
    
    if not chemo_files or not pembro_files:
        print("Error: Data files not found")
        return

    chemo_df = pd.concat([pd.read_parquet(f) for f in chemo_files])
    pembro_df = pd.concat([pd.read_parquet(f) for f in pembro_files])
    
    print(f"Loaded {len(chemo_df)} chemo records and {len(pembro_df)} pembro records")
    
    # Check for crossing survival curves
    t_min = min(chemo_df['time'].min(), pembro_df['time'].min())
    t_max = max(chemo_df['time'].max(), pembro_df['time'].max())
    
    # Use higher resolution grid
    common_times = np.linspace(t_min, t_max, 500)
    
    # Fit KM curves
    kmf_chemo = KaplanMeierFitter()
    kmf_pembro = KaplanMeierFitter()
    kmf_chemo.fit(chemo_df['time'], chemo_df['event'])
    kmf_pembro.fit(pembro_df['time'], pembro_df['event'])
    
    # Get survival probabilities (step interpolation)
    surv_chemo = kmf_chemo.survival_function_at_times(common_times).values
    surv_pembro = kmf_pembro.survival_function_at_times(common_times).values
    
    diff = surv_chemo - surv_pembro
    
    crossing_detected = False
    crossing_time = None
    
    print("\nScanning for crossings...")
    start_idx = 5
    
    for i in range(start_idx, len(common_times)):
        prev_diff = diff[i-1]
        curr_diff = diff[i]
        t_curr = common_times[i]
        
        if np.sign(prev_diff) != np.sign(curr_diff) and prev_diff != 0 and curr_diff != 0:
            is_early = t_curr < 10
            magnitude_check = (abs(prev_diff) > 0.001 or abs(curr_diff) > 0.001)
            
            print(f"Potential crossing at t={t_curr:.2f}: {prev_diff:.6f} -> {curr_diff:.6f} (Early: {is_early}, Mag: {magnitude_check})")
            
            if is_early or magnitude_check:
                crossing_detected = True
                crossing_time = float(t_curr)
                print(f"*** CONFIRMED CROSSING at t={crossing_time:.2f} ***")
                break
    
    if not crossing_detected:
        print("No crossing detected.")
        # Print min absolute difference in early period
        early_mask = common_times < 10
        min_diff = np.min(np.abs(diff[early_mask]))
        print(f"Minimum absolute difference in early period (t<10): {min_diff:.6f}")

if __name__ == "__main__":
    check_crossing()


import pandas as pd
import matplotlib.pyplot as plt
from lifelines import KaplanMeierFitter
import os

def check_pfs_data():
    base_dir = "../PseuodoIPD"
    chemo_path = os.path.join(base_dir, "ipd_EndpointType.PFS_Chemotherapy.parquet")
    pembro_path = os.path.join(base_dir, "ipd_EndpointType.PFS_Pembrolizumab.parquet")
    
    print(f"Checking files:\n1. {chemo_path}\n2. {pembro_path}")
    
    if not os.path.exists(chemo_path) or not os.path.exists(pembro_path):
        print("Error: One or both files not found.")
        return

    # Load data
    df_chemo = pd.read_parquet(chemo_path)
    df_pembro = pd.read_parquet(pembro_path)
    
    print("\nData Statistics:")
    print(f"Chemo: {len(df_chemo)} records, Time range: {df_chemo['time'].min():.2f} - {df_chemo['time'].max():.2f}")
    print(f"Pembro: {len(df_pembro)} records, Time range: {df_pembro['time'].min():.2f} - {df_pembro['time'].max():.2f}")
    
    # Plot KM
    plt.figure(figsize=(10, 6))
    
    kmf = KaplanMeierFitter()
    
    kmf.fit(df_chemo['time'], df_chemo['event'], label=f'Chemotherapy (n={len(df_chemo)})')
    kmf.plot_survival_function()
    
    kmf.fit(df_pembro['time'], df_pembro['event'], label=f'Pembrolizumab (n={len(df_pembro)})')
    kmf.plot_survival_function()
    
    plt.title("Current PFS Data Content Check")
    plt.xlabel("Time")
    plt.ylabel("Survival Probability")
    plt.grid(True, alpha=0.3)
    
    output_file = "pfs_data_check.png"
    plt.savefig(output_file)
    print(f"\nPlot saved to {output_file}")

if __name__ == "__main__":
    check_pfs_data()

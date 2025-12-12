#!/usr/bin/env python3
"""
Generate Schoenfeld residuals plot using R service
"""
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import requests
import json
import os

def load_os_data():
    """Load OS data from PseuodoIPD folder"""
    base_dir = "../PseuodoIPD"
    chemo_path = os.path.join(base_dir, "ipd_EndpointType.OS_Chemotherapy.parquet")
    pembro_path = os.path.join(base_dir, "ipd_EndpointType.OS_Pembrolizumab.parquet")
    
    if not os.path.exists(chemo_path) or not os.path.exists(pembro_path):
        raise FileNotFoundError(f"Data files not found. Checked:\n{chemo_path}\n{pembro_path}")
    
    chemo_df = pd.read_parquet(chemo_path)
    pembro_df = pd.read_parquet(pembro_path)
    
    print(f"Loaded {len(chemo_df)} chemo records and {len(pembro_df)} pembro records")
    
    # Combine data with arm labels
    # 0 = chemo, 1 = pembro
    chemo_df['arm'] = 0
    pembro_df['arm'] = 1
    
    combined_df = pd.concat([chemo_df, pembro_df], ignore_index=True)
    
    return combined_df

def get_schoenfeld_residuals(time, event, arm, r_service_url="http://localhost:8001"):
    """Call R service to get Schoenfeld residuals"""
    payload = {
        "time": time.tolist() if hasattr(time, 'tolist') else list(time),
        "event": event.tolist() if hasattr(event, 'tolist') else list(event),
        "arm": arm.tolist() if hasattr(arm, 'tolist') else list(arm)
    }
    
    print(f"Calling R service at {r_service_url}/schoenfeld-residuals...")
    response = requests.post(
        f"{r_service_url}/schoenfeld-residuals",
        json=payload,
        timeout=30
    )
    
    if response.status_code != 200:
        raise Exception(f"R service returned status {response.status_code}: {response.text}")
    
    result = response.json()
    
    if 'error' in result:
        raise Exception(f"R service error: {result['error']}")
    
    return result

def plot_schoenfeld_residuals(residuals, times, p_value, smooth_times=None, smooth_values=None, 
                              ci_lower=None, ci_upper=None, output_file="schoenfeld_residuals.png"):
    """Create Schoenfeld residuals plot matching NICE TA style"""
    fig, ax = plt.subplots(figsize=(12, 6))
    
    # Plot individual residuals as small circles
    ax.scatter(times, residuals, alpha=0.4, s=15, color='black', marker='o', 
               edgecolors='none', label='Residuals', zorder=1)
    
    # Add horizontal reference line at y=0 (expected under PH)
    ax.axhline(y=0, color='black', linestyle=':', linewidth=1.5, alpha=0.7, zorder=2)
    
    # Plot smoothed trend line and confidence intervals if available
    if smooth_times is not None and smooth_values is not None:
        # Plot confidence intervals (95% CI)
        if ci_lower is not None and ci_upper is not None:
            ax.fill_between(smooth_times, ci_lower, ci_upper, 
                           alpha=0.2, color='gray', label='95% CI', zorder=3)
            # Plot CI boundaries as dashed lines
            ax.plot(smooth_times, ci_lower, 'k--', linewidth=1, alpha=0.5, zorder=3)
            ax.plot(smooth_times, ci_upper, 'k--', linewidth=1, alpha=0.5, zorder=3)
        
        # Plot smoothed trend line
        ax.plot(smooth_times, smooth_values, 'k-', linewidth=2, 
               label='Smoothed trend', zorder=4)
    
    # Set log scale for x-axis (matching NICE TA reference)
    ax.set_xscale('log')
    ax.set_xlabel('Time', fontsize=12, fontweight='bold')
    
    # Y-axis label matching reference style
    ax.set_ylabel('Beta(t) for TRT01PSOC', fontsize=12, fontweight='bold')
    
    # No title - keep plot clean
    
    # Set appropriate x-axis limits and ticks (matching reference)
    ax.set_xlim(left=0.3, right=max(times) * 1.5)
    ax.set_xticks([0.5, 1, 2, 5, 10, 20, 50])
    ax.set_xticklabels(['0.5', '1.0', '2.0', '5.0', '10.0', '20.0', '50.0'])
    
    # Grid
    ax.grid(True, alpha=0.3, which='both', linestyle='-', linewidth=0.5)
    ax.grid(True, alpha=0.2, which='minor', linestyle=':', linewidth=0.5)
    
    # Remove legend (reference plot doesn't show one)
    # Or keep minimal legend if needed
    # ax.legend(loc='best', fontsize=9, framealpha=0.9)
    
    plt.tight_layout()
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    print(f"\nPlot saved to: {output_file}")
    print(f"P-value: {p_value:.4f}")
    
    return fig

def main():
    print("=" * 60)
    print("Schoenfeld Residuals Plot Generator")
    print("Using R Service for Calculation")
    print("=" * 60)
    
    # Load data
    print("\n1. Loading OS data...")
    df = load_os_data()
    
    # Prepare data for R service
    print("\n2. Preparing data for R service...")
    time = df['time'].values
    event = df['event'].values
    arm = df['arm'].values
    
    print(f"   Total records: {len(time)}")
    print(f"   Events: {event.sum()}")
    print(f"   Chemo (arm=0): {(arm == 0).sum()}")
    print(f"   Pembro (arm=1): {(arm == 1).sum()}")
    
    # Call R service
    print("\n3. Calling R service for Schoenfeld residuals...")
    try:
        result = get_schoenfeld_residuals(time, event, arm)
        residuals = np.array(result['residuals'])
        times = np.array(result['times'])
        # Handle p_value which might be a list or scalar
        p_value = result['p_value']
        if isinstance(p_value, (list, np.ndarray)):
            p_value = float(p_value[0])
        else:
            p_value = float(p_value)
        
        # Get smoothed values and confidence intervals if available
        smooth_times = result.get('smooth_times')
        smooth_values = result.get('smooth_values')
        ci_lower = result.get('ci_lower')
        ci_upper = result.get('ci_upper')
        
        if smooth_times is not None:
            smooth_times = np.array(smooth_times)
        if smooth_values is not None:
            smooth_values = np.array(smooth_values)
        if ci_lower is not None:
            ci_lower = np.array(ci_lower)
        if ci_upper is not None:
            ci_upper = np.array(ci_upper)
        
        print(f"   Received {len(residuals)} residuals")
        print(f"   P-value: {p_value:.6f}")
        if smooth_times is not None:
            print(f"   Smoothed trend with {len(smooth_times)} points")
        
    except Exception as e:
        print(f"   ERROR: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Create plot
    print("\n4. Generating plot...")
    plot_schoenfeld_residuals(residuals, times, p_value, 
                             smooth_times, smooth_values, ci_lower, ci_upper)
    
    print("\n" + "=" * 60)
    print("Done!")
    print("=" * 60)

if __name__ == "__main__":
    main()


#!/usr/bin/env python3
"""
Test IPD reconstruction using KM data from CSV file.
This script tests the fixed Guyot reconstruction algorithm.
"""

import sys
import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

# Add parent directory to path to import km_extractor
sys.path.insert(0, str(Path(__file__).parent))

from km_extractor import IPDBuilder
from lifelines import KaplanMeierFitter, CoxPHFitter

def load_km_data_from_csv(csv_path: str):
    """Load KM data from CSV file."""
    df = pd.read_csv(csv_path)
    
    # Group by endpoint and arm
    results = {}
    for endpoint in df['endpoint'].unique():
        results[endpoint] = {}
        for arm in df[df['endpoint'] == endpoint]['arm'].unique():
            arm_data = df[(df['endpoint'] == endpoint) & (df['arm'] == arm)]
            results[endpoint][arm] = {
                'time': arm_data['time'].values.tolist(),
                'survival': arm_data['survival'].values.tolist()
            }
    
    return results

def load_risk_table_from_csv(csv_path: str):
    """Load risk table data from CSV file."""
    df = pd.read_csv(csv_path)
    
    # Group by endpoint and arm
    results = {}
    for endpoint in df['endpoint'].unique():
        results[endpoint] = {}
        for arm in df[df['endpoint'] == endpoint]['arm'].unique():
            arm_data = df[(df['endpoint'] == endpoint) & (df['arm'] == arm)]
            results[endpoint][arm] = [
                {'time': row['time_months'], 'atRisk': int(row['n_risk'])}
                for _, row in arm_data.iterrows()
            ]
    
    return results

def reconstruct_ipd_for_arm(km_data: dict, atrisk_data: list, arm_name: str, endpoint: str):
    """Reconstruct IPD for a single arm."""
    print(f"\n{'='*60}")
    print(f"Reconstructing IPD for {endpoint} - {arm_name}")
    print(f"{'='*60}")
    
    # Convert to format expected by IPDBuilder
    km_points = [
        {'time': t, 'survival': s}
        for t, s in zip(km_data['time'], km_data['survival'])
    ]
    
    # Use provided at-risk data (or empty list if not available)
    if atrisk_data:
        print(f"   Using {len(atrisk_data)} at-risk timepoints")
    else:
        print(f"   ⚠️ No at-risk data provided - will estimate from survival curve")
    
    # Create IPD builder and reconstruct
    builder = IPDBuilder()
    result = builder.reconstruct_ipd_guyot(km_points, atrisk_data, arm_name)
    
    if not result.get('success'):
        print(f"❌ Reconstruction failed: {result.get('error', 'Unknown error')}")
        return None
    
    return result

def validate_reconstruction(ipd_data: list, original_km_data: dict, arm_name: str):
    """Validate reconstructed IPD by comparing KM curves."""
    print(f"\n📊 Validating reconstruction for {arm_name}...")
    
    # Convert IPD to DataFrame
    ipd_df = pd.DataFrame(ipd_data)
    
    # Fit KM curve to reconstructed IPD
    kmf = KaplanMeierFitter()
    kmf.fit(ipd_df['time'], ipd_df['event'])
    
    # Get survival estimates at original timepoints
    original_times = np.array(original_km_data['time'])
    original_survival = np.array(original_km_data['survival'])
    
    # Get reconstructed survival at original timepoints
    reconstructed_survival = kmf.survival_function_at_times(original_times).values.flatten()
    
    # Calculate differences
    differences = original_survival - reconstructed_survival
    mae = np.mean(np.abs(differences))
    max_diff = np.max(np.abs(differences))
    
    print(f"   Mean Absolute Error: {mae:.4f}")
    print(f"   Max Absolute Error: {max_diff:.4f}")
    
    # Calculate median survival (interpolate if needed)
    original_min_survival = original_survival.min()
    reconstructed_min_survival = kmf.survival_function_.values.flatten().min()
    
    # Original median
    if original_min_survival <= 0.5:
        # Find where survival crosses 0.5
        below_50_idx = np.where(original_survival <= 0.5)[0]
        if len(below_50_idx) > 0:
            first_below_50 = below_50_idx[0]
            if first_below_50 > 0:
                # Interpolate
                t1, s1 = original_times[first_below_50-1], original_survival[first_below_50-1]
                t2, s2 = original_times[first_below_50], original_survival[first_below_50]
                original_median = t1 + (t2 - t1) * (0.5 - s1) / (s2 - s1) if s2 != s1 else t2
            else:
                original_median = original_times[0]
        else:
            original_median = None
    else:
        original_median = None
    
    # Reconstructed median
    reconstructed_median = kmf.median_survival_time_
    if pd.isna(reconstructed_median) or np.isinf(reconstructed_median):
        # Try to interpolate
        recon_times = kmf.timeline if isinstance(kmf.timeline, np.ndarray) else kmf.timeline.values
        recon_surv = kmf.survival_function_.values.flatten()
        if recon_surv.min() <= 0.5:
            below_50_idx = np.where(recon_surv <= 0.5)[0]
            if len(below_50_idx) > 0:
                first_below_50 = below_50_idx[0]
                if first_below_50 > 0:
                    t1, s1 = recon_times[first_below_50-1], recon_surv[first_below_50-1]
                    t2, s2 = recon_times[first_below_50], recon_surv[first_below_50]
                    reconstructed_median = t1 + (t2 - t1) * (0.5 - s1) / (s2 - s1) if s2 != s1 else t2
                else:
                    reconstructed_median = recon_times[0]
            else:
                reconstructed_median = None
        else:
            reconstructed_median = None
    
    print(f"\n   Median Survival:")
    if original_median:
        print(f"   Original: {original_median:.2f} months")
    else:
        print(f"   Original: Not reached (min survival: {original_min_survival:.2%})")
    
    if reconstructed_median and not (pd.isna(reconstructed_median) or np.isinf(reconstructed_median)):
        print(f"   Reconstructed: {reconstructed_median:.2f} months")
    else:
        print(f"   Reconstructed: Not reached (min survival: {reconstructed_min_survival:.2%})")
    
    if original_median and reconstructed_median and not (pd.isna(reconstructed_median) or np.isinf(reconstructed_median)):
        median_diff = abs(original_median - reconstructed_median)
        print(f"   Difference: {median_diff:.2f} months")
    
    return {
        'mae': mae,
        'max_diff': max_diff,
        'original_median': original_median,
        'reconstructed_median': reconstructed_median,
        'original_times': original_times,
        'original_survival': original_survival,
        'reconstructed_survival': reconstructed_survival,
        'kmf': kmf
    }

def plot_comparison(validation_results: dict, arm_name: str, endpoint: str, output_dir: str):
    """Plot comparison of original vs reconstructed KM curves."""
    fig, ax = plt.subplots(figsize=(12, 8))
    
    # Plot original curve
    ax.step(
        validation_results['original_times'],
        validation_results['original_survival'],
        where='post',
        label=f'Original {arm_name}',
        linewidth=2,
        color='blue',
        alpha=0.7
    )
    
    # Plot reconstructed curve
    kmf = validation_results['kmf']
    ax.step(
        kmf.timeline,
        kmf.survival_function_.values.flatten(),
        where='post',
        label=f'Reconstructed {arm_name}',
        linewidth=2,
        color='red',
        linestyle='--',
        alpha=0.7
    )
    
    # Add difference shading
    original_times = validation_results['original_times']
    original_survival = validation_results['original_survival']
    reconstructed_survival = validation_results['reconstructed_survival']
    
    # Interpolate reconstructed to original times for comparison
    recon_interp = np.interp(original_times, kmf.timeline, kmf.survival_function_.values.flatten())
    ax.fill_between(
        original_times,
        original_survival,
        recon_interp,
        alpha=0.2,
        color='gray',
        label='Difference'
    )
    
    ax.set_xlabel('Time (months)', fontsize=12)
    ax.set_ylabel('Survival Probability', fontsize=12)
    ax.set_title(f'{endpoint} - {arm_name}: Original vs Reconstructed IPD', fontsize=14, fontweight='bold')
    ax.legend(fontsize=10)
    ax.grid(True, alpha=0.3)
    ax.set_ylim([0, 1.05])
    
    # Add statistics text
    stats_text = (
        f"MAE: {validation_results['mae']:.4f}\n"
        f"Max Diff: {validation_results['max_diff']:.4f}\n"
    )
    if validation_results['original_median']:
        stats_text += f"Original Median: {validation_results['original_median']:.2f} mo\n"
    if validation_results['reconstructed_median']:
        stats_text += f"Reconstructed Median: {validation_results['reconstructed_median']:.2f} mo"
    
    ax.text(0.02, 0.98, stats_text, transform=ax.transAxes,
            fontsize=9, verticalalignment='top',
            bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))
    
    plt.tight_layout()
    
    # Save plot
    output_path = os.path.join(output_dir, f'{endpoint}_{arm_name}_comparison.png')
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    print(f"   💾 Saved comparison plot: {output_path}")
    plt.close()

def main():
    """Main test function."""
    # Paths
    csv_path = '../PseuodoIPD/km_data_all_endpoints.csv'
    risk_table_path = '../PseuodoIPD/risk_table_OS.csv'
    output_dir = '../PseuodoIPD/test_reconstruction_output'
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    print("="*60)
    print("IPD Reconstruction Test")
    print("="*60)
    print(f"Loading KM data from: {csv_path}")
    
    # Load KM data
    km_data_all = load_km_data_from_csv(csv_path)
    
    # Load risk table data
    risk_table_all = {}
    if os.path.exists(risk_table_path):
        print(f"Loading risk table from: {risk_table_path}")
        risk_table_all = load_risk_table_from_csv(risk_table_path)
    else:
        print(f"⚠️ Risk table not found at: {risk_table_path}")
        print("   Will estimate at-risk numbers from survival curve")
    
    print(f"\nFound data for endpoints: {list(km_data_all.keys())}")
    for endpoint in km_data_all.keys():
        print(f"  {endpoint}: {list(km_data_all[endpoint].keys())}")
    
    # Test reconstruction for each endpoint and arm
    all_results = {}
    
    for endpoint in km_data_all.keys():
        all_results[endpoint] = {}
        for arm_name in km_data_all[endpoint].keys():
            km_data = km_data_all[endpoint][arm_name]
            
            # Get risk table data for this arm (if available)
            atrisk_data = risk_table_all.get(endpoint, {}).get(arm_name, [])
            
            # Reconstruct IPD
            reconstruction_result = reconstruct_ipd_for_arm(km_data, atrisk_data, arm_name, endpoint)
            
            if reconstruction_result:
                # Validate
                validation = validate_reconstruction(
                    reconstruction_result['data'],
                    km_data,
                    arm_name
                )
                
                # Plot comparison
                plot_comparison(validation, arm_name, endpoint, output_dir)
                
                all_results[endpoint][arm_name] = {
                    'reconstruction': reconstruction_result,
                    'validation': validation
                }
                
                # Print summary
                print(f"\n✅ {endpoint} - {arm_name}:")
                print(f"   Patients: {reconstruction_result['summary']['n_patients']}")
                print(f"   Events: {reconstruction_result['summary']['n_events']}")
                print(f"   Censored: {reconstruction_result['summary']['n_censored']}")
                print(f"   MAE: {validation['mae']:.4f}")
    
    # Calculate Hazard Ratio from reconstructed IPD
    print(f"\n{'='*60}")
    print("Calculating Hazard Ratio from Reconstructed IPD")
    print(f"{'='*60}")
    
    for endpoint in all_results.keys():
        if len(all_results[endpoint]) == 2:
            arms = list(all_results[endpoint].keys())
            # Ensure consistent ordering: Chemotherapy (reference) vs Pembrolizumab (treatment)
            if 'Chemotherapy' in arms and 'Pembrolizumab' in arms:
                arm1 = 'Chemotherapy'  # Reference group
                arm2 = 'Pembrolizumab'  # Treatment group
            else:
                arm1, arm2 = arms[0], arms[1]
            
            # Get reconstructed IPD for both arms
            ipd1 = all_results[endpoint][arm1]['reconstruction']['data']
            ipd2 = all_results[endpoint][arm2]['reconstruction']['data']
            
            # Calculate HR (HR < 1 means treatment better than reference)
            hr_result = calculate_hazard_ratio(ipd1, ipd2, arm1, arm2, endpoint)
            
            print(f"\n{endpoint} Hazard Ratio:")
            print(f"   HR: {hr_result['hr']:.3f} (95% CI: {hr_result['hr_lower']:.3f} - {hr_result['hr_upper']:.3f})")
            print(f"   p-value: {hr_result['p_value']:.4f}")
            if hr_result['p_value'] < 0.05:
                print(f"   ✅ Statistically significant (p < 0.05)")
            else:
                print(f"   ⚠️ Not statistically significant (p >= 0.05)")
            
            # Compare with published HR if known
            published_hr = 0.60  # From the overlay plot
            hr_diff = abs(hr_result['hr'] - published_hr)
            print(f"\n   Comparison with Published HR (0.60):")
            print(f"   Difference: {hr_diff:.3f}")
            if hr_diff < 0.05:
                print(f"   ✅ Excellent match (difference < 0.05)")
            elif hr_diff < 0.10:
                print(f"   ✅ Good match (difference < 0.10)")
            else:
                print(f"   ⚠️ Moderate difference (difference >= 0.10)")
    
    print(f"\n{'='*60}")
    print("Test Complete!")
    print(f"Results saved to: {output_dir}")
    print(f"{'='*60}")

def calculate_hazard_ratio(ipd1: list, ipd2: list, arm1_name: str, arm2_name: str, endpoint: str):
    """Calculate Hazard Ratio between two arms using Cox regression.
    
    Args:
        ipd1: IPD for reference arm (arm1)
        ipd2: IPD for treatment arm (arm2)
        arm1_name: Name of reference arm
        arm2_name: Name of treatment arm
    
    Returns:
        HR < 1 means arm2 (treatment) has lower hazard than arm1 (reference)
    """
    # Combine IPD from both arms
    df1 = pd.DataFrame(ipd1)
    df2 = pd.DataFrame(ipd2)
    
    # Add treatment indicator (0 = reference arm1, 1 = treatment arm2)
    df1['treatment'] = 0
    df2['treatment'] = 1
    
    # Combine
    combined_df = pd.concat([df1, df2], ignore_index=True)
    
    # Keep only numeric columns needed for Cox regression
    # Remove 'arm' column if present (it's a string)
    cols_to_keep = ['time', 'event', 'treatment']
    if 'patient_id' in combined_df.columns:
        cols_to_keep.append('patient_id')
    
    combined_df = combined_df[cols_to_keep].copy()
    
    # Ensure numeric types
    combined_df['time'] = pd.to_numeric(combined_df['time'])
    combined_df['event'] = pd.to_numeric(combined_df['event'])
    combined_df['treatment'] = pd.to_numeric(combined_df['treatment'])
    
    # Fit Cox model
    cph = CoxPHFitter()
    cph.fit(combined_df, duration_col='time', event_col='event')
    
    # Get coefficient and calculate HR
    summary = cph.summary
    coef = summary.loc['treatment', 'coef']
    se = summary.loc['treatment', 'se(coef)']
    
    # HR = exp(coef), where coef is log(HR)
    hr = np.exp(coef)
    
    # Calculate 95% CI
    hr_lower = np.exp(coef - 1.96 * se)
    hr_upper = np.exp(coef + 1.96 * se)
    
    # Get p-value
    p_value = summary.loc['treatment', 'p']
    
    return {
        'hr': float(hr),
        'hr_lower': float(hr_lower),
        'hr_upper': float(hr_upper),
        'p_value': float(p_value),
        'arm1': arm1_name,
        'arm2': arm2_name,
        'endpoint': endpoint
    }

if __name__ == '__main__':
    main()

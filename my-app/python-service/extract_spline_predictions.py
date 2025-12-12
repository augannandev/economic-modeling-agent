#!/usr/bin/env python3
"""
Extract 5-year and 10-year extrapolated values for all spline models
using reconstructed IPD OS files from PseuodoIPD folder
"""

import pandas as pd
import numpy as np
import sys
from pathlib import Path

# Add parent directory to path to import survival_models
sys.path.insert(0, str(Path(__file__).parent))

from survival_models import fit_spline_model

# Paths
base_dir = Path(__file__).parent.parent
ipd_dir = base_dir / 'PseuodoIPD'

chemo_csv = ipd_dir / 'reconstructed_ipd_OS_Chemotherapy.csv'
pembro_csv = ipd_dir / 'reconstructed_ipd_OS_Pembrolizumab.csv'

def load_ipd_from_csv(csv_path):
    """Load IPD from CSV file"""
    df = pd.read_csv(csv_path)
    # Handle quoted headers
    df.columns = df.columns.str.strip().str.replace('"', '')
    
    return {
        'time': df['time'].tolist(),
        'event': df['event'].tolist()
    }

def extract_predictions(model_result, months=60):
    """Extract survival prediction at specified months"""
    if not model_result:
        return None
    
    survival_times = model_result.get('survival_times', [])
    survival_probs = model_result.get('survival_probs', [])
    
    if not survival_times or not survival_probs:
        return None
    
    # Find closest time point or interpolate
    times = np.array(survival_times)
    probs = np.array(survival_probs)
    
    if months <= times.max():
        # Interpolate
        idx = np.searchsorted(times, months)
        if idx == 0:
            return probs[0]
        elif idx >= len(times):
            return probs[-1]
        else:
            # Linear interpolation
            t1, t2 = times[idx-1], times[idx]
            p1, p2 = probs[idx-1], probs[idx]
            return p1 + (p2 - p1) * (months - t1) / (t2 - t1) if t2 != t1 else p1
    else:
        # Extrapolate using last value
        return probs[-1]

def main():
    print("="*80)
    print("Spline Model Extrapolation: 5-Year and 10-Year Predictions")
    print("="*80)
    print(f"Using reconstructed IPD from: {ipd_dir}")
    print()
    
    # Load IPD data
    print("Loading IPD data...")
    chemo_data = load_ipd_from_csv(chemo_csv)
    pembro_data = load_ipd_from_csv(pembro_csv)
    
    print(f"  Chemotherapy: {len(chemo_data['time'])} patients")
    print(f"  Pembrolizumab: {len(pembro_data['time'])} patients")
    print()
    
    # Define spline configurations to test
    scales = ['hazard', 'odds', 'normal']
    knots_options = [3, 4, 5]
    
    results = []
    
    print("Fitting spline models...")
    print("-" * 80)
    
    for arm_name, arm_data in [('Chemotherapy', chemo_data), ('Pembrolizumab', pembro_data)]:
        print(f"\n{arm_name}:")
        print("-" * 80)
        
        arm_key = 'chemo' if arm_name == 'Chemotherapy' else 'pembro'
        
        for scale in scales:
            for knots in knots_options:
                model_name = f"{scale}-scale ({knots} knots)"
                print(f"  Fitting {model_name}...", end=' ')
                
                try:
                    model_result = fit_spline_model(
                        arm_data,
                        arm_key,
                        scale=scale,
                        knots=knots
                    )
                except Exception as e:
                    print(f"✗ Error: {e}")
                    results.append({
                        'arm': arm_name,
                        'model': model_name,
                        'scale': scale,
                        'knots': knots,
                        'aic': 'Failed',
                        'bic': 'Failed',
                        '5_year_survival': None,
                        '10_year_survival': None
                    })
                    continue
                
                if model_result:
                    # Extract 5-year (60 months) and 10-year (120 months) predictions
                    pred_5yr = extract_predictions(model_result, months=60)
                    pred_10yr = extract_predictions(model_result, months=120)
                    
                    # Also try to get from predictions if available
                    if 'predictions' in model_result:
                        pred_5yr = model_result['predictions'].get('60', pred_5yr)
                        pred_10yr = model_result['predictions'].get('120', pred_10yr)
                    
                    aic = model_result.get('aic', 'N/A')
                    bic = model_result.get('bic', 'N/A')
                    
                    results.append({
                        'arm': arm_name,
                        'model': model_name,
                        'scale': scale,
                        'knots': knots,
                        'aic': aic,
                        'bic': bic,
                        '5_year_survival': pred_5yr,
                        '10_year_survival': pred_10yr
                    })
                    
                    pred_5yr_str = f"{pred_5yr:.4f}" if pred_5yr is not None else "N/A"
                    pred_10yr_str = f"{pred_10yr:.4f}" if pred_10yr is not None else "N/A"
                    aic_str = f"{aic:.2f}" if isinstance(aic, (int, float)) else str(aic)
                    print(f"✓ AIC={aic_str}, 5yr={pred_5yr_str}, 10yr={pred_10yr_str}")
                else:
                    print("✗ Failed")
                    results.append({
                        'arm': arm_name,
                        'model': model_name,
                        'scale': scale,
                        'knots': knots,
                        'aic': 'Failed',
                        'bic': 'Failed',
                        '5_year_survival': None,
                        '10_year_survival': None
                    })
    
    # Display results table
    print("\n" + "="*80)
    print("RESULTS SUMMARY")
    print("="*80)
    print()
    
    df_results = pd.DataFrame(results)
    
    # Format for display
    for arm in ['Chemotherapy', 'Pembrolizumab']:
        print(f"{arm}:")
        print("-" * 80)
        arm_results = df_results[df_results['arm'] == arm].copy()
        
        # Sort by AIC
        arm_results = arm_results.sort_values('aic', na_position='last')
        
        print(f"{'Model':<30} {'AIC':<12} {'BIC':<12} {'5-Year':<12} {'10-Year':<12}")
        print("-" * 80)
        
        for _, row in arm_results.iterrows():
            model = row['model']
            aic = f"{row['aic']:.2f}" if isinstance(row['aic'], (int, float)) else str(row['aic'])
            bic = f"{row['bic']:.2f}" if isinstance(row['bic'], (int, float)) else str(row['bic'])
            pred_5yr = f"{row['5_year_survival']:.4f}" if row['5_year_survival'] is not None else "N/A"
            pred_10yr = f"{row['10_year_survival']:.4f}" if row['10_year_survival'] is not None else "N/A"
            
            print(f"{model:<30} {aic:<12} {bic:<12} {pred_5yr:<12} {pred_10yr:<12}")
        
        print()
    
    # Best model per arm
    print("="*80)
    print("BEST MODEL PER ARM (by AIC):")
    print("="*80)
    print()
    
    for arm in ['Chemotherapy', 'Pembrolizumab']:
        arm_results = df_results[df_results['arm'] == arm].copy()
        # Filter out failed models
        arm_results = arm_results[arm_results['aic'] != 'Failed']
        if len(arm_results) > 0:
            best = arm_results.nsmallest(1, 'aic').iloc[0]
            print(f"{arm}:")
            print(f"  Model: {best['model']}")
            print(f"  AIC: {best['aic']:.2f}")
            print(f"  BIC: {best['bic']:.2f}")
            print(f"  5-Year Survival: {best['5_year_survival']:.4f} ({best['5_year_survival']*100:.2f}%)" if best['5_year_survival'] else "  N/A")
            print(f"  10-Year Survival: {best['10_year_survival']:.4f} ({best['10_year_survival']*100:.2f}%)" if best['10_year_survival'] else "  N/A")
            print()

if __name__ == '__main__':
    main()

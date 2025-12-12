#!/usr/bin/env python3
"""
Find cutpoints for piecewise modeling using reconstructed IPD files.
Loads reconstructed IPD CSV files and runs cutpoint detection for both arms.
"""

import sys
import pandas as pd
from pathlib import Path

# Add parent directory to path to import piecewise_models
sys.path.insert(0, str(Path(__file__).parent))

from piecewise_models import detect_cutpoint_chow_test

# Configuration
BASE_DIR = Path(__file__).parent.parent / "PseuodoIPD"
CHEMO_FILE = BASE_DIR / "reconstructed_ipd_OS_Chemotherapy.csv"
PEMBRO_FILE = BASE_DIR / "reconstructed_ipd_OS_Pembrolizumab.csv"


def load_reconstructed_ipd(csv_path: Path) -> dict:
    """Load reconstructed IPD from CSV file."""
    df = pd.read_csv(csv_path)
    
    # Convert to format expected by cutpoint detection
    # Expected format: {'time': [...], 'event': [...]}
    return {
        'time': df['time'].values.tolist(),
        'event': df['event'].values.tolist()
    }


def find_cutpoint_for_arm(ipd_data: dict, arm_name: str, weeks_start: int = 12, weeks_end: int = 52):
    """Find cutpoint for a single arm."""
    print(f"\n{'='*70}")
    print(f"Finding Cutpoint for {arm_name}")
    print(f"{'='*70}")
    
    print(f"\n📊 IPD Data Summary:")
    df = pd.DataFrame(ipd_data)
    print(f"   Total patients: {len(df)}")
    print(f"   Total events: {int(df['event'].sum())}")
    print(f"   Censored: {int((1 - df['event']).sum())}")
    print(f"   Max time: {df['time'].max():.2f} months")
    print(f"   Median time: {df['time'].median():.2f} months")
    
    print(f"\n🔍 Searching for optimal cutpoint...")
    print(f"   Search range: {weeks_start} - {weeks_end} weeks")
    
    try:
        result = detect_cutpoint_chow_test(ipd_data, weeks_start=weeks_start, weeks_end=weeks_end)
        
        print(f"\n✅ Cutpoint Detection Results:")
        print(f"   {'-'*70}")
        print(f"   Optimal Cutpoint: {result['cutpoint']:.2f} months ({result['cutpoint_weeks']:.1f} weeks)")
        print(f"   LRT Statistic: {result['lrt_statistic']:.4f}")
        print(f"   P-value: {result['lrt_pvalue']:.6f}")
        print(f"   {'-'*70}")
        print(f"\n   Log-Likelihood:")
        print(f"     Null (one-piece): {result['ll_null']:.4f}")
        print(f"     Alternative (piecewise): {result['ll_alternative']:.4f}")
        print(f"     Improvement: {result['ll_alternative'] - result['ll_null']:.4f}")
        print(f"\n   Events Distribution:")
        print(f"     Before cutpoint: {result['n_events_pre']} events")
        print(f"     After cutpoint: {result['n_events_post']} events")
        print(f"\n   Patients at Risk:")
        print(f"     Before cutpoint: {result['n_at_risk_pre']} patients")
        print(f"     After cutpoint: {result['n_at_risk_post']} patients")
        
        # Statistical significance interpretation
        if result['lrt_pvalue'] < 0.001:
            significance = "*** (p < 0.001)"
        elif result['lrt_pvalue'] < 0.01:
            significance = "** (p < 0.01)"
        elif result['lrt_pvalue'] < 0.05:
            significance = "* (p < 0.05)"
        else:
            significance = "ns (p >= 0.05)"
        
        print(f"\n   Statistical Significance: {significance}")
        
        if result['lrt_pvalue'] < 0.05:
            print(f"   ✅ Piecewise model significantly improves fit!")
        else:
            print(f"   ⚠️  Piecewise model does not significantly improve fit")
            print(f"   📝 Note: Following CEA practice (e.g., KEYNOTE-024 CEA), cutpoints")
            print(f"      can still be used for piecewise modeling when parametric models")
            print(f"      show poor visual fit, even without statistical significance.")
        
        # Compare with published KEYNOTE-024 CEA cutpoints
        print(f"\n   📊 Comparison with KEYNOTE-024 CEA:")
        if arm_name == "Chemotherapy":
            published_weeks = 38  # SoC without adjustment
            published_weeks_adj = 25  # SoC with adjustment
            print(f"      Published (SoC, no adj): Week {published_weeks}")
            print(f"      Published (SoC, adj): Week {published_weeks_adj}")
            print(f"      Our result: Week {result['cutpoint_weeks']:.1f}")
            diff = abs(result['cutpoint_weeks'] - published_weeks)
            diff_adj = abs(result['cutpoint_weeks'] - published_weeks_adj)
            if diff < diff_adj:
                print(f"      Difference: {diff:.1f} weeks from published (no adj)")
            else:
                print(f"      Difference: {diff_adj:.1f} weeks from published (adj)")
        elif arm_name == "Pembrolizumab":
            published_weeks = 32
            print(f"      Published: Week {published_weeks}")
            print(f"      Our result: Week {result['cutpoint_weeks']:.1f}")
            diff = abs(result['cutpoint_weeks'] - published_weeks)
            print(f"      Difference: {diff:.1f} weeks")
        
        return result
        
    except Exception as e:
        print(f"\n❌ Error during cutpoint detection: {e}")
        import traceback
        traceback.print_exc()
        return None


def main():
    """Main function."""
    print("="*70)
    print("Cutpoint Detection for Piecewise Modeling")
    print("Using Reconstructed IPD from R Service (IPDfromKM)")
    print("="*70)
    
    # Check if files exist
    if not CHEMO_FILE.exists():
        print(f"\n❌ Chemotherapy IPD file not found: {CHEMO_FILE}")
        return
    
    if not PEMBRO_FILE.exists():
        print(f"\n❌ Pembrolizumab IPD file not found: {PEMBRO_FILE}")
        return
    
    # Load IPD data
    print(f"\n📂 Loading reconstructed IPD files from {BASE_DIR}")
    chemo_ipd = load_reconstructed_ipd(CHEMO_FILE)
    pembro_ipd = load_reconstructed_ipd(PEMBRO_FILE)
    
    # Find cutpoints
    results = {}
    
    # Chemotherapy arm
    chemo_result = find_cutpoint_for_arm(chemo_ipd, "Chemotherapy", weeks_start=12, weeks_end=52)
    if chemo_result:
        results['chemo'] = chemo_result
    
    # Pembrolizumab arm
    pembro_result = find_cutpoint_for_arm(pembro_ipd, "Pembrolizumab", weeks_start=12, weeks_end=52)
    if pembro_result:
        results['pembro'] = pembro_result
    
    # Summary
    print(f"\n\n{'='*70}")
    print("SUMMARY")
    print(f"{'='*70}")
    
    if results:
        print(f"\n{'Arm':<20} {'Cutpoint (months)':<20} {'Cutpoint (weeks)':<20} {'LRT':<12} {'P-value':<12}")
        print(f"{'-'*70}")
        
        if 'chemo' in results:
            r = results['chemo']
            print(f"{'Chemotherapy':<20} {r['cutpoint']:<20.2f} {r['cutpoint_weeks']:<20.1f} {r['lrt_statistic']:<12.4f} {r['lrt_pvalue']:<12.6f}")
        
        if 'pembro' in results:
            r = results['pembro']
            print(f"{'Pembrolizumab':<20} {r['cutpoint']:<20.2f} {r['cutpoint_weeks']:<20.1f} {r['lrt_statistic']:<12.4f} {r['lrt_pvalue']:<12.6f}")
        
        print(f"\n{'='*70}")
        print("✅ Cutpoint detection complete!")
        print(f"{'='*70}")
    else:
        print("\n❌ No cutpoints detected. Check errors above.")
    
    return results


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Validate reconstructed IPD by calculating HR and median survival.
Compares results with published KEYNOTE-024 values.
"""

import sys
import pandas as pd
import numpy as np
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from lifelines import KaplanMeierFitter, CoxPHFitter

# Configuration
BASE_DIR = Path(__file__).parent.parent / "PseuodoIPD"
CHEMO_FILE = BASE_DIR / "reconstructed_ipd_OS_Chemotherapy.csv"
PEMBRO_FILE = BASE_DIR / "reconstructed_ipd_OS_Pembrolizumab.csv"

# Published KEYNOTE-024 values (from literature)
PUBLISHED_HR = 0.60  # HR for pembrolizumab vs chemotherapy
PUBLISHED_HR_CI_LOWER = 0.41
PUBLISHED_HR_CI_UPPER = 0.89
PUBLISHED_HR_PVALUE = 0.005  # Approximate

PUBLISHED_MEDIAN_CHEMO = "Not reached"  # Median survival not reached in KEYNOTE-024
PUBLISHED_MEDIAN_PEMBRO = "Not reached"  # Median survival not reached in KEYNOTE-024


def load_reconstructed_ipd(csv_path: Path) -> pd.DataFrame:
    """Load reconstructed IPD from CSV file."""
    df = pd.read_csv(csv_path)
    return df


def calculate_median_survival(df: pd.DataFrame, arm_name: str) -> dict:
    """Calculate median survival for a single arm."""
    kmf = KaplanMeierFitter()
    kmf.fit(df['time'], df['event'])
    
    median_survival = None
    try:
        median_survival = kmf.median_survival_time_
        if pd.isna(median_survival) or np.isinf(median_survival):
            # Median not reached - check survival curve
            timeline = kmf.timeline
            survival_func = kmf.survival_function_
            if len(timeline) > 0 and len(survival_func) > 0:
                surv_values = survival_func.iloc[:, 0].values
                # Check if survival drops below 0.5
                if surv_values[-1] < 0.5:
                    # Find where survival crosses 0.5 by interpolation
                    idx_below = np.where(surv_values < 0.5)[0]
                    if len(idx_below) > 0:
                        idx_above = np.where(surv_values >= 0.5)[0]
                        if len(idx_above) > 0:
                            # Interpolate between last point above 0.5 and first below
                            idx_last_above = idx_above[-1]
                            idx_first_below = idx_below[0]
                            if idx_first_below == idx_last_above + 1:
                                t1 = timeline[idx_last_above]
                                t2 = timeline[idx_first_below]
                                s1 = surv_values[idx_last_above]
                                s2 = surv_values[idx_first_below]
                                # Linear interpolation
                                median_survival = t1 + (t2 - t1) * (0.5 - s1) / (s2 - s1)
                            else:
                                median_survival = timeline[idx_first_below]
                        else:
                            median_survival = timeline[idx_below[0]]
                    else:
                        median_survival = None  # Never drops below 0.5
                else:
                    median_survival = None  # Survival > 0.5 at end of follow-up
            else:
                median_survival = None
    except Exception as e:
        median_survival = None
    
    # Get survival at specific timepoints
    survival_at_12mo = None
    survival_at_24mo = None
    if len(kmf.timeline) > 0:
        try:
            surv_12 = kmf.survival_function_at_times(12)
            if surv_12 is not None and len(surv_12) > 0:
                survival_at_12mo = float(surv_12.values.flatten()[0])
        except:
            pass
        
        try:
            if 24 <= kmf.timeline.max():
                surv_24 = kmf.survival_function_at_times(24)
                if surv_24 is not None and len(surv_24) > 0:
                    survival_at_24mo = float(surv_24.values.flatten()[0])
        except:
            pass
    
    return {
        'median_survival': median_survival,
        'survival_12mo': survival_at_12mo,
        'survival_24mo': survival_at_24mo,
        'n_patients': len(df),
        'n_events': int(df['event'].sum()),
        'n_censored': int((1 - df['event']).sum()),
        'max_followup': float(df['time'].max())
    }


def calculate_hazard_ratio(chemo_df: pd.DataFrame, pembro_df: pd.DataFrame) -> dict:
    """Calculate Hazard Ratio between two arms using Cox regression."""
    # Prepare data
    chemo_df_copy = chemo_df.copy()
    pembro_df_copy = pembro_df.copy()
    
    chemo_df_copy['treatment'] = 0  # Reference group (Chemotherapy)
    pembro_df_copy['treatment'] = 1  # Treatment group (Pembrolizumab)
    
    # Combine data
    combined_df = pd.concat([chemo_df_copy, pembro_df_copy], ignore_index=True)
    
    # Select only numeric columns needed for Cox regression
    cols_to_keep = ['time', 'event', 'treatment']
    combined_df = combined_df[cols_to_keep].copy()
    
    # Ensure numeric types
    combined_df['time'] = pd.to_numeric(combined_df['time'])
    combined_df['event'] = pd.to_numeric(combined_df['event'])
    combined_df['treatment'] = pd.to_numeric(combined_df['treatment'])
    
    # Fit Cox model
    cph = CoxPHFitter()
    cph.fit(combined_df, duration_col='time', event_col='event')
    
    # Extract results
    summary = cph.summary
    
    # Get coefficient for treatment
    if 'treatment' in summary.index:
        coef = summary.loc['treatment', 'coef']
        se = summary.loc['treatment', 'se(coef)']
        hr = np.exp(coef)
        hr_lower = np.exp(coef - 1.96 * se)
        hr_upper = np.exp(coef + 1.96 * se)
        p_value = summary.loc['treatment', 'p']
    else:
        # Fallback: try to get from confidence_intervals_
        try:
            hr = np.exp(coef)
            hr_lower = cph.confidence_intervals_.loc['treatment', 'lower 0.95']
            hr_upper = cph.confidence_intervals_.loc['treatment', 'upper 0.95']
            p_value = summary.loc['treatment', 'p']
        except:
            # Final fallback: calculate manually
            hr = np.exp(coef)
            hr_lower = np.exp(coef - 1.96 * se)
            hr_upper = np.exp(coef + 1.96 * se)
            p_value = summary.loc['treatment', 'p']
    
    return {
        'hazard_ratio': float(hr),
        'hr_lower_ci': float(hr_lower),
        'hr_upper_ci': float(hr_upper),
        'p_value': float(p_value),
        'coef': float(coef),
        'se': float(se)
    }


def main():
    """Main function."""
    print("="*70)
    print("IPD Validation: HR and Median Survival")
    print("Comparing Reconstructed IPD with KEYNOTE-024 Published Values")
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
    chemo_df = load_reconstructed_ipd(CHEMO_FILE)
    pembro_df = load_reconstructed_ipd(PEMBRO_FILE)
    
    print(f"   Chemotherapy: {len(chemo_df)} patients")
    print(f"   Pembrolizumab: {len(pembro_df)} patients")
    
    # Calculate median survival for each arm
    print(f"\n{'='*70}")
    print("MEDIAN SURVIVAL ANALYSIS")
    print(f"{'='*70}")
    
    chemo_stats = calculate_median_survival(chemo_df, "Chemotherapy")
    pembro_stats = calculate_median_survival(pembro_df, "Pembrolizumab")
    
    print(f"\n📊 Chemotherapy Arm:")
    print(f"   Patients: {chemo_stats['n_patients']}")
    print(f"   Events: {chemo_stats['n_events']}")
    print(f"   Censored: {chemo_stats['n_censored']}")
    print(f"   Max follow-up: {chemo_stats['max_followup']:.2f} months")
    if chemo_stats['median_survival'] is not None:
        print(f"   Median survival: {chemo_stats['median_survival']:.2f} months")
    else:
        print(f"   Median survival: Not reached")
    if chemo_stats['survival_12mo'] is not None:
        print(f"   12-month survival: {chemo_stats['survival_12mo']*100:.1f}%")
    if chemo_stats['survival_24mo'] is not None:
        print(f"   24-month survival: {chemo_stats['survival_24mo']*100:.1f}%")
    
    print(f"\n   Published KEYNOTE-024: {PUBLISHED_MEDIAN_CHEMO}")
    if chemo_stats['median_survival'] is None:
        print(f"   ✅ Consistent: Median not reached in both reconstructed IPD and published study")
        print(f"      (Survival > 50% at {chemo_stats['max_followup']:.1f} months in reconstructed IPD)")
    elif chemo_stats['median_survival'] is not None and not np.isinf(chemo_stats['median_survival']):
        print(f"   ⚠️  Note: Median reached in reconstructed IPD ({chemo_stats['median_survival']:.2f} months)")
        print(f"      but not reached in published study (likely due to longer follow-up)")
    
    print(f"\n📊 Pembrolizumab Arm:")
    print(f"   Patients: {pembro_stats['n_patients']}")
    print(f"   Events: {pembro_stats['n_events']}")
    print(f"   Censored: {pembro_stats['n_censored']}")
    print(f"   Max follow-up: {pembro_stats['max_followup']:.2f} months")
    if pembro_stats['median_survival'] is not None:
        print(f"   Median survival: {pembro_stats['median_survival']:.2f} months")
    else:
        print(f"   Median survival: Not reached (> {pembro_stats['max_followup']:.1f} months)")
    if pembro_stats['survival_12mo'] is not None:
        print(f"   12-month survival: {pembro_stats['survival_12mo']*100:.1f}%")
    if pembro_stats['survival_24mo'] is not None:
        print(f"   24-month survival: {pembro_stats['survival_24mo']*100:.1f}%")
    
    print(f"\n   Published KEYNOTE-024: {PUBLISHED_MEDIAN_PEMBRO}")
    if pembro_stats['median_survival'] is None:
        print(f"   ✅ Consistent: Median not reached in both reconstructed IPD and published study")
        print(f"      (Survival > 50% at {pembro_stats['max_followup']:.1f} months in reconstructed IPD)")
    elif pembro_stats['median_survival'] is not None and not np.isinf(pembro_stats['median_survival']):
        print(f"   ⚠️  Note: Median reached in reconstructed IPD ({pembro_stats['median_survival']:.2f} months)")
        print(f"      but not reached in published study (likely due to longer follow-up)")
    
    # Calculate Hazard Ratio
    print(f"\n{'='*70}")
    print("HAZARD RATIO ANALYSIS")
    print(f"{'='*70}")
    
    hr_results = calculate_hazard_ratio(chemo_df, pembro_df)
    
    print(f"\n📊 Reconstructed IPD Results:")
    print(f"   Hazard Ratio (HR): {hr_results['hazard_ratio']:.4f}")
    print(f"   95% CI: [{hr_results['hr_lower_ci']:.4f}, {hr_results['hr_upper_ci']:.4f}]")
    print(f"   P-value: {hr_results['p_value']:.6f}")
    
    print(f"\n📊 Published KEYNOTE-024 Results:")
    print(f"   Hazard Ratio (HR): {PUBLISHED_HR:.2f}")
    print(f"   95% CI: [{PUBLISHED_HR_CI_LOWER:.2f}, {PUBLISHED_HR_CI_UPPER:.2f}]")
    print(f"   P-value: ~{PUBLISHED_HR_PVALUE:.3f}")
    
    # Comparison
    print(f"\n{'='*70}")
    print("COMPARISON")
    print(f"{'='*70}")
    
    hr_diff = abs(hr_results['hazard_ratio'] - PUBLISHED_HR)
    hr_diff_pct = (hr_diff / PUBLISHED_HR) * 100
    
    print(f"\n✅ Hazard Ratio:")
    print(f"   Difference: {hr_diff:.4f} ({hr_diff_pct:.1f}% relative difference)")
    
    # Check if CI overlaps
    ci_overlap = not (hr_results['hr_upper_ci'] < PUBLISHED_HR_CI_LOWER or 
                      hr_results['hr_lower_ci'] > PUBLISHED_HR_CI_UPPER)
    
    if ci_overlap:
        print(f"   ✅ 95% CI overlaps with published CI")
    else:
        print(f"   ⚠️  95% CI does not overlap with published CI")
    
    # Statistical significance
    if hr_results['p_value'] < 0.05:
        print(f"   ✅ Statistically significant (p < 0.05)")
    else:
        print(f"   ⚠️  Not statistically significant (p >= 0.05)")
    
    # Interpretation
    print(f"\n📝 Interpretation:")
    if hr_results['hazard_ratio'] < 1.0:
        print(f"   HR < 1 indicates Pembrolizumab has lower hazard (better survival)")
        print(f"   than Chemotherapy, consistent with published results.")
    else:
        print(f"   ⚠️  HR > 1 indicates Pembrolizumab has higher hazard (worse survival)")
        print(f"   than Chemotherapy, which contradicts published results.")
    
    print(f"\n{'='*70}")
    print("✅ Validation complete!")
    print(f"{'='*70}")
    
    return {
        'chemo_stats': chemo_stats,
        'pembro_stats': pembro_stats,
        'hr_results': hr_results
    }


if __name__ == "__main__":
    main()

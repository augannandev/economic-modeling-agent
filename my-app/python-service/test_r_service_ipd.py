#!/usr/bin/env python3
"""
Test R service IPD reconstruction endpoint.
This script validates that the R service /reconstruct-ipd endpoint works correctly
and produces accurate results compared to the standalone R script approach.
"""

import sys
import os
import pandas as pd
import numpy as np
import requests
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Add parent directory to path to import km_extractor
sys.path.insert(0, str(Path(__file__).parent))

from km_extractor import IPDBuilder
from lifelines import KaplanMeierFitter, CoxPHFitter

# Configuration
R_SERVICE_URL = os.environ.get('R_SERVICE_URL', 'http://localhost:8001')
BASE_DIR = Path(__file__).parent.parent / "PseuodoIPD"
KM_FILE = BASE_DIR / "km_data_all_endpoints.csv"
RISK_FILE = BASE_DIR / "risk_table_OS.csv"


def load_km_data_from_csv(csv_path: Path) -> Dict:
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


def load_risk_table_from_csv(csv_path: Path) -> Dict:
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


def check_r_service_health() -> bool:
    """Check if R service is available."""
    try:
        response = requests.get(f"{R_SERVICE_URL}/", timeout=2)
        if response.ok:
            result = response.json()
            print(f"✅ R service is available at {R_SERVICE_URL}")
            print(f"   Available models: {result.get('models', [])}")
            return True
        else:
            print(f"❌ R service returned status {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ R service not available at {R_SERVICE_URL}: {e}")
        return False


def call_r_service_reconstruct_ipd(
    km_times: List[float],
    km_survival: List[float],
    atrisk_times: Optional[List[float]] = None,
    atrisk_n: Optional[List[int]] = None,
    total_patients: int = 100
) -> Optional[Dict]:
    """Call R service /reconstruct-ipd endpoint."""
    payload = {
        'km_times': km_times,
        'km_survival': km_survival,
        'atrisk_times': atrisk_times if atrisk_times else None,
        'atrisk_n': atrisk_n if atrisk_n else None,
        'total_patients': total_patients
    }
    
    try:
        response = requests.post(
            f"{R_SERVICE_URL}/reconstruct-ipd",
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"❌ R service returned status {response.status_code}")
            print(f"   Response: {response.text[:500]}")
            return None
        
        result = response.json()
        
        # Handle Plumber's list serialization
        success = result.get('success')
        if isinstance(success, list):
            success = success[0] if success else False
        
        if not success:
            error = result.get('error', 'Unknown error')
            print(f"❌ R service error: {error}")
            return None
        
        # Extract IPD data
        ipd_data = result.get('data', {})
        if not ipd_data:
            print("❌ No IPD data in response")
            return None
        
        ipd_times = ipd_data.get('time', [])
        ipd_events = ipd_data.get('event', [])
        
        # Handle Plumber list serialization
        if isinstance(ipd_times, list) and len(ipd_times) > 0 and isinstance(ipd_times[0], list):
            ipd_times = ipd_times[0]
        if isinstance(ipd_events, list) and len(ipd_events) > 0 and isinstance(ipd_events[0], list):
            ipd_events = ipd_events[0]
        
        # Extract summary
        summary = result.get('summary', {})
        n_patients = summary.get('n_patients', len(ipd_times))
        n_events = summary.get('n_events', sum(ipd_events))
        n_censored = summary.get('n_censored', len(ipd_times) - sum(ipd_events))
        
        if isinstance(n_patients, list):
            n_patients = n_patients[0]
        if isinstance(n_events, list):
            n_events = n_events[0]
        if isinstance(n_censored, list):
            n_censored = n_censored[0]
        
        return {
            'time': ipd_times,
            'event': ipd_events,
            'summary': {
                'n_patients': n_patients,
                'n_events': n_events,
                'n_censored': n_censored
            }
        }
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Request error: {e}")
        return None
    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error: {e}")
        print(f"   Response: {response.text[:500]}")
        return None


def validate_reconstruction(
    ipd_data: Dict,
    original_km_data: Dict,
    arm_name: str
) -> Dict:
    """Validate reconstructed IPD by comparing KM curves."""
    print(f"\n📊 Validating reconstruction for {arm_name}...")
    
    # Convert IPD to DataFrame
    ipd_df = pd.DataFrame({
        'time': ipd_data['time'],
        'event': ipd_data['event']
    })
    
    # Fit KM curve to reconstructed IPD
    kmf = KaplanMeierFitter()
    kmf.fit(ipd_df['time'], ipd_df['event'])
    
    # Get survival estimates at original timepoints
    original_times = np.array(original_km_data['time'])
    original_survival = np.array(original_km_data['survival'])
    
    # Get reconstructed survival at original timepoints
    reconstructed_survival = kmf.survival_function_at_times(original_times).values.flatten()
    
    # Calculate differences
    abs_diff = np.abs(original_survival - reconstructed_survival)
    rel_diff_pct = 100 * abs_diff / (original_survival + 1e-10)  # Avoid division by zero
    
    mae = np.mean(abs_diff)
    max_diff = np.max(abs_diff)
    max_rel_diff_pct = np.max(rel_diff_pct)
    
    # Calculate median survival
    median_survival = None
    try:
        median_survival = kmf.median_survival_time_
        if pd.isna(median_survival):
            # Interpolate if median not reached
            timeline = kmf.timeline
            survival_func = kmf.survival_function_
            if len(timeline) > 0 and len(survival_func) > 0:
                surv_values = survival_func.iloc[:, 0].values
                if surv_values[-1] < 0.5:
                    # Find where survival crosses 0.5
                    idx = np.where(surv_values < 0.5)[0]
                    if len(idx) > 0:
                        median_survival = timeline[idx[0]]
                    else:
                        median_survival = "Not reached"
                else:
                    median_survival = "Not reached"
    except:
        median_survival = "Not calculated"
    
    print(f"   ✅ MAE: {mae:.4f} ({mae*100:.2f}%)")
    print(f"   ✅ Max absolute difference: {max_diff:.4f} ({max_diff*100:.2f}%)")
    print(f"   ✅ Max relative difference: {max_rel_diff_pct:.2f}%")
    if isinstance(median_survival, (int, float)):
        print(f"   ✅ Median survival: {median_survival:.2f} months")
    else:
        print(f"   ⚠️  Median survival: {median_survival}")
    
    return {
        'mae': mae,
        'max_diff': max_diff,
        'max_rel_diff_pct': max_rel_diff_pct,
        'median_survival': median_survival,
        'n_patients': len(ipd_df),
        'n_events': int(ipd_df['event'].sum()),
        'n_censored': int((1 - ipd_df['event']).sum())
    }


def test_r_service_reconstruction(
    endpoint: str,
    arm: str,
    km_data: Dict,
    risk_data: Optional[Dict] = None
) -> Optional[Dict]:
    """Test R service reconstruction for a specific endpoint/arm."""
    print(f"\n{'='*70}")
    print(f"Testing R Service IPD Reconstruction")
    print(f"Endpoint: {endpoint}, Arm: {arm}")
    print(f"{'='*70}")
    
    # Get KM data
    arm_km = km_data.get(endpoint, {}).get(arm)
    if not arm_km:
        print(f"❌ No KM data found for {endpoint} - {arm}")
        return None
    
    km_times = arm_km['time']
    km_survival = arm_km['survival']
    
    # Get at-risk data if available
    atrisk_times = None
    atrisk_n = None
    total_patients = 100
    
    if risk_data:
        arm_risk = risk_data.get(endpoint, {}).get(arm)
        if arm_risk:
            atrisk_times = [r['time'] for r in arm_risk]
            atrisk_n = [r['atRisk'] for r in arm_risk]
            if atrisk_n:
                total_patients = atrisk_n[0]  # Use first at-risk count
    
    print(f"\n📋 Input Data:")
    print(f"   KM points: {len(km_times)}")
    print(f"   At-risk points: {len(atrisk_times) if atrisk_times else 0}")
    print(f"   Total patients: {total_patients}")
    
    # Call R service
    print(f"\n🔧 Calling R service at {R_SERVICE_URL}/reconstruct-ipd...")
    ipd_result = call_r_service_reconstruct_ipd(
        km_times=km_times,
        km_survival=km_survival,
        atrisk_times=atrisk_times,
        atrisk_n=atrisk_n,
        total_patients=total_patients
    )
    
    if not ipd_result:
        print("❌ R service reconstruction failed")
        return None
    
    print(f"\n✅ R Service Reconstruction Successful:")
    summary = ipd_result['summary']
    print(f"   Patients: {summary['n_patients']}")
    print(f"   Events: {summary['n_events']}")
    print(f"   Censored: {summary['n_censored']}")
    
    # Validate reconstruction
    validation = validate_reconstruction(ipd_result, arm_km, arm)
    
    return {
        'ipd_data': ipd_result,
        'validation': validation,
        'summary': summary
    }


def compare_with_python_fallback(
    endpoint: str,
    arm: str,
    km_data: Dict,
    risk_data: Optional[Dict] = None
) -> Dict:
    """Compare R service results with Python fallback."""
    print(f"\n{'='*70}")
    print(f"Comparing R Service vs Python Fallback")
    print(f"Endpoint: {endpoint}, Arm: {arm}")
    print(f"{'='*70}")
    
    # Get KM data
    arm_km = km_data.get(endpoint, {}).get(arm)
    if not arm_km:
        print(f"❌ No KM data found for {endpoint} - {arm}")
        return {}
    
    # Convert to format expected by IPDBuilder
    km_points = [
        {'time': t, 'survival': s}
        for t, s in zip(arm_km['time'], arm_km['survival'])
    ]
    
    # Get at-risk data
    atrisk_points = []
    if risk_data:
        arm_risk = risk_data.get(endpoint, {}).get(arm)
        if arm_risk:
            atrisk_points = arm_risk
    
    # Test R service (should be called first by IPDBuilder)
    print(f"\n🔧 Testing via IPDBuilder (will try R service first)...")
    builder = IPDBuilder()
    result = builder.reconstruct_ipd_guyot(km_points, atrisk_points, arm)
    
    if not result.get('success'):
        print(f"❌ Reconstruction failed: {result.get('error', 'Unknown error')}")
        return {}
    
    ipd_data = result.get('data', [])
    if not ipd_data:
        print("❌ No IPD data returned")
        return {}
    
    print(f"\n✅ IPDBuilder Reconstruction Successful:")
    print(f"   Patients: {len(ipd_data)}")
    print(f"   Events: {sum(d.get('event', 0) for d in ipd_data)}")
    print(f"   Method: {result.get('method', 'unknown')}")
    
    # Validate
    validation = validate_reconstruction(
        {'time': [d['time'] for d in ipd_data], 'event': [d['event'] for d in ipd_data]},
        arm_km,
        arm
    )
    
    return {
        'ipd_data': ipd_data,
        'validation': validation,
        'method': result.get('method', 'unknown')
    }


def main():
    """Main test function."""
    print("="*70)
    print("R Service IPD Reconstruction Test")
    print("="*70)
    
    # Check R service health
    if not check_r_service_health():
        print("\n⚠️  R service is not available. Some tests will be skipped.")
        print("   Start the R service with: cd r-service && Rscript main.R")
        return
    
    # Load data
    if not KM_FILE.exists():
        print(f"❌ KM data file not found: {KM_FILE}")
        return
    
    print(f"\n📂 Loading data from {BASE_DIR}")
    km_data = load_km_data_from_csv(KM_FILE)
    
    risk_data = None
    if RISK_FILE.exists():
        risk_data = load_risk_table_from_csv(RISK_FILE)
        print(f"   ✅ Loaded risk table data")
    else:
        print(f"   ⚠️  Risk table not found: {RISK_FILE}")
    
    # Test each endpoint/arm combination
    results = {}
    
    for endpoint in km_data.keys():
        for arm in km_data[endpoint].keys():
            print(f"\n\n{'#'*70}")
            print(f"Testing: {endpoint} - {arm}")
            print(f"{'#'*70}")
            
            # Test 1: Direct R service call
            r_result = test_r_service_reconstruction(endpoint, arm, km_data, risk_data)
            
            # Test 2: Via IPDBuilder (which should use R service)
            python_result = compare_with_python_fallback(endpoint, arm, km_data, risk_data)
            
            results[f"{endpoint}_{arm}"] = {
                'r_service': r_result,
                'python_builder': python_result
            }
    
    # Summary
    print(f"\n\n{'='*70}")
    print("TEST SUMMARY")
    print(f"{'='*70}")
    
    for key, result in results.items():
        print(f"\n{key}:")
        if result['r_service']:
            val = result['r_service']['validation']
            print(f"  R Service: MAE={val['mae']:.4f}, Max Rel Diff={val['max_rel_diff_pct']:.2f}%")
        if result['python_builder']:
            val = result['python_builder']['validation']
            method = result['python_builder'].get('method', 'unknown')
            print(f"  Python ({method}): MAE={val['mae']:.4f}, Max Rel Diff={val['max_rel_diff_pct']:.2f}%")
    
    print(f"\n{'='*70}")
    print("✅ Testing complete!")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()

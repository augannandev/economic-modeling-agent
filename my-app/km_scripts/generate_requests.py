#!/usr/bin/env python3
"""
Generate SurvLab+ API request JSONs from real KN024 data files.
This script converts the real-world KN024 data into the format expected by the SurvLab+ API.
"""

import pandas as pd
import json
from pathlib import Path
from typing import List, Dict, Any

def load_km_data(endpoint: str) -> List[Dict[str, Any]]:
    """Load Kaplan-Meier data from CSV files."""
    km_data = []
    
    # Load Pembrolizumab data
    pembro_file = f"final_pembrolizumab_{endpoint.lower()}_gran0.25.csv"
    pembro_df = pd.read_csv(pembro_file)
    for _, row in pembro_df.iterrows():
        km_data.append({
            "endpoint": row["endpoint"],
            "arm": row["arm"],
            "time_months": float(row["time_months"]),
            "survival": float(row["survival"])
        })
    
    # Load Chemotherapy data
    chemo_file = f"final_chemotherapy_{endpoint.lower()}_gran0.25.csv"
    chemo_df = pd.read_csv(chemo_file)
    for _, row in chemo_df.iterrows():
        km_data.append({
            "endpoint": row["endpoint"],
            "arm": row["arm"],
            "time_months": float(row["time_months"]),
            "survival": float(row["survival"])
        })
    
    return km_data

def load_atrisk_data(endpoint: str) -> List[Dict[str, Any]]:
    """Load at-risk data from CSV file."""
    atrisk_data = []
    risk_file = f"risk_table_{endpoint}.csv"
    risk_df = pd.read_csv(risk_file)
    
    for _, row in risk_df.iterrows():
        atrisk_data.append({
            "endpoint": row["endpoint"],
            "arm": row["arm"],
            "time_months": float(row["time_months"]),
            "n_risk": int(row["n_risk"])
        })
    
    return atrisk_data

def load_metadata(endpoint: str) -> Dict[str, Any]:
    """Load metadata from JSON file and convert to SurvLab+ format."""
    metadata_file = f"metadata_{endpoint}.json"
    with open(metadata_file, 'r') as f:
        raw_metadata = json.load(f)
    
    # Convert to SurvLab+ format
    metadata = {
        "study_id": f"KN024-{endpoint}",
        "endpoint": endpoint,
        "plot_type": raw_metadata["plot_type"],
        "curves": [
            {
                "name": curve["name"],
                "color": curve["color"],
                "description": curve["description"]
            }
            for curve in raw_metadata["curves"]
        ],
        "axis_labels": {
            "x": raw_metadata["axis_labels"]["x_label"],
            "y": raw_metadata["axis_labels"]["y_label"]
        },
        "validation": {
            "hr_anchor": {
                "value": raw_metadata["validation"]["hr_anchor"]["value"],
                "ci_low": raw_metadata["validation"]["hr_anchor"]["ci_low"],
                "ci_high": raw_metadata["validation"]["hr_anchor"]["ci_high"],
                "tol_abs": raw_metadata["validation"]["hr_anchor"]["tol_abs"]
            },
            "landmarks": raw_metadata["validation"]["landmarks"],
            "median": "NR"  # Not reached for KN024 data
        }
    }
    
    return metadata

def generate_request_json(endpoint: str, horizon_months: int = 240) -> Dict[str, Any]:
    """Generate complete SurvLab+ API request JSON."""
    
    print(f"📊 Generating request for {endpoint}...")
    
    # Load data components
    km_data = load_km_data(endpoint)
    atrisk_data = load_atrisk_data(endpoint)
    metadata = load_metadata(endpoint)
    
    # Create the complete request
    request = {
        "km_data": km_data,
        "atrisk_data": atrisk_data,
        "metadata": metadata,
        "config": {
            "survival_model_config": {
                "families": [
                    "exponential",
                    "weibull", 
                    "lognormal",
                    "loglogistic",
                    "gompertz",
                    "gengamma",
                    "rp_spline",
                    "piecewise_exponential"
                ],
                "rp_spline_dfs": [2, 3, 4],
                "piecewise_cuts": [],
                "horizon_months": horizon_months,
                "independent_fits": True
            },
            "llm_config": {
                "provider": "openai",
                "model": "gpt-4o",
                "temperature": 0.2,
                "max_tokens": 2000,
                "json_mode": True
            }
        }
    }
    
    print(f"   ✅ Loaded {len(km_data)} KM points")
    print(f"   ✅ Loaded {len(atrisk_data)} at-risk points")
    print(f"   ✅ Horizon set to {horizon_months} months")
    
    return request

def main():
    """Generate request JSONs for both OS and PFS endpoints."""
    
    print("🚀 KN024 Real Data Request Generator")
    print("=" * 50)
    print()
    
    # Change to KN24 directory
    script_dir = Path(__file__).parent
    original_dir = Path.cwd()
    
    try:
        import os
        os.chdir(script_dir)
        
        # Generate OS request
        print("📈 OVERALL SURVIVAL (OS)")
        os_request = generate_request_json("OS", horizon_months=120)
        
        # Save OS request
        with open("kn024_real_os_request.json", "w") as f:
            json.dump(os_request, f, indent=2)
        print(f"   💾 Saved: kn024_real_os_request.json")
        
        print()
        
        # Generate PFS request  
        print("📉 PROGRESSION-FREE SURVIVAL (PFS)")
        pfs_request = generate_request_json("PFS", horizon_months=120)
        
        # Save PFS request
        with open("kn024_real_pfs_request.json", "w") as f:
            json.dump(pfs_request, f, indent=2)
        print(f"   💾 Saved: kn024_real_pfs_request.json")
        
        print()
        print("✅ SUCCESS! Real data requests generated")
        print()
        print("🎯 USAGE:")
        print("   curl -X POST \"http://localhost:8001/run/fit\" \\")
        print("        -H \"Content-Type: application/json\" \\")
        print("        -d @survlab_plus/examples/KN24/kn024_real_os_request.json")
        print()
        print("   curl -X POST \"http://localhost:8001/run/fit\" \\")
        print("        -H \"Content-Type: application/json\" \\")
        print("        -d @survlab_plus/examples/KN24/kn024_real_pfs_request.json")
        
    finally:
        os.chdir(original_dir)

if __name__ == "__main__":
    main()

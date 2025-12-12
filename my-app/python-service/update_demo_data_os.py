#!/usr/bin/env python3
"""
Script to replace OS parquet files in demo_data with reconstructed IPD OS data
"""

import pandas as pd
import os
from pathlib import Path

# Paths
base_dir = Path(__file__).parent
demo_dir = base_dir / 'demo_data'
reconstructed_dir = base_dir.parent / 'PseuodoIPD'

# CSV files to convert
chemo_csv = reconstructed_dir / 'reconstructed_ipd_OS_Chemotherapy.csv'
pembro_csv = reconstructed_dir / 'reconstructed_ipd_OS_Pembrolizumab.csv'

# Output parquet files
chemo_parquet = demo_dir / 'ipd_EndpointType.OS_Chemotherapy.parquet'
pembro_parquet = demo_dir / 'ipd_EndpointType.OS_Pembrolizumab.parquet'

def convert_csv_to_parquet(csv_path, parquet_path):
    """Convert CSV to parquet matching the expected format"""
    print(f"Reading {csv_path}...")
    df = pd.read_csv(csv_path)
    
    print(f"Original columns: {df.columns.tolist()}")
    print(f"Original shape: {df.shape}")
    print(f"First few rows:\n{df.head()}")
    
    # Check if we need to add patient_id (if not present)
    if 'patient_id' not in df.columns:
        # Add patient_id as sequential numbers starting from 1
        df['patient_id'] = range(1, len(df) + 1)
        print("Added patient_id column")
    
    # Ensure columns are in the right order: patient_id, time, event, arm
    # Remove endpoint column if present (not needed in parquet)
    columns_to_keep = ['patient_id', 'time', 'event', 'arm']
    if 'endpoint' in df.columns:
        df = df[columns_to_keep]
    else:
        # Reorder to match expected format
        df = df[columns_to_keep]
    
    print(f"Final columns: {df.columns.tolist()}")
    print(f"Final shape: {df.shape}")
    
    # Save as parquet
    print(f"Saving to {parquet_path}...")
    df.to_parquet(parquet_path, index=False)
    print(f"✅ Successfully saved {parquet_path}")
    
    return df

if __name__ == '__main__':
    # Ensure demo_data directory exists
    demo_dir.mkdir(exist_ok=True)
    
    # Convert Chemotherapy
    if chemo_csv.exists():
        print("\n" + "="*60)
        print("Converting Chemotherapy CSV to Parquet")
        print("="*60)
        convert_csv_to_parquet(chemo_csv, chemo_parquet)
    else:
        print(f"❌ Error: {chemo_csv} not found")
    
    # Convert Pembrolizumab
    if pembro_csv.exists():
        print("\n" + "="*60)
        print("Converting Pembrolizumab CSV to Parquet")
        print("="*60)
        convert_csv_to_parquet(pembro_csv, pembro_parquet)
    else:
        print(f"❌ Error: {pembro_csv} not found")
    
    print("\n" + "="*60)
    print("✅ Demo data OS files updated successfully!")
    print("="*60)

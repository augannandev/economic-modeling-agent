"""Load parquet data files"""
import pandas as pd
from typing import Dict, List

def load_parquet_files(chemo_path: str, pembro_path: str) -> tuple[Dict, Dict]:
    """Load parquet files and convert to dict format"""
    chemo_df = pd.read_parquet(chemo_path)
    pembro_df = pd.read_parquet(pembro_path)
    
    chemo_data = {
        "time": chemo_df['time'].tolist() if 'time' in chemo_df.columns else [],
        "event": chemo_df['event'].tolist() if 'event' in chemo_df.columns else [],
        "arm": ["chemo"] * len(chemo_df)
    }
    
    pembro_data = {
        "time": pembro_df['time'].tolist() if 'time' in pembro_df.columns else [],
        "event": pembro_df['event'].tolist() if 'event' in pembro_df.columns else [],
        "arm": ["pembro"] * len(pembro_df)
    }
    
    return chemo_data, pembro_data


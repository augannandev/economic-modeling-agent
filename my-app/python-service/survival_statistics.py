"""Statistical calculations"""
import numpy as np
from typing import Dict

def calculate_statistics(data: Dict) -> Dict:
    """Calculate various survival statistics"""
    times = np.array(data.get('time', []))
    events = np.array(data.get('event', []))
    
    if len(times) == 0:
        return {}
    
    median_survival = np.median(times[events == 1]) if np.any(events == 1) else None
    
    return {
        "median_survival": float(median_survival) if median_survival is not None else None,
        "total_events": int(np.sum(events)),
        "total_patients": len(times),
        "censoring_rate": float(1 - np.mean(events))
    }


"""IPD reconstruction plotting using R service"""
import requests
import os
from typing import Dict, List, Optional


def plot_ipd_reconstruction_r(
    original_times: List[float],
    original_survival: List[float],
    ipd_time: List[float],
    ipd_event: List[int],
    arm_name: str = "Arm",
    endpoint_type: str = "OS"
) -> Optional[Dict]:
    """Generate IPD reconstruction comparison plot using R service.
    
    Args:
        original_times: Original KM curve timepoints
        original_survival: Original KM curve survival probabilities
        ipd_time: Reconstructed IPD time values
        ipd_event: Reconstructed IPD event indicators (1=event, 0=censored)
        arm_name: Name of the treatment arm
        endpoint_type: Type of endpoint (OS, PFS, etc.)
        
    Returns:
        Dict with 'plot_base64' and 'comparison' data, or None if failed
    """
    r_service_url = os.environ.get('R_SERVICE_URL', 'http://localhost:8001')
    
    try:
        # Quick health check
        try:
            health_check = requests.get(f"{r_service_url}/", timeout=2)
            if not health_check.ok:
                print(f"[IPDPlotting] R service not available at {r_service_url}")
                return None
        except requests.exceptions.RequestException:
            print(f"[IPDPlotting] R service not available at {r_service_url}")
            return None
        
        # Prepare payload
        payload = {
            'original_times': original_times,
            'original_survival': original_survival,
            'ipd_time': ipd_time,
            'ipd_event': ipd_event,
            'arm_name': arm_name,
            'endpoint_type': endpoint_type
        }
        
        # Call R service
        response = requests.post(
            f"{r_service_url}/plot-ipd-reconstruction",
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"[IPDPlotting] R service returned status {response.status_code}")
            print(f"   Response: {response.text[:500]}")
            return None
        
        result = response.json()
        
        # Handle Plumber's list serialization
        success = result.get('success')
        if isinstance(success, list):
            success = success[0] if success else False
        
        if not success:
            error = result.get('error', 'Unknown error')
            print(f"[IPDPlotting] R service error: {error}")
            return None
        
        plot_base64 = result.get('plot_base64')
        if isinstance(plot_base64, list):
            plot_base64 = plot_base64[0] if plot_base64 else None
        
        comparison = result.get('comparison', {})
        
        return {
            'plot_base64': plot_base64,
            'comparison': comparison
        }
        
    except requests.exceptions.RequestException as e:
        print(f"[IPDPlotting] Request error: {e}")
        return None
    except Exception as e:
        print(f"[IPDPlotting] Unexpected error: {e}")
        return None


def plot_km_from_ipd_r(
    chemo_time: List[float],
    chemo_event: List[int],
    pembro_time: List[float],
    pembro_event: List[int],
    endpoint_type: str = "OS"
) -> Optional[Dict]:
    """Generate combined KM plot from IPD data using R service.
    
    Args:
        chemo_time: Chemotherapy arm time values
        chemo_event: Chemotherapy arm event indicators (1=event, 0=censored)
        pembro_time: Pembrolizumab arm time values
        pembro_event: Pembrolizumab arm event indicators (1=event, 0=censored)
        endpoint_type: Type of endpoint (OS, PFS, etc.)
        
    Returns:
        Dict with 'plot_base64' and 'p_value', or None if failed
    """
    r_service_url = os.environ.get('R_SERVICE_URL', 'http://localhost:8001')
    
    try:
        # Quick health check
        try:
            health_check = requests.get(f"{r_service_url}/", timeout=2)
            if not health_check.ok:
                print(f"[IPDPlotting] R service not available at {r_service_url}")
                return None
        except requests.exceptions.RequestException:
            print(f"[IPDPlotting] R service not available at {r_service_url}")
            return None
        
        # Prepare payload
        payload = {
            'chemo_time': chemo_time,
            'chemo_event': chemo_event,
            'pembro_time': pembro_time,
            'pembro_event': pembro_event,
            'endpoint_type': endpoint_type
        }
        
        # Call R service
        response = requests.post(
            f"{r_service_url}/plot-km-from-ipd",
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"[IPDPlotting] R service returned status {response.status_code}")
            print(f"   Response: {response.text[:500]}")
            return None
        
        result = response.json()
        
        # Handle Plumber's list serialization
        success = result.get('success')
        if isinstance(success, list):
            success = success[0] if success else False
        
        if not success:
            error = result.get('error', 'Unknown error')
            print(f"[IPDPlotting] R service error: {error}")
            return None
        
        plot_base64 = result.get('plot_base64')
        if isinstance(plot_base64, list):
            plot_base64 = plot_base64[0] if plot_base64 else None
        
        p_value = result.get('p_value')
        if isinstance(p_value, list):
            p_value = p_value[0] if p_value else None
        
        return {
            'plot_base64': plot_base64,
            'p_value': p_value
        }
        
    except requests.exceptions.RequestException as e:
        print(f"[IPDPlotting] Request error: {e}")
        return None
    except Exception as e:
        print(f"[IPDPlotting] Unexpected error: {e}")
        return None

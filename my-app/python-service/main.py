"""
FastAPI service for survival analysis
Provides endpoints for fitting survival models, generating plots, and statistical analysis
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uvicorn

app = FastAPI(title="Survival Analysis Service")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import analysis modules
from survival_models import fit_km_curves, fit_one_piece_model, fit_spline_model
from piecewise_models import fit_piecewise_model
from ph_testing import test_proportional_hazards
from plotting import generate_dual_plots
from survival_statistics import calculate_statistics

# Request/Response models
class ParquetDataRequest(BaseModel):
    chemo_path: str
    pembro_path: str

class ParquetData(BaseModel):
    time: List[float]
    event: List[int]
    arm: List[str]

class DataPair(BaseModel):
    chemo: ParquetData
    pembro: ParquetData

class ModelFitRequest(BaseModel):
    data: ParquetData
    arm: str
    distribution: Optional[str] = None
    scale: Optional[str] = None
    knots: Optional[int] = None
    cutpoint: Optional[float] = None
    weeks_start: Optional[int] = 12
    weeks_end: Optional[int] = 52

class PlotRequest(BaseModel):
    model_id: str
    model_result: Dict[str, Any]
    km_data: Dict[str, Any]
    original_data: Optional[Dict[str, Any]] = None  # Original time/event data for refitting
    seer_data: Optional[Dict[str, Any]] = None

@app.get("/")
async def root():
    return {"message": "Survival Analysis Service", "status": "running"}

@app.get("/demo-data/{endpoint_type}")
async def get_demo_data(endpoint_type: str = "OS"):
    """
    Load pre-packaged demo IPD data for survival analysis.
    This provides working data for demos without requiring KM Digitizer flow.
    
    Args:
        endpoint_type: "OS" or "PFS"
    """
    try:
        import os
        from pathlib import Path
        
        # Get the demo data directory (relative to this file)
        demo_dir = Path(__file__).parent / "demo_data"
        
        chemo_path = demo_dir / f"ipd_EndpointType.{endpoint_type}_Chemotherapy.parquet"
        pembro_path = demo_dir / f"ipd_EndpointType.{endpoint_type}_Pembrolizumab.parquet"
        
        if not chemo_path.exists() or not pembro_path.exists():
            raise HTTPException(
                status_code=404, 
                detail=f"Demo data not found for endpoint type: {endpoint_type}. Available: OS, PFS"
            )
        
        from data_loader import load_parquet_files
        chemo_data, pembro_data = load_parquet_files(str(chemo_path), str(pembro_path))
        
        return {
            "success": True,
            "endpoint_type": endpoint_type,
            "chemo": chemo_data,
            "pembro": pembro_data,
            "source": "demo_data",
            "message": f"Loaded demo {endpoint_type} data: {len(chemo_data['time'])} chemo patients, {len(pembro_data['time'])} pembro patients"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/demo-data")
async def list_demo_data():
    """List available demo data files"""
    try:
        import os
        from pathlib import Path
        
        demo_dir = Path(__file__).parent / "demo_data"
        
        if not demo_dir.exists():
            return {"available": [], "message": "No demo data directory found"}
        
        files = list(demo_dir.glob("*.parquet"))
        
        # Parse available endpoint types
        endpoint_types = set()
        for f in files:
            # Parse: ipd_EndpointType.{TYPE}_{ARM}.parquet
            parts = f.stem.split("_")
            if len(parts) >= 2:
                endpoint_types.add(parts[1].replace("EndpointType.", ""))
        
        return {
            "available_endpoints": list(endpoint_types),
            "files": [f.name for f in files],
            "demo_dir": str(demo_dir)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/load-data")
async def load_data(request: ParquetDataRequest):
    """Load parquet data files"""
    try:
        from data_loader import load_parquet_files
        chemo_data, pembro_data = load_parquet_files(request.chemo_path, request.pembro_path)
        return {
            "chemo": chemo_data,
            "pembro": pembro_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/fit-km")
async def fit_km(data: DataPair):
    """Fit Kaplan-Meier curves"""
    try:
        result = fit_km_curves(data.chemo.dict(), data.pembro.dict())
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/test-ph")
async def test_ph(data: DataPair):
    """Test proportional hazards assumption"""
    try:
        result = test_proportional_hazards(data.chemo.dict(), data.pembro.dict())
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/fit-one-piece")
async def fit_one_piece(request: ModelFitRequest):
    """Fit one-piece parametric model"""
    try:
        result = fit_one_piece_model(
            request.data.dict(),
            request.arm,
            request.distribution
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/detect-cutpoint")
async def detect_cutpoint(request: ModelFitRequest):
    """Detect optimal cutpoint for piecewise model"""
    try:
        from piecewise_models import detect_cutpoint_chow_test
        cutpoint = detect_cutpoint_chow_test(
            request.data.dict(),
            weeks_start=request.weeks_start or 12,
            weeks_end=request.weeks_end or 52
        )
        return {"cutpoint": cutpoint}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/fit-piecewise")
async def fit_piecewise(request: ModelFitRequest):
    """Fit piecewise parametric model"""
    try:
        result = fit_piecewise_model(
            request.data.dict(),
            request.arm,
            request.distribution,
            request.cutpoint
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/fit-spline")
async def fit_spline(request: ModelFitRequest):
    """Fit Royston-Parmar spline model"""
    try:
        result = fit_spline_model(
            request.data.dict(),
            request.arm,
            request.scale,
            request.knots
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-plots")
async def generate_plots(request: PlotRequest):
    """Generate dual plots (short-term and long-term)"""
    try:
        result = generate_dual_plots(
            request.model_id,
            request.model_result,
            request.km_data,
            request.original_data,  # Pass original data for refitting
            request.seer_data
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/validate-seer")
async def validate_seer(request: Dict[str, Any]):
    """Validate model against SEER benchmark data"""
    try:
        from seer_validation import validate_with_seer
        result = validate_with_seer(
            request.get("model_result"),
            request.get("seer_data_path")
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# KM CURVE EXTRACTION ENDPOINTS
# ============================================================================

class KMExtractionRequest(BaseModel):
    # Either image_path or image_base64 must be provided
    image_path: Optional[str] = None
    image_base64: Optional[str] = None
    risk_table_image: Optional[str] = None  # Path to risk table image
    risk_table_image_base64: Optional[str] = None
    granularity: Optional[float] = 0.25
    endpoint_type: Optional[str] = "OS"
    arm: Optional[str] = "Treatment"
    api_provider: Optional[str] = "anthropic"

class KMExtractionPoint(BaseModel):
    time: float
    survival: float
    id: Optional[str] = None

class RiskTableRow(BaseModel):
    time: float
    atRisk: int
    events: Optional[int] = 0

class ExtractedCurve(BaseModel):
    id: str
    name: str
    color: str
    points: List[KMExtractionPoint]  # Full resolution points
    resampledPoints: Optional[List[KMExtractionPoint]] = None  # Resampled at requested granularity
    riskTable: Optional[List[RiskTableRow]] = None  # Per-arm risk table

class KMExtractionResponse(BaseModel):
    success: bool
    points: Optional[List[KMExtractionPoint]] = None  # First curve points (backwards compat)
    curves: Optional[List[ExtractedCurve]] = None  # All extracted curves
    allPoints: Optional[List[Dict[str, Any]]] = None  # All points with curve info
    riskTable: Optional[List[RiskTableRow]] = None
    axisRanges: Optional[Dict[str, float]] = None
    metadata: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

@app.post("/extract-km-curve", response_model=KMExtractionResponse)
async def extract_km_curve(request: KMExtractionRequest):
    """
    Extract survival curve data from a KM plot image
    
    Uses LLM vision analysis + computer vision to extract:
    - Survival curve points (time, survival)
    - Risk table data (if visible)
    - Plot metadata (axis ranges, arm names, etc.)
    
    Supports both file paths and base64 encoded images.
    """
    try:
        import base64
        from pathlib import Path
        from km_extractor import extract_km_from_base64
        
        # Get image as base64
        image_base64 = request.image_base64
        
        if request.image_path and not image_base64:
            # Load from file path
            image_path = Path(request.image_path)
            if not image_path.exists():
                return KMExtractionResponse(
                    success=False,
                    error=f"Image file not found: {request.image_path}"
                )
            with open(image_path, "rb") as f:
                image_data = f.read()
            image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        if not image_base64:
            return KMExtractionResponse(
                success=False,
                error="Either image_path or image_base64 must be provided"
            )
        
        # Handle risk table image (also support file path)
        risk_table_base64 = request.risk_table_image_base64
        if request.risk_table_image and not risk_table_base64:
            risk_table_path = Path(request.risk_table_image)
            if risk_table_path.exists():
                with open(risk_table_path, "rb") as f:
                    risk_data = f.read()
                risk_table_base64 = base64.b64encode(risk_data).decode('utf-8')
        
        # Log risk table status
        print(f"[KM Extraction] Risk table image provided: {bool(risk_table_base64)}")
        if risk_table_base64:
            print(f"[KM Extraction] Risk table base64 length: {len(risk_table_base64)}")
        
        result = extract_km_from_base64(
            image_base64=image_base64,
            risk_table_image_base64=risk_table_base64,
            granularity=request.granularity,
            endpoint_type=request.endpoint_type,
            arm=request.arm,
            api_provider=request.api_provider
        )
        
        if result.get("success"):
            # Convert curves to response format (including per-arm risk tables)
            curves_data = result.get("curves", [])
            extracted_curves = []
            for curve in curves_data:
                curve_points = [KMExtractionPoint(**p) for p in curve.get("points", [])]
                # Get resampled points if available
                resampled_points = None
                if curve.get("resampledPoints"):
                    resampled_points = [KMExtractionPoint(**p) for p in curve.get("resampledPoints", [])]
                # Get per-arm risk table
                curve_risk_table = [RiskTableRow(**r) for r in curve.get("riskTable", [])]
                extracted_curves.append(ExtractedCurve(
                    id=curve.get("id", ""),
                    name=curve.get("name", ""),
                    color=curve.get("color", ""),
                    points=curve_points,
                    resampledPoints=resampled_points,
                    riskTable=curve_risk_table if curve_risk_table else None
                ))
            
            return KMExtractionResponse(
                success=True,
                points=[KMExtractionPoint(**p) for p in result.get("points", [])],
                curves=extracted_curves if extracted_curves else None,
                allPoints=result.get("allPoints"),
                riskTable=[RiskTableRow(**r) for r in result.get("riskTable", [])],
                axisRanges=result.get("axisRanges"),
                metadata=result.get("metadata")
            )
        else:
            return KMExtractionResponse(
                success=False,
                error=result.get("error", "Unknown extraction error")
            )
            
    except ImportError as e:
        # Missing dependencies
        return KMExtractionResponse(
            success=False,
            error=f"Missing dependencies: {str(e)}. Run: pip install opencv-python anthropic openai pytesseract scipy"
        )
    except Exception as e:
        import traceback
        return KMExtractionResponse(
            success=False,
            error=f"{str(e)}\n{traceback.format_exc()}"
        )

class IPDGenerationRequest(BaseModel):
    km_data: List[Dict[str, Any]]  # [{time, survival}]
    atrisk_data: List[Dict[str, Any]]  # [{time, atRisk, events}]
    output_dir: Optional[str] = None
    endpoint_type: str
    arm: str

@app.post("/generate-ipd")
async def generate_ipd(request: IPDGenerationRequest):
    """
    Generate Pseudo-IPD from KM curve data using full Guyot method
    
    Uses the comprehensive IPDBuilder from km_extractor module which includes:
    - Proper at-risk data alignment
    - Population normalization
    - Event/censoring distribution matching
    """
    try:
        import pandas as pd
        from pathlib import Path
        import tempfile
        
        from km_extractor import generate_ipd_from_km
        
        # Call the comprehensive IPD generator
        result = generate_ipd_from_km(
            km_data=request.km_data,
            atrisk_data=request.atrisk_data,
            endpoint_type=request.endpoint_type,
            arm=request.arm
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "IPD generation failed"))
        
        # Save to parquet
        output_dir = request.output_dir or tempfile.mkdtemp()
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        file_name = f"ipd_EndpointType.{request.endpoint_type}_{request.arm}.parquet"
        file_path = str(Path(output_dir) / file_name)
        
        ipd_df = pd.DataFrame(result["ipd"])
        ipd_df.to_parquet(file_path, index=False)
        
        summary = result.get("summary", {})
        
        return {
            "success": True,
            "file_path": file_path,
            "n_patients": summary.get("n_patients", len(ipd_df)),
            "events": summary.get("n_events", int(ipd_df['event'].sum())),
            "censored": summary.get("n_censored", int((ipd_df['event'] == 0).sum())),
            "median_followup": summary.get("median_followup", float(ipd_df['time'].median()))
        }
        
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Missing dependencies: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint for deployment platforms"""
    return {"status": "healthy", "service": "survival-analysis-python"}

@app.get("/ipd-preview")
async def ipd_preview(endpoint: str = "OS"):
    """
    Get a preview of available IPD data for a given endpoint type.
    
    Returns:
    - KM plot with both arms overlaid
    - Basic statistics (N, events, median survival, follow-up)
    - Data source (digitizer vs demo)
    """
    try:
        import os
        from pathlib import Path
        import pandas as pd
        import numpy as np
        import matplotlib.pyplot as plt
        import matplotlib
        matplotlib.use('Agg')
        from lifelines import KaplanMeierFitter
        import base64
        from io import BytesIO
        
        # Data directory from environment or fallback
        data_dir = os.getenv("DATA_DIRECTORY", "/tmp/survival_data")
        demo_dir = Path(__file__).parent / "demo_data"
        
        # Track data source
        source = "demo"
        chemo_df = None
        pembro_df = None
        
        # 1. Try to find digitizer-generated IPD first
        digitizer_patterns = [
            f"ipd_EndpointType.{endpoint}_Chemotherapy.parquet",
            f"ipd_EndpointType.{endpoint}_chemotherapy.parquet",
            f"ipd_{endpoint}_chemo*.parquet"
        ]
        
        if os.path.exists(data_dir):
            for f in Path(data_dir).glob("*.parquet"):
                if endpoint.lower() in f.name.lower():
                    try:
                        df = pd.read_parquet(f)
                        if 'chemo' in f.name.lower() or 'control' in f.name.lower():
                            chemo_df = df
                            source = "digitizer"
                        elif 'pembro' in f.name.lower() or 'treatment' in f.name.lower():
                            pembro_df = df
                            source = "digitizer"
                    except Exception:
                        pass
        
        # 2. Fall back to demo data if not found
        if chemo_df is None:
            chemo_path = demo_dir / f"ipd_EndpointType.{endpoint}_Chemotherapy.parquet"
            if chemo_path.exists():
                chemo_df = pd.read_parquet(chemo_path)
        
        if pembro_df is None:
            pembro_path = demo_dir / f"ipd_EndpointType.{endpoint}_Pembrolizumab.parquet"
            if pembro_path.exists():
                pembro_df = pd.read_parquet(pembro_path)
        
        # 3. Check if we have data
        if chemo_df is None and pembro_df is None:
            return {
                "source": source,
                "endpoint": endpoint,
                "plot_base64": "",
                "statistics": {
                    "pembro": {"n": 0, "events": 0, "median": 0, "ci_lower": 0, "ci_upper": 0, "follow_up_range": "N/A"},
                    "chemo": {"n": 0, "events": 0, "median": 0, "ci_lower": 0, "ci_upper": 0, "follow_up_range": "N/A"}
                },
                "available": False
            }
        
        # 4. Calculate statistics
        def calc_stats(df):
            if df is None or len(df) == 0:
                return {"n": 0, "events": 0, "median": 0, "ci_lower": 0, "ci_upper": 0, "follow_up_range": "N/A"}
            
            n = len(df)
            events = int(df['event'].sum())
            
            # Fit KM for median survival
            kmf = KaplanMeierFitter()
            kmf.fit(df['time'], df['event'])
            
            median_survival = kmf.median_survival_time_
            ci = kmf.confidence_interval_median_survival_time_
            
            # Handle edge cases where median may not be reached
            median_val = float(median_survival) if not np.isinf(median_survival) else None
            ci_lower = float(ci.iloc[0, 0]) if not np.isnan(ci.iloc[0, 0]) else None
            ci_upper = float(ci.iloc[0, 1]) if not np.isnan(ci.iloc[0, 1]) else None
            
            follow_up = f"{df['time'].min():.1f} - {df['time'].max():.1f} mo"
            
            return {
                "n": n,
                "events": events,
                "median": median_val,
                "ci_lower": ci_lower,
                "ci_upper": ci_upper,
                "follow_up_range": follow_up
            }
        
        pembro_stats = calc_stats(pembro_df)
        chemo_stats = calc_stats(chemo_df)
        
        # 5. Generate KM plot
        fig, ax = plt.subplots(figsize=(10, 7))
        
        # Plot settings
        ax.set_xlim(0, max(
            pembro_df['time'].max() if pembro_df is not None else 0,
            chemo_df['time'].max() if chemo_df is not None else 0
        ) * 1.1)
        ax.set_ylim(0, 1.05)
        ax.set_xlabel("Time (months)", fontsize=12)
        ax.set_ylabel("Survival Probability", fontsize=12)
        ax.set_title(f"{endpoint} - Reconstructed IPD Kaplan-Meier Curves", fontsize=14)
        ax.grid(True, alpha=0.3)
        
        # Plot Pembrolizumab
        if pembro_df is not None and len(pembro_df) > 0:
            kmf_pembro = KaplanMeierFitter()
            kmf_pembro.fit(pembro_df['time'], pembro_df['event'], label='Pembrolizumab')
            kmf_pembro.plot_survival_function(ax=ax, ci_show=True, color='#FF7F0E', linewidth=2)
        
        # Plot Chemotherapy
        if chemo_df is not None and len(chemo_df) > 0:
            kmf_chemo = KaplanMeierFitter()
            kmf_chemo.fit(chemo_df['time'], chemo_df['event'], label='Chemotherapy')
            kmf_chemo.plot_survival_function(ax=ax, ci_show=True, color='#1F77B4', linewidth=2)
        
        ax.legend(loc='lower left', fontsize=11)
        
        # Add data source watermark
        ax.text(0.98, 0.02, f"Source: {source.title()} Data", 
                transform=ax.transAxes, fontsize=9, alpha=0.5, ha='right')
        
        plt.tight_layout()
        
        # Convert to base64
        buffer = BytesIO()
        fig.savefig(buffer, format='png', dpi=120, bbox_inches='tight')
        buffer.seek(0)
        plot_base64 = base64.b64encode(buffer.read()).decode('utf-8')
        plt.close(fig)
        
        return {
            "source": source,
            "endpoint": endpoint,
            "plot_base64": plot_base64,
            "statistics": {
                "pembro": pembro_stats,
                "chemo": chemo_stats
            },
            "available": True
        }
        
    except Exception as e:
        import traceback
        print(f"[IPD Preview] Error: {e}\n{traceback.format_exc()}")
        return {
            "source": "error",
            "endpoint": endpoint,
            "plot_base64": "",
            "statistics": {
                "pembro": {"n": 0, "events": 0, "median": 0, "ci_lower": 0, "ci_upper": 0, "follow_up_range": "N/A"},
                "chemo": {"n": 0, "events": 0, "median": 0, "ci_lower": 0, "ci_upper": 0, "follow_up_range": "N/A"}
            },
            "available": False,
            "error": str(e)
        }

if __name__ == "__main__":
    import os
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)


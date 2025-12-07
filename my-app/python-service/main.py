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

if __name__ == "__main__":
    import os
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)


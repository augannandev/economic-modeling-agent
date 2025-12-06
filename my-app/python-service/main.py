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

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)


# Survival Analysis Python Service

FastAPI service for comprehensive survival analysis including:
- Kaplan-Meier estimation
- One-piece parametric models (6 distributions)
- Piecewise parametric models with automatic cutpoint detection
- Royston-Parmar flexible parametric splines
- Dual-plot generation (short-term and long-term)
- Proportional hazards testing
- SEER validation

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set environment variables:
```bash
export PLOTS_DIRECTORY=./data/plots
export SEER_DATA_PATH=./data/seer  # Optional
```

3. Run the service:
```bash
python main.py
# or
uvicorn main:app --host 0.0.0.0 --port 8000
```

## API Endpoints

- `POST /load-data` - Load parquet data files
- `POST /fit-km` - Fit Kaplan-Meier curves
- `POST /test-ph` - Test proportional hazards
- `POST /fit-one-piece` - Fit one-piece parametric model
- `POST /detect-cutpoint` - Detect optimal cutpoint for piecewise model
- `POST /fit-piecewise` - Fit piecewise parametric model
- `POST /fit-spline` - Fit Royston-Parmar spline model
- `POST /generate-plots` - Generate dual plots
- `POST /validate-seer` - Validate against SEER data

## Notes

- The service expects parquet files with 'time' and 'event' columns
- Plots are saved to the directory specified in PLOTS_DIRECTORY
- Base64-encoded plot data is returned for Vision LLM processing


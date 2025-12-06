# Survival Analysis Agent

An AI-powered survival analysis system for Health Technology Assessment (HTA) submissions, following NICE DSU TSD 14 & 21 guidelines. This system automates the fitting, evaluation, and comparison of survival models for economic evaluations.

## 🎯 Overview

This system provides a comprehensive survival analysis workflow that:

- **Fits multiple survival models** across three approaches (one-piece parametric, piecewise parametric, and flexible parametric splines)
- **Evaluates model quality** using statistical metrics, visual assessment, and LLM-powered reasoning
- **Generates HTA-ready reports** with model comparisons and recommendations
- **Follows NICE DSU guidelines** for survival analysis in economic evaluations

## 🏗️ Architecture

The system consists of three main services:

### 1. **Python Service** (`python-service/`)
- FastAPI service for survival model fitting
- Uses `lifelines` library for parametric models
- Handles Kaplan-Meier estimation, proportional hazards testing, and model fitting
- Generates diagnostic plots and survival predictions

### 2. **R Service** (`r-service/`)
- Plumber API service for advanced survival models
- Provides Gompertz models (via `flexsurv`)
- Royston-Parmar flexible parametric splines (via `rstpm2`)
- Schoenfeld residuals calculation for PH testing

### 3. **Node.js Backend** (`server/`)
- Hono API server orchestrating the analysis workflow
- LangGraph-based agent for workflow management
- LLM integration for model assessment (Vision LLM + Reasoning LLM)
- PostgreSQL database for storing analysis results

### 4. **React Frontend** (`ui/`)
- Modern UI for running analyses and viewing results
- Displays model fits, plots, and LLM assessments
- Interactive model comparison and selection

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 8.0.0
- **Python** 3.11+
- **R** >= 4.0 (for R service)
- **PostgreSQL** (or use embedded PostgreSQL for local dev)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/augannandev/economic-modeling-agent.git
   cd economic-modeling-agent/my-app
   ```

2. **Install Node.js dependencies:**
   ```bash
   pnpm install
   ```

3. **Set up Python service:**
   ```bash
   cd python-service
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

4. **Set up R service:**
   ```bash
   cd r-service
   Rscript -e "install.packages(c('plumber', 'survival', 'flexsurv', 'rstpm2', 'jsonlite'), repos='https://cloud.r-project.org')"
   ```

5. **Configure environment variables:**
   ```bash
   # Copy example env files and configure
   cp server/.env.example server/.env
   # Add your API keys for LLM services (Anthropic, OpenAI)
   ```

### Running the System

1. **Start all services:**
   ```bash
   pnpm run dev
   ```

   This starts:
   - Backend API server (port 5500)
   - Frontend UI (port 5501)
   - Python service (port 8000)
   - R service (port 8001)
   - Embedded PostgreSQL (dynamic port)
   - Firebase Auth emulator (for local dev)

2. **Access the UI:**
   Open `http://localhost:5501` in your browser

3. **Start a new analysis:**
   - Click "Start New Analysis"
   - Select endpoint type (OS or PFS)
   - The system will automatically:
     - Load data from `PseuodoIPD/` folder
     - Fit Kaplan-Meier curves
     - Test proportional hazards assumption
     - Fit 42 models (21 per arm)
     - Generate assessments using LLMs
     - Create synthesis report

## 📊 Features

### Survival Models

**One-Piece Parametric Models:**
- Exponential
- Weibull
- Log-normal
- Log-logistic
- Generalized Gamma
- Gompertz (via R service)

**Piecewise Parametric Models:**
- Same distributions as one-piece
- Automatic cutpoint detection using Chow test
- KM curve used up to cutpoint, parametric model post-cutpoint

**Flexible Parametric Splines (Royston-Parmar):**
- Hazard scale (1, 2, or 3 knots)
- Odds scale (1, 2, or 3 knots)
- Normal scale (1, 2, or 3 knots)

### Model Evaluation

Each model is evaluated using:

1. **Statistical Metrics:**
   - AIC/BIC (within-approach comparison only)
   - Log-likelihood
   - Parameter estimates

2. **Visual Assessment (Vision LLM):**
   - Short-term fit quality (0-30 months)
   - Long-term extrapolation plausibility (up to 20 years)
   - Scores: 0-10 for each dimension

3. **Comprehensive Reasoning (Reasoning LLM):**
   - Statistical performance analysis
   - Visual fit synthesis
   - Extrapolation assessment
   - Clinical plausibility evaluation
   - NICE DSU compliance check
   - Model strengths and weaknesses
   - Recommendations

### Diagnostic Plots

- **Kaplan-Meier survival curves**
- **Log-cumulative hazard plots** (for PH testing)
- **Schoenfeld residuals plots** (for PH testing)
- **Short-term fit plots** (0-30 months)
- **Long-term extrapolation plots** (0-240 months)

## 📁 Project Structure

```
my-app/
├── python-service/          # Python FastAPI service
│   ├── main.py              # FastAPI app
│   ├── survival_models.py   # Model fitting functions
│   ├── plotting.py           # Plot generation
│   ├── ph_testing.py        # Proportional hazards testing
│   └── requirements.txt     # Python dependencies
│
├── r-service/               # R Plumber service
│   ├── main.R               # Service entry point
│   ├── plumber.R            # API router
│   ├── survival_models.R    # R model functions
│   └── requirements.R       # R package list
│
├── server/                   # Node.js backend
│   ├── src/
│   │   ├── agents/          # LangGraph agents
│   │   │   └── survival-agent.ts
│   │   ├── tools/            # Analysis tools
│   │   │   ├── vision-analyzer.ts
│   │   │   ├── reasoning-analyzer.ts
│   │   │   └── synthesis-generator.ts
│   │   ├── services/         # Service clients
│   │   │   ├── python-service.ts
│   │   │   └── r-service.ts
│   │   └── api.ts           # API routes
│   └── package.json
│
├── ui/                      # React frontend
│   ├── src/
│   │   ├── pages/
│   │   │   └── SurvivalAnalysis.tsx
│   │   └── lib/
│   │       └── survivalApi.ts
│   └── package.json
│
└── PseuodoIPD/              # Input data
    ├── ipd_EndpointType.OS_Chemotherapy.parquet
    ├── ipd_EndpointType.OS_Pembrolizumab.parquet
    ├── ipd_EndpointType.PFS_Chemotherapy.parquet
    └── ipd_EndpointType.PFS_Pembrolizumab.parquet
```

## 🔧 Configuration

### Environment Variables

**Backend (`server/.env`):**
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres
PYTHON_SERVICE_URL=http://localhost:8000
R_SERVICE_URL=http://localhost:8001
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

**Python Service:**
- Uses environment variables or defaults to `http://localhost:8001` for R service

**R Service:**
- Runs on port 8001 by default
- Configure via `main.R`

### Data Format

Input data should be Parquet files with columns:
- `time`: Survival/censoring time
- `event`: Event indicator (1 = event, 0 = censored)
- `arm`: Treatment arm identifier

## 📚 API Documentation

### Start Analysis
```http
POST /api/v1/survival/analyses
Content-Type: application/json

{
  "endpointType": "OS" | "PFS"
}
```

### Get Analysis Status
```http
GET /api/v1/survival/analyses/:id
```

### Get Model Details
```http
GET /api/v1/survival/models/:modelId
```

### Delete Analysis
```http
DELETE /api/v1/survival/analyses/:id
```

## 🧪 Testing

### Test Python Service
```bash
cd python-service
source venv/bin/activate
python -m pytest  # If tests are added
```

### Test R Service
```bash
cd r-service
Rscript main.R
# In another terminal:
curl http://localhost:8001/
```

### Test Schoenfeld Residuals Plot
```bash
cd python-service
source venv/bin/activate
python plot_schoenfeld.py
```

## 📖 Documentation

- **NICE DSU TSD 14**: Undertaking survival analysis for economic evaluations alongside clinical trials
- **NICE DSU TSD 21**: Flexible parametric survival models for use in economic evaluations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

See LICENSE file for details.

## 🙏 Acknowledgments

- Built following NICE DSU Technical Support Documents 14 & 21
- Uses `lifelines` (Python) and `flexsurv`/`rstpm2` (R) for survival analysis
- LLM-powered assessments using Anthropic Claude and OpenAI models


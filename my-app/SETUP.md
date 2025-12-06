# Survival Analysis System - Setup Guide

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Python 3.11+
- PostgreSQL (embedded or external)

## Step 1: Database Setup

1. Navigate to server directory:
```bash
cd my-app/server
```

2. Run database migration:
```bash
pnpm db:push
```

3. When prompted about truncating users table, select **"No, add the constraint without truncating the table"**

This will create all the necessary tables for survival analysis:
- `analyses` - Analysis runs
- `models` - Fitted models (42 per analysis)
- `vision_assessments` - Vision LLM assessments
- `reasoning_assessments` - Reasoning LLM assessments
- `plots` - Plot metadata
- `ph_tests` - Proportional hazards test results
- `synthesis_reports` - Final synthesis reports
- `token_usage` - Token usage tracking

## Step 2: Environment Variables

Create or update `.env` file in `my-app/server/` directory:

```bash
# Database (already configured if using embedded PostgreSQL)
DATABASE_URL=postgresql://postgres:password@localhost:5502/postgres

# Firebase (already configured)
FIREBASE_PROJECT_ID=demo-project

# LLM API Keys (REQUIRED)
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here  # Optional fallback

# Service URLs
PYTHON_SERVICE_URL=http://localhost:8000
R_SERVICE_URL=http://localhost:8001

# Data Directories
DATA_DIRECTORY=./my-app/PseuodoIPD
PLOTS_DIRECTORY=./data/plots
SEER_DATA_PATH=./data/seer  # Optional

# Token Limits
MAX_OUTPUT_TOKENS_VISION=2000
MAX_OUTPUT_TOKENS_REASONING=16000
MAX_OUTPUT_TOKENS_SYNTHESIS=8000
```

**Important**: Add your Anthropic API key to use Claude Sonnet 4.5 for vision and reasoning analysis.

## Step 3: Python Service Setup

1. Navigate to python-service directory:
```bash
cd my-app/python-service
```

2. Create a virtual environment (recommended):
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set environment variables (optional):
```bash
export PLOTS_DIRECTORY=../data/plots
export SEER_DATA_PATH=../data/seer
```

5. Start the Python service:
```bash
python main.py
# or
uvicorn main:app --host 0.0.0.0 --port 8000
```

The service will be available at `http://localhost:8000`

## Step 4: Verify Data Files

Ensure your parquet files are in the correct location:
- `my-app/PseuodoIPD/ipd_EndpointType.OS_Chemotherapy.parquet`
- `my-app/PseuodoIPD/ipd_EndpointType.OS_Pembrolizumab.parquet`

## Step 5: Start Development Servers

From the project root (`my-app/`):

1. Start all services (backend, frontend, database, Firebase):
```bash
pnpm dev
```

This will start:
- Backend API on port 8787 (or next available)
- Frontend on port 5173 (or next available)
- PostgreSQL database
- Firebase Auth emulator

2. In a separate terminal, start Python service:
```bash
cd python-service
python main.py
```

## Step 6: Test the System

1. Open the frontend: `http://localhost:5173`
2. Sign in (or use anonymous auth)
3. Navigate to "Survival Analysis" in the sidebar
4. Click "Start New Analysis"
5. Monitor progress in real-time

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running (embedded PostgreSQL starts automatically with `pnpm dev`)
- Check `DATABASE_URL` in `.env` matches the actual database port

### Python Service Issues
- Verify Python 3.11+ is installed: `python3 --version`
- Check all dependencies installed: `pip list`
- Ensure port 8000 is available

### LLM API Issues
- Verify `ANTHROPIC_API_KEY` is set correctly
- Check API key has sufficient credits
- Monitor token usage in the UI

### Data File Issues
- Verify parquet files exist in `my-app/PseuodoIPD/`
- Check file permissions
- Ensure files have 'time' and 'event' columns

## Next Steps After Setup

1. **Test with a small analysis**: Start with a single model to verify everything works
2. **Monitor costs**: Full analysis uses ~84 LLM calls (42 models × 2 assessments)
3. **Review Python service**: The Python service has placeholder implementations - you may need to enhance model fitting logic
4. **Add SEER data**: For external validation, add SEER benchmark data

## Architecture Overview

```
┌─────────────┐
│  Frontend   │ (React + TypeScript)
│  Port 5173  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Backend   │ (Hono API)
│  Port 8787  │
└──────┬──────┘
       │
       ├──► PostgreSQL Database
       │
       ├──► Python Service (Port 8000)
       │    └──► Survival Analysis Models
       │
       └──► Anthropic API
            └──► Claude Sonnet 4.5
                 ├──► Vision Analysis
                 ├──► Reasoning Analysis
                 └──► Synthesis
```


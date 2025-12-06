# Quick Start Guide - Survival Analysis System

## ✅ All Services Running!

Your system is now fully operational:

- **Frontend**: http://localhost:5701
- **Backend API**: http://localhost:5700
- **Python Service**: http://localhost:8000
- **Database**: PostgreSQL on port 5702
- **Firebase Emulator**: Port 5703 (Auth), Port 5704 (UI)

## 🚀 Testing the System

### Step 1: Open the Frontend
1. Open your browser: http://localhost:5701
2. Sign in (or use anonymous auth)
3. Navigate to "Survival Analysis" in the sidebar

### Step 2: Start an Analysis
1. Click "Start New Analysis" button
2. The system will:
   - Load parquet data from `PseuodoIPD/`
   - Fit 42 survival models (21 per arm)
   - Generate dual plots for each model
   - Assess each model with Vision LLM (~2000 tokens)
   - Assess each model with Reasoning LLM (~16000 tokens)
   - Generate final synthesis report

### Step 3: Monitor Progress
- Watch the progress bar (X/42 models)
- View models as they're completed
- Check token usage in real-time

## 📊 What Happens During Analysis

1. **Data Loading** (seconds)
   - Loads chemo and pembro parquet files
   - Validates data structure

2. **PH Testing** (seconds)
   - Tests proportional hazards assumption
   - Generates diagnostic plots
   - Makes decision (separate vs pooled models)

3. **Model Fitting** (minutes)
   - **One-piece models**: 12 models (6 distributions × 2 arms)
   - **Piecewise models**: 12 models (6 distributions × 2 arms, with cutpoint detection)
   - **Spline models**: 18 models (3 scales × 3 knot configs × 2 arms)

4. **LLM Assessment** (hours - depends on API rate limits)
   - Each model gets Vision assessment (~2000 tokens)
   - Each model gets Reasoning assessment (~16000 tokens)
   - Total: 84 LLM calls (42 models × 2 assessments)

5. **Synthesis** (minutes)
   - Cross-model comparison
   - Primary recommendation
   - Sensitivity analysis suggestions
   - Final report (6000-8000 words)

## 💰 Estimated Costs

- **Vision LLM**: 42 calls × ~2000 tokens = ~84k tokens output
- **Reasoning LLM**: 42 calls × ~16000 tokens = ~672k tokens output
- **Synthesis LLM**: 1 call × ~8000 tokens = ~8k tokens output
- **Total**: ~764k output tokens
- **Estimated Cost**: $50-100 per full analysis (Claude Sonnet 4.5)

## 🔍 Viewing Results

### Models Tab
- See all 42 fitted models
- Filter by arm, approach, distribution
- View AIC/BIC scores (within-approach only)

### Individual Model View
- Model metadata
- Dual plots (short-term + long-term)
- Vision assessment scores (0-10)
- Full reasoning assessment (3200-4100 words)

### Synthesis Tab
- Primary recommendation
- Key uncertainties
- Full synthesis report

### Token Usage Tab
- Total tokens used
- Cost estimate
- Breakdown by call type

## 🛠️ Troubleshooting

### If analysis fails:
1. Check Python service logs
2. Verify parquet files exist
3. Check API key is valid
4. Monitor token usage limits

### If models don't fit:
- Check data quality
- Verify time/event columns
- Review Python service error logs

### If LLM calls fail:
- Verify ANTHROPIC_API_KEY
- Check API rate limits
- Monitor token usage

## 📝 Next Steps

1. **Test with small subset**: Modify workflow to test 1-2 models first
2. **Review Python implementations**: Enhance model fitting logic as needed
3. **Add SEER data**: Integrate actual SEER benchmark data
4. **Customize prompts**: Fine-tune LLM prompts for your use case

## 🎯 System Architecture

```
User → Frontend (React)
  ↓
Backend API (Hono)
  ├─→ PostgreSQL (Models, Assessments, Reports)
  ├─→ Python Service (Survival Analysis)
  └─→ Anthropic API (Claude Sonnet 4.5)
      ├─→ Vision Analysis
      ├─→ Reasoning Analysis
      └─→ Synthesis
```

Enjoy exploring your survival analysis system! 🚀


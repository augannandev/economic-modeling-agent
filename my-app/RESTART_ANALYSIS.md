# How to Start a Fresh Analysis

## Steps to Start Over

### 1. ✅ Python Service is Running
The Python service has been restarted with the updated code that:
- Uses **actual fitted model predictions** (not placeholders)
- Has proper R service fallback (with Weibull approximation if R unavailable)
- Has faster timeouts to prevent hanging

### 2. Start New Analysis in UI

1. **Go to the Survival Analysis page** in your browser (http://localhost:5701/survival-analysis)

2. **Click the "Start New Analysis" button** (top right)

3. **The workflow will automatically:**
   - Load the pseudo IPD data
   - Fit KM curves
   - Test proportional hazards
   - Fit all 42 models (12 one-piece + 12 piecewise + 18 spline)
   - Generate plots with **actual fitted model predictions**
   - Run Vision LLM assessment for each model
   - Run Reasoning LLM assessment for each model (16K+ tokens each)
   - Generate final synthesis report

### 3. Monitor Progress

- The UI will show real-time progress (models completed / 42 total)
- You can view:
  - **PH Tests tab**: Proportional hazards test results and diagnostic plots
  - **Models tab**: All fitted models with filtering options
  - **Synthesis tab**: Final cross-model comparison and recommendations
  - **Token Usage tab**: LLM token consumption tracking

### 4. What's Different Now

✅ **Real Fitted Values**: All plots use actual model survival functions from refitted models  
✅ **Consistent Plots**: Short-term and long-term plots use the same model predictions  
✅ **No Hanging**: Fast fallback if R service unavailable (uses Weibull for Gompertz)  
✅ **Full LLM Analysis**: Each model gets comprehensive Vision + Reasoning assessment  

### 5. Expected Timeline

- **Model Fitting**: ~1-2 minutes per model (42 models = ~1-1.5 hours total)
- **Vision Assessment**: ~30 seconds per model
- **Reasoning Assessment**: ~2-3 minutes per model (large output)
- **Total**: Approximately **2-3 hours** for complete analysis

### 6. Optional: Start R Service (for true Gompertz)

If you want actual Gompertz models instead of Weibull approximation:

```bash
# Install R packages (one-time)
Rscript -e "install.packages(c('plumber', 'survival', 'flexsurv', 'rstpm2', 'jsonlite'), repos='https://cloud.r-project.org')"

# Start R service in separate terminal
cd my-app/r-service
Rscript main.R
```

The Python service will automatically detect and use R service if available.

## Troubleshooting

- **If workflow stops**: Check Python service logs: `tail -f my-app/python-service/python-service.log`
- **If plots look wrong**: Ensure Python service is using updated plotting.py
- **If R service needed**: Start R service before starting analysis


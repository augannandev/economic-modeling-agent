# R Survival Analysis Service

Plumber API service providing survival analysis models that may not be available in Python, or better implementations.

## Models Available

- **Gompertz**: Full Gompertz survival model using `flexsurv` (not available in Python lifelines)
- **Royston-Parmar Splines**: Better implementation using `rstpm2` package

## Setup

1. Install R (if not already installed):
   ```bash
   # macOS
   brew install r
   
   # Ubuntu/Debian
   sudo apt-get install r-base
   ```

2. Install required R packages:
   ```bash
   Rscript -e "install.packages(c('plumber', 'survival', 'flexsurv', 'rstpm2', 'jsonlite'), repos='https://cloud.r-project.org')"
   ```

3. Set environment variable (optional):
   ```bash
   export R_SERVICE_URL=http://localhost:8001
   ```

4. Run the service:
   ```bash
   cd r-service
   Rscript main.R
   ```

   Or using Plumber directly:
   ```bash
   Rscript -e "plumber::plumb('plumber.R')$run(port=8001, host='0.0.0.0')"
   ```

## API Endpoints

- `GET /` - Health check
- `POST /fit-gompertz` - Fit Gompertz survival model
- `POST /fit-rp-spline` - Fit Royston-Parmar flexible parametric spline
- `POST /refit-and-predict` - Refit model and generate survival predictions for plotting

## Integration

The Python service automatically falls back to this R service when:
- Gompertz model is needed but not available in Python
- Royston-Parmar spline fitting fails in Python
- Better R implementation is preferred

The R service is called transparently from the Python plotting code.

## Notes

- The service runs on port 8001 by default
- All endpoints accept and return JSON
- The service is stateless - each request refits the model


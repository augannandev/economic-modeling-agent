# Production R Service Setup for IPD Reconstruction

## Overview

The IPD reconstruction now **requires** the R service in production to ensure maximum accuracy. The system will fail gracefully if the R service is unavailable, preventing inaccurate reconstructions.

## Configuration

### Environment Variables

Set the following environment variable to control R service requirement:

```bash
# Require R service (default: true)
REQUIRE_R_SERVICE_IPD=true

# R service URL (default: http://localhost:8001)
R_SERVICE_URL=http://localhost:8001
```

### Production Deployment

1. **Ensure R service is running** before starting the Python service
2. **Set `REQUIRE_R_SERVICE_IPD=true`** in production environment
3. **Set `R_SERVICE_URL`** to your R service endpoint

### Fallback Mode (Development Only)

For local development/testing, you can allow Python fallback:

```bash
REQUIRE_R_SERVICE_IPD=false
```

⚠️ **Warning**: Python fallback is less accurate (~5-6% MAE vs ~0.2% MAE with R service). Do not use in production.

## IPD Plotting

The R service now includes IPD reconstruction validation plots that are automatically included in the synthesis report.

### Endpoints

- **R Service**: `POST /plot-ipd-reconstruction`
- **Python Service**: `POST /plot-ipd-reconstruction` (proxies to R service)

### Plot Features

- Comparison of original KM curves vs reconstructed KM curves
- Validation of IPD reconstruction accuracy
- Included in synthesis report under "IPD Reconstruction Validation"

## Testing

Run the test script to verify R service integration:

```bash
cd my-app/python-service
python test_r_service_ipd.py
```

Expected results:
- ✅ R service available
- ✅ IPD reconstruction successful
- ✅ MAE < 0.5% (excellent accuracy)

# IPD Reconstruction Fix Summary

## Issues Fixed

### 1. Incorrect `maxy` Parameter
**Problem**: The Plumber API was using `maxy = 100` when it should be `maxy = 1` because survival values are in proportion (0-1), not percentage (0-100).

**Fix**: Changed `maxy = 100` to `maxy = 1` in `survival_models.R` line 340.

### 2. Incorrect Return Structure Access
**Problem**: The code was accessing `ipd_result$time` directly, but `IPDfromKM::getIPD()` returns a list with an `IPD` element containing the data frame.

**Fix**: Changed to access `ipd_result$IPD$time` and `ipd_result$IPD$status` in `survival_models.R` lines 354-356.

## Verification

The standalone R script (`reconstruct_ipd_standalone.R`) provided by the user correctly shows:
- `maxy = 1` (for 0-1 survival proportions)
- Accessing `ipd_res$IPD$time` and `ipd_res$IPD$status`

These patterns have now been applied to the Plumber API endpoint.

## Testing

A comprehensive test script has been created: `python-service/test_r_service_ipd.py`

### To run the test:

1. **Start the R service** (if not already running):
   ```bash
   cd my-app/r-service
   Rscript main.R
   ```

2. **Run the test script**:
   ```bash
   cd my-app/python-service
   python test_r_service_ipd.py
   ```

   Or set custom R service URL:
   ```bash
   R_SERVICE_URL=http://localhost:8001 python test_r_service_ipd.py
   ```

### What the test does:

1. **Health Check**: Verifies R service is available and lists available endpoints
2. **Direct R Service Test**: Calls `/reconstruct-ipd` endpoint directly with test data
3. **Python Builder Test**: Tests via `IPDBuilder` (which should use R service first)
4. **Validation**: Compares reconstructed KM curves with original data
5. **Comparison**: Compares R service results with Python fallback

### Expected Output:

The test will:
- ✅ Show R service is available
- ✅ Successfully reconstruct IPD via R service
- ✅ Validate reconstruction accuracy (MAE, max differences)
- ✅ Compare results between R service and Python fallback

## Files Modified

- `my-app/r-service/survival_models.R`: Fixed `maxy` parameter and return structure access
- `my-app/python-service/test_r_service_ipd.py`: New comprehensive test script

## Next Steps

After restarting the R service with the fixed code, the IPD reconstruction should:
1. Use the correct `maxy=1` parameter for 0-1 survival proportions
2. Correctly extract IPD data from the `$IPD` element
3. Produce more accurate reconstructions matching the standalone R script

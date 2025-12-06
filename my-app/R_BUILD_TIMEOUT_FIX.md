# R Build Timeout Fix

## Problem
R package installation stuck for 27+ minutes. `plumber` installation is very slow.

## Solution Applied
Optimized Dockerfile to:
1. Install packages with minimal dependencies (`dependencies = c('Depends', 'Imports')` instead of `TRUE`)
2. Set timeout to 300 seconds (5 minutes)
3. Faster verification (check installed packages instead of loading them)

## If Build Still Times Out

### Option 1: Cancel and Redeploy
1. Railway → R Service → Deployments
2. Cancel the current build
3. Redeploy with the new optimized Dockerfile

### Option 2: Use Pre-built R Image
Consider using `rocker/plumber` base image which has plumber pre-installed:
```dockerfile
FROM rocker/plumber:latest
# Then just install survival and jsonlite
```

### Option 3: Increase Railway Resources
Railway might be throttling the build. Check if you can upgrade the service plan.

## Current Status
New optimized Dockerfile pushed. Cancel current build and redeploy.


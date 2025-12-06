# R Service Fix Checklist

## Issue
Packages installed during build but not available at runtime: "Error in library(plumber) : there is no package called 'plumber'"

## Critical Checks in Railway Dashboard

### 1. Verify Builder Method
- Railway → R Service → Settings
- Check **"Builder"** or **"Build Method"**
- Should be **"Dockerfile"** (not "Nixpacks" or "Auto-detect")

### 2. Verify Root Directory
- Railway → R Service → Settings
- **Root Directory**: Should be `my-app/r-service`
- This means Railway builds from `my-app/r-service/` directory

### 3. Verify Build Command
- Railway → R Service → Settings
- **Build Command**: Should be **EMPTY**
- If Railway is using Dockerfile, it shouldn't need a build command

### 4. Check Build Logs
- Railway → R Service → Deployments → Latest → Build Logs
- Look for:
  - "Installing plumber..."
  - "✓ plumber installed"
  - "✓ All packages verified"
- If you DON'T see these messages, Dockerfile isn't being used

## If Railway is Using Nixpacks Instead

If Railway auto-detected Nixpacks (R detection), it won't use your Dockerfile. To fix:

1. **Option A**: Force Dockerfile in Settings
   - Settings → Builder → Select "Dockerfile"

2. **Option B**: Create `requirements.R` for Nixpacks
   - Create file: `my-app/r-service/requirements.R`
   - Content: `install.packages(c('plumber', 'survival', 'jsonlite'), repos='https://cloud.r-project.org')`

## Next Steps

1. Check Railway Settings (above)
2. If using Dockerfile, verify build logs show package installation
3. If using Nixpacks, create `requirements.R` file
4. Redeploy the service


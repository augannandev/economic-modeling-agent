# R Service Railway Settings Check

## Critical: Verify Railway is Using Dockerfile

The error suggests Railway might not be using the Dockerfile. Check:

1. **Railway → R Service → Settings**
2. **Builder**: Should be **"Dockerfile"** (not "Nixpacks")
3. **Root Directory**: Should be `my-app/r-service`
4. **Build Command**: Should be **EMPTY** (Railway uses Dockerfile)
5. **Start Command**: Should be **EMPTY** (Railway uses Dockerfile CMD)

## If Railway is Using Nixpacks Instead

If Railway is using Nixpacks (auto-detected), it won't use your Dockerfile. To force Dockerfile:

1. Railway → R Service → Settings
2. Look for **"Builder"** or **"Build Method"**
3. Change to **"Dockerfile"**
4. Or create a `railway.json` file to specify Dockerfile

## Alternative: Use requirements.R

If Dockerfile continues to fail, we can create a `requirements.R` file that Railway's Nixpacks will use:

```r
install.packages(c('plumber', 'survival', 'jsonlite'), repos='https://cloud.r-project.org')
```

But Dockerfile is preferred for more control.


# Next Steps After Railway Setup

## ✅ Step 1 Complete: Railway Backend Services

You've set up:
- ✅ PostgreSQL Database
- ✅ Backend API Service
- ✅ Python Service  
- ✅ R Service
- ✅ Environment Variables configured

## Step 1.7: Verify All Services Are Running

### Test Each Service

1. **Backend API**:
   ```bash
   curl https://your-backend-api-domain.up.railway.app/api/v1/hello
   ```
   Expected: `{"message":"Hello from Survival Analysis API"}`

2. **Python Service**:
   ```bash
   curl https://your-python-service-domain.up.railway.app/health
   ```
   Expected: `{"status":"healthy","service":"survival-analysis-python"}`

3. **R Service**:
   ```bash
   curl https://shimmering-growth-production.up.railway.app/
   ```
   Expected: JSON with service status

### Check Railway Dashboard

- Go to each service → **"Deployments"** tab
- Ensure all deployments show **"Active"** status (green)
- Check logs for any errors

## Step 1.8: Run Database Migration

After all services are deployed, you need to create the database tables:

### Option A: Using Railway CLI (Recommended)

1. **Install Railway CLI** (if not already installed):
   ```bash
   npm i -g @railway/cli
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

3. **Link to your project**:
   ```bash
   railway link
   ```
   Select your project when prompted.

4. **Run database migration**:
   ```bash
   railway run --service backend-api pnpm db:push
   ```

### Option B: Using Railway Dashboard

1. Go to your **Backend API** service
2. Click **"Deployments"** tab
3. Click on the latest deployment
4. Click **"Shell"** or **"View Logs"**
5. Run:
   ```bash
   cd /app/server
   pnpm db:push
   ```

**Important**: When prompted about truncating users table, select **"No, add the constraint without truncating the table"**

## Step 2: Deploy Frontend to Vercel

### 2.1 Create Vercel Project

1. Go to [vercel.com](https://vercel.com)
2. Sign in or create account
3. Click **"Add New..."** → **"Project"**
4. Click **"Import Git Repository"**
5. Select your repository: `augannandev/economic-modeling-agent`
6. Click **"Import"**

### 2.2 Configure Project Settings

1. **Framework Preset**: Select **"Vite"** (or it may auto-detect)
2. **Root Directory**: Click **"Edit"** and set to `my-app/ui`
3. **Build Command**: 
   ```
   cd ../.. && pnpm install && cd my-app/ui && pnpm build
   ```
4. **Output Directory**: `dist`
5. **Install Command**: `pnpm install`

### 2.3 Add Environment Variables

Click **"Environment Variables"** and add:

```env
VITE_API_URL=https://your-backend-api-domain.up.railway.app
VITE_USE_FIREBASE_EMULATOR=false
```

**Important**: Replace `your-backend-api-domain` with your actual Backend API domain from Railway.

### 2.4 Deploy

1. Click **"Deploy"**
2. Wait for build to complete (usually 2-3 minutes)
3. Vercel will provide a URL like: `your-app.vercel.app`

## Step 3: Test the Full System

1. **Visit your Vercel URL**: `https://your-app.vercel.app`
2. **Sign in** (or use anonymous auth if configured)
3. **Navigate to Survival Analysis** page
4. **Start a new analysis** to test the full workflow

## Troubleshooting

### Services Not Responding

- Check Railway dashboard → Deployments → Logs
- Verify environment variables are set correctly
- Ensure services have public domains generated

### Database Migration Fails

- Verify `DATABASE_URL` is correct in Backend API
- Check PostgreSQL service is running
- Try running migration again

### Frontend Can't Connect to Backend

- Verify `VITE_API_URL` in Vercel matches your Backend API domain
- Check CORS settings (should allow Vercel domain)
- Test backend URL directly: `curl https://your-backend-api.up.railway.app/api/v1/hello`

## What's Next After Deployment?

1. **Test the system** with a small analysis
2. **Monitor costs** - LLM API calls can be expensive
3. **Set up monitoring** - Railway and Vercel both provide metrics
4. **Configure custom domains** (optional)
5. **Set up backups** for PostgreSQL database

## Quick Reference

- **Backend API**: `https://your-backend-api.up.railway.app`
- **Python Service**: `https://your-python-service.up.railway.app`
- **R Service**: `https://shimmering-growth-production.up.railway.app`
- **Frontend**: `https://your-app.vercel.app`


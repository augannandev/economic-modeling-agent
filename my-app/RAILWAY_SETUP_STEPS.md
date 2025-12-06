# Railway Setup - Step by Step Guide

## Prerequisites Checklist

Before starting, make sure you have:
- ✅ GitHub account
- ✅ Code pushed to GitHub repository: `https://github.com/augannandev/economic-modeling-agent.git`
- ✅ Railway account (sign up at https://railway.app if needed)
- ✅ API keys ready:
  - Anthropic API key
  - OpenAI API key (optional)
  - Firebase credentials (if using production Firebase)

## Step 1.1: Create Railway Project

1. Go to https://railway.app
2. Click **"New Project"** (top right)
3. Select **"Deploy from GitHub repo"**
4. Authorize Railway to access your GitHub if prompted
5. Select your repository: `augannandev/economic-modeling-agent`
6. Click **"Deploy Now"**

Railway will create a new project. You should see an empty project dashboard.

## Step 1.2: Add PostgreSQL Database

1. In your Railway project dashboard, click **"+ New"** button
2. Select **"Database"** → **"Add PostgreSQL"**
3. Railway will automatically provision a PostgreSQL database
4. Wait for it to finish provisioning (usually 30-60 seconds)
5. Once ready, click on the PostgreSQL service
6. Go to the **"Variables"** tab
7. Copy the `DATABASE_URL` value (you'll need this later)

**Important**: The `DATABASE_URL` looks like:
```
postgresql://postgres:password@containers-us-west-xxx.railway.app:5432/railway
```

Keep this tab open or save the DATABASE_URL somewhere safe.

## Step 1.3: Deploy Backend API Service

1. In your Railway project dashboard, click **"+ New"** button
2. Select **"GitHub Repo"**
3. Select your repository: `augannandev/economic-modeling-agent`
4. Railway will start deploying. **STOP** - we need to configure it first!
5. Click on the newly created service (it will have a random name)
6. Go to **"Settings"** tab
7. Set the following:
   - **Root Directory**: `my-app/server`
   - **Build Command**: `pnpm install && pnpm build`
   - **Start Command**: `node dist/server.js`
8. Go to **"Variables"** tab and add these environment variables:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
FIREBASE_PROJECT_ID=demo-project
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
PORT=5500
```

**Note**: 
- `${{Postgres.DATABASE_URL}}` is a Railway reference - it will automatically use the PostgreSQL service's DATABASE_URL
- Replace `your_anthropic_api_key_here` with your actual Anthropic API key
- Replace `your_openai_api_key_here` with your actual OpenAI API key (or leave empty if not using)

9. Go to **"Networking"** tab
10. Click **"Generate Domain"** to create a public URL
11. Copy the generated domain (e.g., `backend-api-production.up.railway.app`)

**Important**: We'll add the Python and R service URLs after we deploy them. For now, use placeholder URLs:
```env
PYTHON_SERVICE_URL=http://localhost:8000
R_SERVICE_URL=http://localhost:8001
```

We'll update these later.

## Step 1.4: Deploy Python Service

1. In your Railway project dashboard, click **"+ New"** button
2. Select **"GitHub Repo"**
3. Select your repository: `augannandev/economic-modeling-agent`
4. Click on the newly created service
5. Go to **"Settings"** tab
6. Set the following:
   - **Root Directory**: `my-app/python-service`
   - Railway will auto-detect the Dockerfile
7. Go to **"Variables"** tab and add:

```env
PORT=8000
R_SERVICE_URL=http://localhost:8001
```

(We'll update R_SERVICE_URL after deploying R service)

8. Go to **"Networking"** tab
9. Click **"Generate Domain"** to create a public URL
10. Copy the generated domain (e.g., `python-service-production.up.railway.app`)

## Step 1.5: Deploy R Service

1. In your Railway project dashboard, click **"+ New"** button
2. Select **"GitHub Repo"**
3. Select your repository: `augannandev/economic-modeling-agent`
4. Click on the newly created service
5. Go to **"Settings"** tab
6. Set the following:
   - **Root Directory**: `my-app/r-service`
   - Railway will auto-detect the Dockerfile
7. Go to **"Networking"** tab
8. Click **"Generate Domain"** to create a public URL
9. Copy the generated domain (e.g., `r-service-production.up.railway.app`)

**Note**: R service doesn't need environment variables (uses defaults)

## Step 1.6: Update Service URLs

Now we need to update the service URLs in each service to reference each other.

### Update Backend API

1. Go to your **Backend API** service
2. Go to **"Variables"** tab
3. Update these variables:

```env
PYTHON_SERVICE_URL=https://your-python-service-domain.up.railway.app
R_SERVICE_URL=https://your-r-service-domain.up.railway.app
```

Replace with your actual domains from steps 1.4 and 1.5.

### Update Python Service

1. Go to your **Python Service**
2. Go to **"Variables"** tab
3. Update:

```env
R_SERVICE_URL=https://your-r-service-domain.up.railway.app
```

Replace with your actual R service domain.

## Step 1.7: Verify Deployments

Wait for all services to finish deploying (check the "Deployments" tab for each service).

Then test each service:

1. **Backend API**: 
   ```bash
   curl https://your-backend-api-domain.up.railway.app/api/v1/hello
   ```
   Should return: `{"message":"Hello from Survival Analysis API"}`

2. **Python Service**:
   ```bash
   curl https://your-python-service-domain.up.railway.app/health
   ```
   Should return: `{"status":"healthy","service":"survival-analysis-python"}`

3. **R Service**:
   ```bash
   curl https://your-r-service-domain.up.railway.app/
   ```
   Should return JSON with service status

## Step 1.8: Run Database Migration

After all services are deployed:

1. Install Railway CLI (if not already installed):
   ```bash
   npm i -g @railway/cli
   ```

2. Login to Railway:
   ```bash
   railway login
   ```

3. Link to your project:
   ```bash
   railway link
   ```
   Select your project when prompted.

4. Run database migration:
   ```bash
   railway run --service backend-api pnpm db:push
   ```

   Or if you prefer to SSH into the service:
   ```bash
   railway shell --service backend-api
   cd /app/server
   pnpm db:push
   ```

## Troubleshooting

### Service won't start
- Check the **"Deployments"** tab for error logs
- Verify all environment variables are set correctly
- Check that Root Directory paths are correct

### Database connection errors
- Verify `DATABASE_URL` is set correctly in Backend API
- Ensure PostgreSQL service is running
- Check that `${{Postgres.DATABASE_URL}}` reference is correct

### Service URLs not working
- Ensure public domains are generated in Networking tab
- Check that services are using HTTPS (not HTTP) in URLs
- Verify services are fully deployed (not still building)

### Build failures
- Check build logs in Railway dashboard
- Verify Dockerfiles are correct
- Ensure all dependencies are in requirements.txt/package.json

## Next Steps

Once all Railway services are deployed and working:
- Proceed to Step 2: Deploy Frontend to Vercel
- See `DEPLOYMENT.md` for Vercel setup instructions


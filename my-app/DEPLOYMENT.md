# Deployment Guide: Vercel + Railway

This guide walks you through deploying the Survival Analysis Agent system to production using:
- **Vercel** for the React frontend
- **Railway** for backend services (API, Python service, R service, PostgreSQL)

## Architecture Overview

```
┌─────────────┐
│   Vercel    │  React Frontend (Static)
└──────┬──────┘
       │ HTTPS
       ▼
┌─────────────────────────────────────────────────┐
│              Railway Platform                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Backend  │  │ Python   │  │   R      │     │
│  │  API     │  │ Service   │  │ Service  │     │
│  │ (Hono)   │  │ (FastAPI) │  │(Plumber) │     │
│  └────┬─────┘  └─────┬─────┘  └─────┬─────┘     │
│       │              │              │           │
│       └──────────────┴──────────────┘           │
│                    │                             │
│              ┌─────▼─────┐                      │
│              │ PostgreSQL│                      │
│              │  Database │                      │
│              └───────────┘                      │
└─────────────────────────────────────────────────┘
```

## Prerequisites

1. **GitHub Account** - Your code should be pushed to GitHub
2. **Vercel Account** - Sign up at [vercel.com](https://vercel.com)
3. **Railway Account** - Sign up at [railway.app](https://railway.app)
4. **API Keys**:
   - Anthropic API key (for Claude LLM)
   - OpenAI API key (optional fallback)
   - Firebase project credentials (if using production Firebase)

## Step 1: Deploy Backend Services to Railway

### 1.1 Create Railway Project

1. Go to [railway.app](https://railway.app) and create a new project
2. Select "Deploy from GitHub repo"
3. Connect your GitHub account and select the repository

### 1.2 Add PostgreSQL Database

1. In your Railway project, click "New" → "Database" → "Add PostgreSQL"
2. Railway will automatically create a PostgreSQL database
3. Copy the `DATABASE_URL` connection string (you'll need this later)

### 1.3 Deploy Backend API

1. In Railway project, click "New" → "GitHub Repo"
2. Select your repository
3. Set the **Root Directory** to `my-app/server`
4. Railway will auto-detect Node.js and build
5. Add environment variables (see Step 1.6)
6. Set the **Start Command** to: `node dist/server.js`
7. Expose port: Railway will auto-assign, but ensure your code uses `process.env.PORT`

### 1.4 Deploy Python Service

1. In Railway project, click "New" → "GitHub Repo"
2. Select your repository
3. Set the **Root Directory** to `my-app/python-service`
4. Railway will detect Dockerfile and build
5. Add environment variables (see Step 1.6)
6. Expose port: `8000`

### 1.5 Deploy R Service

1. In Railway project, click "New" → "GitHub Repo"
2. Select your repository
3. Set the **Root Directory** to `my-app/r-service`
4. Railway will detect Dockerfile and build
5. Expose port: `8001`

### 1.6 Environment Variables

For **Backend API** service, add these environment variables in Railway:

```env
# Database (from PostgreSQL service)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Firebase (use production Firebase or keep emulator disabled)
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY=your-firebase-private-key
FIREBASE_CLIENT_EMAIL=your-firebase-client-email

# LLM API Keys
ANTHROPIC_API_KEY=your_anthropic_api_key
OPENAI_API_KEY=your_openai_api_key

# Service URLs (Railway will provide these after deployment)
PYTHON_SERVICE_URL=${{PythonService.RAILWAY_PUBLIC_DOMAIN}}
R_SERVICE_URL=${{RService.RAILWAY_PUBLIC_DOMAIN}}

# Data Directories (use Railway volumes or S3)
DATA_DIRECTORY=/app/data/PseuodoIPD
PLOTS_DIRECTORY=/app/data/plots

# Port
PORT=5500
```

For **Python Service**, add:

```env
R_SERVICE_URL=${{RService.RAILWAY_PUBLIC_DOMAIN}}
PLOTS_DIRECTORY=/app/data/plots
SEER_DATA_PATH=/app/data/seer
```

For **R Service**, no environment variables needed (uses defaults).

### 1.7 Set Up Service Dependencies

In Railway, configure service dependencies:
- Backend API depends on: PostgreSQL, Python Service, R Service
- Python Service depends on: R Service

### 1.8 Generate Public URLs

1. For each service, go to Settings → Networking
2. Generate a public domain (e.g., `backend-api.up.railway.app`)
3. Copy these URLs for the frontend configuration

## Step 2: Deploy Frontend to Vercel

### 2.1 Connect Repository

1. Go to [vercel.com](https://vercel.com) and create a new project
2. Import your GitHub repository
3. Configure project:
   - **Framework Preset**: Vite
   - **Root Directory**: `my-app/ui`
   - **Build Command**: `cd ../.. && pnpm install && cd my-app/ui && pnpm build`
   - **Output Directory**: `dist`
   - **Install Command**: `pnpm install`

### 2.2 Environment Variables

Add these environment variables in Vercel:

```env
VITE_API_URL=https://your-backend-api.up.railway.app
VITE_USE_FIREBASE_EMULATOR=false
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
```

### 2.3 Deploy

Click "Deploy" and wait for the build to complete.

## Step 3: Configure Firebase (Production)

If using production Firebase (recommended for production):

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project or use existing
3. Enable Authentication → Sign-in method → Google
4. Add authorized domains:
   - Your Vercel domain (e.g., `your-app.vercel.app`)
   - Your custom domain (if any)
5. Get Firebase config and add to Vercel environment variables

## Step 4: Upload Data Files

### Option A: Railway Volumes (Recommended)

1. In Railway, create a volume for data storage
2. Mount it to Python service: `/app/data`
3. Upload parquet files to the volume:
   ```bash
   # Use Railway CLI
   railway volume mount
   # Copy files to mounted volume
   ```

### Option B: S3/Cloud Storage

1. Upload parquet files to S3 or similar
2. Update `DATA_DIRECTORY` to point to S3 URL
3. Modify Python service to download files on startup

### Option C: Include in Repository

1. Keep parquet files in `my-app/PseuodoIPD/`
2. They'll be included in the Docker image
3. Note: This increases image size

## Step 5: Database Migration

After deployment, run database migrations:

```bash
# Using Railway CLI
railway run --service backend-api pnpm db:push

# Or SSH into the service
railway shell --service backend-api
pnpm db:push
```

## Step 6: Verify Deployment

1. **Frontend**: Visit your Vercel URL
2. **Backend Health**: `curl https://your-backend-api.up.railway.app/api/v1/hello`
3. **Python Service**: `curl https://your-python-service.up.railway.app/health`
4. **R Service**: `curl https://your-r-service.up.railway.app/`

## Troubleshooting

### Backend API Issues

- **Database Connection**: Verify `DATABASE_URL` is correct
- **Service URLs**: Ensure Python/R service URLs are accessible
- **CORS**: Check that frontend URL is allowed in CORS settings

### Python Service Issues

- **Dependencies**: Check that all packages in `requirements.txt` install correctly
- **R Service Connection**: Verify `R_SERVICE_URL` is correct
- **Port**: Ensure service listens on `0.0.0.0`, not `localhost`

### R Service Issues

- **R Packages**: Verify all packages install in Dockerfile
- **Port**: Ensure service listens on `0.0.0.0`

### Frontend Issues

- **API URL**: Verify `VITE_API_URL` points to correct backend
- **Build Errors**: Check Vercel build logs
- **CORS**: Ensure backend allows frontend origin

## Cost Estimation

### Railway
- **PostgreSQL**: ~$5/month (Hobby plan)
- **Backend API**: ~$5/month (512MB RAM)
- **Python Service**: ~$5/month (512MB RAM)
- **R Service**: ~$5/month (512MB RAM)
- **Total**: ~$20/month

### Vercel
- **Frontend**: Free (Hobby plan) for personal projects
- **Custom Domain**: Free

### LLM API Costs
- **Per Analysis**: ~$50-100 (84 LLM calls × ~$0.60-1.20 per call)
- **Monthly**: Depends on usage

## Monitoring

### Railway
- View logs in Railway dashboard
- Set up alerts for service failures
- Monitor resource usage

### Vercel
- View build logs and deployment history
- Monitor analytics and performance

## Updates and CI/CD

Both platforms support automatic deployments:
- **Railway**: Auto-deploys on git push to main branch
- **Vercel**: Auto-deploys on git push to main branch

To update:
1. Push changes to GitHub
2. Railway and Vercel will automatically rebuild and deploy

## Security Considerations

1. **API Keys**: Never commit API keys to git
2. **Database**: Use Railway's private networking for database connections
3. **CORS**: Restrict CORS to your frontend domain only
4. **Firebase**: Use production Firebase with proper security rules
5. **Environment Variables**: Use Railway/Vercel secrets management

## Next Steps

1. Set up custom domains (optional)
2. Configure monitoring and alerts
3. Set up backup strategy for database
4. Implement rate limiting for API endpoints
5. Add authentication middleware for production


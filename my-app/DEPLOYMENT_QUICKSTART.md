# Quick Start: Deploy to Vercel + Railway

This is a condensed deployment guide. For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Prerequisites

- GitHub repository with code pushed
- Vercel account: https://vercel.com
- Railway account: https://railway.app
- API keys: Anthropic, OpenAI (optional), Firebase

## Railway Setup (Backend Services)

### 1. Create Project & Add Services

1. Go to Railway → New Project → Deploy from GitHub
2. Connect your repo
3. Add these services (each as separate deployment):

   **a) PostgreSQL Database**
   - New → Database → PostgreSQL
   - Copy `DATABASE_URL` (you'll need this)

   **b) Backend API**
   - New → GitHub Repo → Select your repo
   - Root Directory: `my-app/server`
   - Build Command: `pnpm install && pnpm build`
   - Start Command: `node dist/server.js`
   - Port: Auto (uses `$PORT` env var)

   **c) Python Service**
   - New → GitHub Repo → Select your repo
   - Root Directory: `my-app/python-service`
   - Railway will auto-detect Dockerfile
   - Port: `8000`

   **d) R Service**
   - New → GitHub Repo → Select your repo
   - Root Directory: `my-app/r-service`
   - Railway will auto-detect Dockerfile
   - Port: `8001`

### 2. Configure Environment Variables

**Backend API** - Add these variables:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
FIREBASE_PROJECT_ID=your-firebase-project-id
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
PYTHON_SERVICE_URL=${{PythonService.RAILWAY_PUBLIC_DOMAIN}}
R_SERVICE_URL=${{RService.RAILWAY_PUBLIC_DOMAIN}}
PORT=5500
```

**Python Service**:

```env
R_SERVICE_URL=${{RService.RAILWAY_PUBLIC_DOMAIN}}
PORT=8000
```

**R Service**: No env vars needed

### 3. Generate Public Domains

For each service:
- Settings → Networking → Generate Domain
- Copy the URLs (e.g., `backend-api.up.railway.app`)

## Vercel Setup (Frontend)

1. Go to Vercel → New Project → Import Git Repository
2. Select your repo
3. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `my-app/ui`
   - **Build Command**: `cd ../.. && pnpm install && cd my-app/ui && pnpm build`
   - **Output Directory**: `dist`
4. Add Environment Variables:

```env
VITE_API_URL=https://your-backend-api.up.railway.app
VITE_USE_FIREBASE_EMULATOR=false
```

5. Deploy!

## Database Migration

After deployment, run migrations:

```bash
# Using Railway CLI
railway run --service backend-api pnpm db:push
```

## Verify

- Frontend: Visit your Vercel URL
- Backend: `curl https://your-backend-api.up.railway.app/api/v1/hello`
- Python: `curl https://your-python-service.up.railway.app/health`
- R: `curl https://your-r-service.up.railway.app/`

## Troubleshooting

**Backend can't connect to services:**
- Check service URLs in env vars
- Ensure services have public domains generated

**Python/R services failing:**
- Check Railway logs
- Verify Dockerfiles build correctly
- Ensure ports are exposed

**Frontend can't reach backend:**
- Verify `VITE_API_URL` is correct
- Check CORS settings in backend

## Cost Estimate

- Railway: ~$20/month (Hobby plan)
- Vercel: Free (Hobby plan)
- LLM API: ~$50-100 per full analysis

## Next Steps

- Set up custom domains
- Configure monitoring
- Set up backups
- Add rate limiting


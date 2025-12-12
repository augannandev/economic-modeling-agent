# Production Setup Summary

## Current Architecture

Your Survival Analysis Agent is deployed with the following production setup:

### Frontend: Vercel
- **Location**: `my-app/ui/`
- **Framework**: Vite + React
- **Configuration**: `vercel.json` in root and `ui/vercel.json`
- **Build Command**: `pnpm build` (configured in vercel.json)
- **Output Directory**: `ui/dist`

### Backend Services: Railway

#### 1. Backend API (Node.js/Hono)
- **Location**: `my-app/server/`
- **Configuration**: `server/railway.json`
- **Start Command**: `pnpm exec tsx src/server.ts` (from railway.json)
- **Port**: Uses `$PORT` environment variable (Railway auto-assigns)
- **Framework**: Hono (Node.js runtime)

#### 2. Python Service
- **Location**: `my-app/python-service/`
- **Configuration**: `railway-python.json`
- **Port**: 8000
- **Framework**: FastAPI

#### 3. R Service
- **Location**: `my-app/r-service/`
- **Configuration**: `railway-r.json`
- **Port**: 8001
- **Framework**: Plumber API

### Databases

#### 1. Supabase Database
- **Purpose**: Primary database for projects, IPD data, analyses, models, synthesis reports
- **Configuration**: 
  - Environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
  - Client: `server/src/lib/supabase.ts`
  - Used for: Projects, IPD storage, analysis results, KM extraction cache

#### 2. PostgreSQL on Railway
- **Purpose**: User authentication and session data (via Drizzle ORM)
- **Configuration**:
  - Environment variable: `DATABASE_URL`
  - Client: `server/src/lib/db.ts`
  - Supports: Neon, Supabase, Railway PostgreSQL, or custom PostgreSQL

## Environment Variables

### Backend API (Railway)
Required environment variables:
```env
# Database (Railway PostgreSQL)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Supabase (for project/IPD storage)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# Firebase (authentication)
FIREBASE_PROJECT_ID=your-firebase-project-id

# LLM API Keys
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key

# Service URLs (Railway public domains)
PYTHON_SERVICE_URL=${{PythonService.RAILWAY_PUBLIC_DOMAIN}}
R_SERVICE_URL=${{RService.RAILWAY_PUBLIC_DOMAIN}}

# Port (auto-set by Railway)
PORT=5500
```

### Python Service (Railway)
```env
R_SERVICE_URL=${{RService.RAILWAY_PUBLIC_DOMAIN}}
PORT=8000
PLOTS_DIRECTORY=/app/data/plots
```

### Frontend (Vercel)
```env
VITE_API_URL=https://your-backend-api.up.railway.app
VITE_ALLOW_ANONYMOUS_USERS=true  # Optional: for demo mode
VITE_FIREBASE_API_KEY=your-firebase-api-key  # If using Firebase
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
```

## Key Configuration Files

### Deployment Configuration
- `my-app/vercel.json` - Root Vercel config
- `my-app/ui/vercel.json` - UI-specific Vercel config
- `my-app/server/railway.json` - Backend API Railway config
- `my-app/railway.toml` - Railway project config
- `my-app/railway-python.json` - Python service Railway config
- `my-app/railway-r.json` - R service Railway config

### Database Configuration
- `my-app/server/src/lib/db.ts` - PostgreSQL connection (Drizzle ORM)
- `my-app/server/src/lib/supabase.ts` - Supabase REST API client
- `my-app/server/drizzle.config.ts` - Drizzle schema configuration

### API Configuration
- `my-app/server/src/server.ts` - Server entry point
- `my-app/server/src/api.ts` - API routes (Hono)
- `my-app/ui/src/lib/serverComm.ts` - Frontend API client
- `my-app/ui/src/lib/survivalApi.ts` - Survival analysis API client

## Service Communication Flow

```
┌─────────────┐
│   Vercel    │  Frontend (React)
│  (Static)   │
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
│       ┌────────────┴────────────┐               │
│       │                         │               │
│  ┌────▼─────┐          ┌───────▼──────┐        │
│  │PostgreSQL│          │   Supabase   │        │
│  │(Railway) │          │   Database   │        │
│  └──────────┘          └──────────────┘        │
└─────────────────────────────────────────────────┘
```

## Database Usage

### PostgreSQL (Railway)
- **Purpose**: User authentication, session management
- **Schema**: Defined in `server/src/schema/users.ts`
- **ORM**: Drizzle ORM
- **Connection**: Via `DATABASE_URL` environment variable

### Supabase Database
- **Purpose**: Project data, IPD storage, analysis results, KM extraction cache
- **Tables**: 
  - `projects` - User projects
  - `ipd_data` - Individual patient data
  - `analyses` - Analysis runs
  - `models` - Fitted survival models
  - `ph_tests` - Proportional hazards test results
  - `synthesis_reports` - Final synthesis reports
  - `km_extraction_cache` - Cached KM curve extractions
- **API**: REST API via `server/src/lib/supabase.ts`
- **Configuration**: `SUPABASE_URL` and `SUPABASE_ANON_KEY` environment variables

## Testing in Production

### Current Status
You mentioned testing in production. Here's what to verify:

1. **Frontend → Backend Connection**
   - Check `VITE_API_URL` in Vercel points to Railway backend
   - Verify CORS is configured (currently allows all origins: `origin: '*'`)

2. **Backend → Services**
   - Verify `PYTHON_SERVICE_URL` and `R_SERVICE_URL` point to Railway services
   - Check service health endpoints

3. **Database Connections**
   - PostgreSQL: Verify `DATABASE_URL` connects to Railway PostgreSQL
   - Supabase: Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set

4. **Service Health Checks**
   - Backend: `GET /api/v1/hello`
   - Python: `GET /health`
   - R: `GET /`

## Important Notes

1. **Dual Database Setup**: The system uses both PostgreSQL (Railway) and Supabase:
   - PostgreSQL: User auth and session data
   - Supabase: Project data, IPD, analyses, models

2. **Service Discovery**: Railway services use public domains that need to be configured:
   - Generate public domains in Railway dashboard
   - Use Railway's service reference syntax: `${{ServiceName.RAILWAY_PUBLIC_DOMAIN}}`

3. **CORS Configuration**: Currently allows all origins (`origin: '*'`) - consider restricting in production

4. **Environment Variables**: Make sure all required env vars are set in:
   - Railway: For backend services
   - Vercel: For frontend

5. **Data Storage**: 
   - IPD data can be stored in Supabase (via project system)
   - Demo data available in `PseuodoIPD/` folder
   - Plots stored in `PLOTS_DIRECTORY` (configured per service)

## Troubleshooting

### Backend can't connect to services
- Check Railway service URLs in environment variables
- Ensure services have public domains generated
- Verify service dependencies in Railway

### Frontend can't reach backend
- Verify `VITE_API_URL` is set correctly in Vercel
- Check CORS settings in backend (`server/src/api.ts`)
- Ensure backend is running and accessible

### Database connection issues
- PostgreSQL: Check `DATABASE_URL` format and credentials
- Supabase: Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct
- Test connections using `/api/v1/db-test` endpoint

### Service health
- Backend: `curl https://your-backend.up.railway.app/api/v1/hello`
- Python: `curl https://your-python-service.up.railway.app/health`
- R: `curl https://your-r-service.up.railway.app/`

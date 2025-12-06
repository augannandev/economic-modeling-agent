# Testing Railway Deployment

## Current Status

**Backend API Domain**: `economic-modeling-agent-production.up.railway.app`
**Status**: Getting 404 error - service may not be running

## Troubleshooting Steps

### 1. Check Railway Dashboard

1. Go to Railway dashboard: https://railway.app
2. Click on your **Backend API** service (`economic-modeling-agent`)
3. Go to **"Deployments"** tab
4. Check the latest deployment:
   - ✅ **Green/Active** = Service is running
   - ❌ **Red/Failed** = Service failed to start
   - ⏳ **Building** = Still deploying

### 2. Check Deployment Logs

1. In Railway dashboard → Backend API service
2. Click **"Deployments"** tab
3. Click on the latest deployment
4. Check **"Logs"** tab for errors

**Common Issues to Look For:**

- ❌ **"Cannot find module"** → Dependencies not installed
- ❌ **"Port already in use"** → Port configuration issue
- ❌ **"Database connection failed"** → DATABASE_URL incorrect
- ❌ **"Build failed"** → Build command issue

### 3. Verify Service Configuration

In Railway → Backend API → **Settings** tab, verify:

- ✅ **Root Directory**: `my-app/server`
- ✅ **Build Command**: `pnpm install && pnpm build`
- ✅ **Start Command**: `node dist/server.js`
- ✅ **Port**: Should be auto-assigned (Railway sets `$PORT`)

### 4. Check Environment Variables

In Railway → Backend API → **Variables** tab, verify:

- ✅ `DATABASE_URL` is set (should reference PostgreSQL service)
- ✅ `PORT` is set (Railway auto-sets this)
- ✅ `PYTHON_SERVICE_URL` is set
- ✅ `R_SERVICE_URL` is set
- ✅ `ANTHROPIC_API_KEY` is set

### 5. Test After Fixes

Once you've fixed any issues and the service is running:

```bash
# Test root endpoint
curl https://economic-modeling-agent-production.up.railway.app/

# Expected: {"status":"ok","message":"API is running"}

# Test hello endpoint
curl https://economic-modeling-agent-production.up.railway.app/api/v1/hello

# Expected: {"message":"Hello from Hono!"}
```

## Common Fixes

### Fix 1: Service Not Building

**Problem**: Build command fails
**Solution**: 
1. Check Root Directory is `my-app/server`
2. Verify Build Command: `pnpm install && pnpm build`
3. Check logs for specific error

### Fix 2: Service Crashes on Start

**Problem**: Service starts then crashes
**Solution**:
1. Check Start Command: `node dist/server.js`
2. Verify `dist/` folder exists after build
3. Check if `dist/server.js` file exists
4. Review logs for runtime errors

### Fix 3: Port Issues

**Problem**: Port configuration error
**Solution**:
1. Remove any hardcoded PORT in code
2. Ensure code uses `process.env.PORT`
3. Railway automatically sets PORT

### Fix 4: Database Connection

**Problem**: Can't connect to database
**Solution**:
1. Verify `DATABASE_URL` uses `${{Postgres.DATABASE_URL}}`
2. Ensure PostgreSQL service is running
3. Check database service is in same Railway project

## Next Steps After Backend Works

Once Backend API is working:

1. **Test Python Service**:
   ```bash
   curl https://your-python-service-domain.up.railway.app/health
   ```

2. **Test R Service**:
   ```bash
   curl https://shimmering-growth-production.up.railway.app/
   ```

3. **Run Database Migration**:
   ```bash
   railway run --service backend-api pnpm db:push
   ```

4. **Deploy Frontend to Vercel**

## Quick Test Commands

```bash
# Backend API - Root
curl https://economic-modeling-agent-production.up.railway.app/

# Backend API - Hello
curl https://economic-modeling-agent-production.up.railway.app/api/v1/hello

# Backend API - Health (if you add this route)
curl https://economic-modeling-agent-production.up.railway.app/health

# Check HTTP status code
curl -o /dev/null -s -w "%{http_code}\n" https://economic-modeling-agent-production.up.railway.app/
```


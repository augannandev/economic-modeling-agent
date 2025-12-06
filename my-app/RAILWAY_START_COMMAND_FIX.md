# Fix Railway Start Command

## Problem
Railway is trying to run `node dist/server.js` but we're using `tsx` to run TypeScript directly.

## Solution

You need to update the **Start Command** in Railway Settings:

### Steps:

1. Go to Railway dashboard
2. Click on your **Backend API** service (`economic-modeling-agent`)
3. Go to **Settings** tab
4. Scroll down to **"Start Command"** section
5. **Clear/Delete** the current start command (`node dist/server.js`)
6. **Leave it empty** - Railway will use the Dockerfile CMD instead
7. Or set it to: `pnpm exec tsx src/server.ts`

### Alternative: Update Start Command

If Railway requires a Start Command, set it to:

```
pnpm exec tsx src/server.ts
```

## Why This Happens

Railway's **Start Command** in Settings overrides the Dockerfile CMD. Since we changed the Dockerfile to use `tsx`, we need to either:
- Remove the Start Command (let Dockerfile CMD run)
- Or update it to match the Dockerfile CMD

## After Fixing

1. Railway will automatically redeploy
2. Check the Deployments tab for the new deployment
3. Test: `curl https://economic-modeling-agent-production.up.railway.app/`


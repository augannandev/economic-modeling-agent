# Vercel Deployment Setup

## Quick Start (Demo Mode)

For a working demo without Firebase authentication, add this **one environment variable** to Vercel:

| Variable | Value |
|----------|-------|
| `VITE_ALLOW_ANONYMOUS_USERS` | `true` |

### Steps:
1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add `VITE_ALLOW_ANONYMOUS_USERS` with value `true`
4. Click **Redeploy** from the Deployments tab

This will:
- Skip Firebase authentication (instant access)
- Use pre-loaded demo data for survival analysis
- Allow full testing of KM Digitizer workflow

---

## Full Setup (with Firebase Auth)

If you want proper user authentication:

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable **Authentication** → **Sign-in method** → Enable Email/Password and Google

### 2. Add Firebase Config to Vercel

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Your project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | `your-project.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Your app ID |

### 3. Add Authorized Domain
In Firebase Console → **Authentication** → **Settings** → **Authorized domains**:
- Add `ai-econ-model-agent.vercel.app` (or your custom domain)

---

## Python Service Setup

The Python service needs to be deployed separately (e.g., Railway, Render, or a VM).

### Required Environment Variables for Python Service:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | For KM plot analysis using Claude |

### Demo Data
Demo IPD parquet files are included in `python-service/demo_data/`:
- `ipd_EndpointType.OS_Chemotherapy.parquet`
- `ipd_EndpointType.OS_Pembrolizumab.parquet`
- `ipd_EndpointType.PFS_Chemotherapy.parquet`
- `ipd_EndpointType.PFS_Pembrolizumab.parquet`

The survival analysis will automatically fall back to this demo data when no session-generated IPD is available.

---

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│  Node.js API    │────▶│ Python Service  │
│   (Vercel)      │     │   (Vercel)      │     │ (Railway/etc)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                       │
                                                       ▼
                                               ┌─────────────────┐
                                               │   Demo Data     │
                                               │  (parquet files)│
                                               └─────────────────┘
```


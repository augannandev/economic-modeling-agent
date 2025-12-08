# Setting Up ChromaDB on Railway

This guide explains how to deploy ChromaDB as a separate service on Railway for the RAG system.

## Step 1: Create ChromaDB Service

1. Go to your Railway project dashboard
2. Click **"New Service"** → **"Docker Image"**
3. Enter image: `chromadb/chroma:latest`
4. Click **"Deploy"**

## Step 2: Configure ChromaDB Service

After deployment, configure the service:

### Settings
- **Service Name**: `chromadb` (or your preference)
- **Port**: `8000` (ChromaDB default)

### Environment Variables (optional)
```
CHROMA_SERVER_AUTH_CREDENTIALS=your-secret-token
CHROMA_SERVER_AUTH_PROVIDER=chromadb.auth.token.TokenConfigServerAuthCredentialsProvider
```

### Networking
- Note the **internal URL**: `chromadb.railway.internal:8000`

## Step 3: Configure Node.js Server

Add these environment variables to your **Node.js server service** on Railway:

```
CHROMA_URL=http://chromadb.railway.internal:8000
OPENAI_API_KEY=sk-your-openai-key
RAG_DATA_DIR=/app/rag_data
```

## Step 4: Ensure rag_data is Deployed

Make sure the `rag_data/` folder is included in your Node.js deployment:

```dockerfile
# In your Dockerfile, ensure rag_data is copied
COPY rag_data ./rag_data
```

Or in your `railway.json`:
```json
{
  "build": {
    "builder": "NIXPACKS"
  }
}
```
(Nixpacks will include all files by default)

## Step 5: Trigger RAG Ingestion

After both services are deployed, trigger document ingestion:

### Option A: Via API (Recommended)
```bash
curl -X POST https://your-node-service.railway.app/api/v1/rag/ingest
```

### Option B: Via Railway Shell
```bash
cd /app/server
pnpm rag:ingest
```

## Step 6: Verify Setup

Check RAG status:
```bash
curl https://your-node-service.railway.app/api/v1/rag/status
```

Expected response:
```json
{
  "status": "ok",
  "chromaUrl": "http://chromadb.railway.internal:8000",
  "collection": "survival_analysis_docs",
  "documentCount": 150,
  "sources": ["TSD14-Survival-analysis.pdf", "external_benchmarks.md", ...]
}
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/rag/status` | GET | Check ChromaDB connection and collection stats |
| `/api/v1/rag/ingest` | POST | Trigger document ingestion from rag_data/ |
| `/api/v1/rag/query` | POST | Test RAG query (body: `{"query": "...", "nResults": 5}`) |

## Troubleshooting

### ChromaDB Connection Failed
- Verify the internal URL is correct
- Check ChromaDB service logs on Railway
- Ensure both services are in the same Railway project (for internal networking)

### Ingestion Returns 0 Documents
- Check `RAG_DATA_DIR` environment variable
- Verify rag_data folder is included in deployment
- Check Node.js service logs for path errors

### OpenAI Embedding Errors
- Verify `OPENAI_API_KEY` is set correctly
- Check API key has embeddings access

## Cost Estimate

ChromaDB on Railway:
- **Memory**: ~256-512MB
- **CPU**: Minimal (spikes during ingestion)
- **Estimated Cost**: $5-10/month with light usage

## Alternative: Use Fallback Mode

If you want to skip ChromaDB entirely, the system will automatically fall back to simple file-based context matching. Just don't set `CHROMA_URL` and ensure `rag_data/` is deployed.


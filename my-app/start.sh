#!/bin/bash
set -e

echo "Starting R Service (Plumber) on port 8001..."
# Start R service in background
Rscript -e 'library(plumber); pr("r-service/plumber.R") %>% pr_run(port=8001, host="0.0.0.0")' &

# Wait for R service to be ready (optional but good practice)
echo "Waiting for R service to initialize..."
sleep 5

echo "Starting Python Service (FastAPI) on port 8000..."
# Start Python service in foreground
cd python-service
# No need for venv in Docker, packages are installed globally
uvicorn main:app --host 0.0.0.0 --port 8000

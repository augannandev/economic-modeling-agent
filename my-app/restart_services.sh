#!/bin/bash
echo "Stopping services..."
pkill -f "Rscript"
pkill -f "uvicorn"
pkill -f "python main.py"

# Wait a moment
sleep 2

echo "Starting R service..."
nohup Rscript -e 'library(plumber); pr("r-service/plumber.R") %>% pr_run(port=8001)' > r_service.log 2>&1 &


echo "Starting Python service..."
cd python-service
# Assume venv exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi
nohup uvicorn main:app --host 0.0.0.0 --port 8000 --reload > ../python_service.log 2>&1 &
cd ..

echo "Checking Web App..."
if lsof -i :3000 > /dev/null; then
    echo "Web App already running on port 3000."
else
    echo "Starting Web App..."
    nohup npm run dev > web_app.log 2>&1 &
fi

echo "Services restarted."

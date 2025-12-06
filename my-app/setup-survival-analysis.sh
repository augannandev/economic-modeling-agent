#!/bin/bash

# Survival Analysis System Setup Script

set -e

echo "🚀 Setting up Survival Analysis System..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check Python
echo "📦 Checking Python installation..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo -e "${GREEN}✓${NC} Python found: $PYTHON_VERSION"
else
    echo -e "${YELLOW}⚠${NC} Python 3 not found. Please install Python 3.11+"
    exit 1
fi

# Step 2: Setup Python virtual environment
echo ""
echo "🐍 Setting up Python virtual environment..."
cd python-service
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo -e "${GREEN}✓${NC} Virtual environment created"
else
    echo -e "${GREEN}✓${NC} Virtual environment already exists"
fi

# Step 3: Install Python dependencies
echo ""
echo "📥 Installing Python dependencies..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
echo -e "${GREEN}✓${NC} Python dependencies installed"
deactivate
cd ..

# Step 4: Create plots directory
echo ""
echo "📁 Creating directories..."
mkdir -p data/plots
echo -e "${GREEN}✓${NC} Directories created"

# Step 5: Check .env file
echo ""
echo "🔐 Checking environment variables..."
if [ -f "server/.env" ]; then
    if grep -q "ANTHROPIC_API_KEY=your_anthropic_api_key_here" server/.env || ! grep -q "ANTHROPIC_API_KEY=" server/.env; then
        echo -e "${YELLOW}⚠${NC} Please add your ANTHROPIC_API_KEY to server/.env"
        echo "   Edit server/.env and set: ANTHROPIC_API_KEY=your_actual_key"
    else
        echo -e "${GREEN}✓${NC} ANTHROPIC_API_KEY found in .env"
    fi
else
    echo -e "${YELLOW}⚠${NC} server/.env file not found. Creating from template..."
    cat > server/.env << EOF
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5502/postgres

# Firebase
FIREBASE_PROJECT_ID=demo-project

# LLM API Keys
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Service URLs
PYTHON_SERVICE_URL=http://localhost:8000
R_SERVICE_URL=http://localhost:8001

# Data Directories
DATA_DIRECTORY=./my-app/PseuodoIPD
PLOTS_DIRECTORY=./data/plots
SEER_DATA_PATH=./data/seer

# Token Limits
MAX_OUTPUT_TOKENS_VISION=2000
MAX_OUTPUT_TOKENS_REASONING=16000
MAX_OUTPUT_TOKENS_SYNTHESIS=8000
EOF
    echo -e "${YELLOW}⚠${NC} Please edit server/.env and add your API keys"
fi

# Step 6: Check parquet files
echo ""
echo "📊 Checking data files..."
if [ -f "PseuodoIPD/ipd_EndpointType.OS_Chemotherapy.parquet" ] && [ -f "PseuodoIPD/ipd_EndpointType.OS_Pembrolizumab.parquet" ]; then
    echo -e "${GREEN}✓${NC} Parquet data files found"
else
    echo -e "${YELLOW}⚠${NC} Parquet data files not found in PseuodoIPD/"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Add your ANTHROPIC_API_KEY to server/.env"
echo "2. Run database migration: cd server && pnpm db:push"
echo "3. Start Python service: cd python-service && source venv/bin/activate && python main.py"
echo "4. Start main services: pnpm dev"
echo ""
echo "See SETUP.md for detailed instructions."


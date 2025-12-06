# Use a base image that supports both Python and R
# python:3.11-slim-bookworm is a good base, we can install R on top
FROM python:3.11-slim-bookworm

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    R_BASE_VERSION=4.3.1 \
    DEBIAN_FRONTEND=noninteractive

# Install system dependencies and R
RUN apt-get update && apt-get install -y --no-install-recommends \
    r-base \
    r-base-dev \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    libfontconfig1-dev \
    libcairo2-dev \
    libxt-dev \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Setup application directory
WORKDIR /app

# --- Python Setup ---
COPY python-service/requirements.txt ./python-service/requirements.txt
RUN pip install --no-cache-dir -r python-service/requirements.txt

# --- R Setup ---
# Create an R script to install dependencies
RUN echo 'install.packages(c("plumber", "jsonlite", "survival", "flexsurv", "rstpm2"), repos="http://cran.rstudio.com/")' > install_packages.R
RUN Rscript install_packages.R && rm install_packages.R

# --- Copy Code ---
COPY python-service ./python-service
COPY r-service ./r-service
COPY start.sh .

# Make start script executable
RUN chmod +x start.sh

# Expose ports
# 8000: Python Service (Main entrypoint)
# 8001: R Service (Internal)
EXPOSE 8000

# Start both services
CMD ["./start.sh"]

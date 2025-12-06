FROM r-base:4.3.0

WORKDIR /app

# Install system dependencies and R packages
RUN apt-get update && apt-get install -y \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    curl \
    && Rscript -e "install.packages(c('plumber', 'survival', 'flexsurv', 'rstpm2', 'jsonlite'), repos='https://cloud.r-project.org')" \
    && rm -rf /var/lib/apt/lists/*

# Copy application code
COPY . .

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8001/ || exit 1

# Run the application
CMD ["Rscript", "main.R"]


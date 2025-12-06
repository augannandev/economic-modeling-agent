FROM r-base:4.3.0

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install R packages with error handling
RUN Rscript -e "options(repos = c(CRAN = 'https://cloud.r-project.org')); \
    install.packages(c('plumber', 'survival', 'jsonlite'), dependencies = TRUE)" || \
    Rscript -e "install.packages('plumber', repos='https://cloud.r-project.org', dependencies=TRUE)" && \
    Rscript -e "install.packages('survival', repos='https://cloud.r-project.org', dependencies=TRUE)" && \
    Rscript -e "install.packages('jsonlite', repos='https://cloud.r-project.org', dependencies=TRUE)"

# Try to install optional packages (may fail, but that's OK)
RUN Rscript -e "install.packages('flexsurv', repos='https://cloud.r-project.org', dependencies=TRUE)" || echo "flexsurv installation failed, continuing..."
RUN Rscript -e "if (!require('BiocManager', quietly = TRUE)) install.packages('BiocManager', repos='https://cloud.r-project.org'); \
    BiocManager::install('rstpm2', update=FALSE, ask=FALSE)" || echo "rstpm2 installation failed, continuing..."

# Verify plumber is installed
RUN Rscript -e "if (!require('plumber', quietly = TRUE)) stop('plumber package not installed')" && \
    echo "✓ plumber package verified"

# Copy application code
COPY . .

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8001/ || exit 1

# Run the application
CMD ["Rscript", "main.R"]


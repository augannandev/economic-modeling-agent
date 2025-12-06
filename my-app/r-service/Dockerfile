FROM r-base:4.3.0

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install R packages - install plumber first (most critical)
RUN Rscript -e "install.packages('plumber', repos='https://cloud.r-project.org', dependencies=TRUE)"

# Install other required packages
RUN Rscript -e "install.packages(c('survival', 'jsonlite'), repos='https://cloud.r-project.org', dependencies=TRUE)"

# Install optional packages (non-blocking)
RUN Rscript -e "tryCatch(install.packages('flexsurv', repos='https://cloud.r-project.org', dependencies=TRUE), error=function(e) cat('flexsurv failed:', e$message, '\n'))" || true

# Verify critical packages are installed
RUN Rscript -e "if (!require('plumber', quietly = TRUE)) stop('plumber not installed'); \
    if (!require('survival', quietly = TRUE)) stop('survival not installed'); \
    if (!require('jsonlite', quietly = TRUE)) stop('jsonlite not installed'); \
    cat('✓ All required packages installed\n')"

# Copy application code
COPY . .

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8001/ || exit 1

# Run the application
CMD ["Rscript", "main.R"]


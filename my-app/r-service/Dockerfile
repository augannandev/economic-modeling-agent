FROM r-base:4.3.0

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set CRAN mirror and install R packages with explicit error checking
RUN Rscript -e "options(repos = c(CRAN = 'https://cloud.r-project.org')); \
    cat('Installing plumber...\n'); \
    install.packages('plumber', repos='https://cloud.r-project.org', dependencies=TRUE); \
    if (!require('plumber', quietly = TRUE)) stop('plumber installation failed'); \
    cat('✓ plumber installed\n')"

RUN Rscript -e "options(repos = c(CRAN = 'https://cloud.r-project.org')); \
    cat('Installing survival...\n'); \
    install.packages('survival', repos='https://cloud.r-project.org', dependencies=TRUE); \
    if (!require('survival', quietly = TRUE)) stop('survival installation failed'); \
    cat('✓ survival installed\n')"

RUN Rscript -e "options(repos = c(CRAN = 'https://cloud.r-project.org')); \
    cat('Installing jsonlite...\n'); \
    install.packages('jsonlite', repos='https://cloud.r-project.org', dependencies=TRUE); \
    if (!require('jsonlite', quietly = TRUE)) stop('jsonlite installation failed'); \
    cat('✓ jsonlite installed\n')"

# Verify all packages are available
RUN Rscript -e "cat('Verifying packages...\n'); \
    if (!require('plumber', quietly = TRUE)) stop('plumber not available'); \
    if (!require('survival', quietly = TRUE)) stop('survival not available'); \
    if (!require('jsonlite', quietly = TRUE)) stop('jsonlite not available'); \
    cat('✓ All packages verified\n')"

# Copy application code
COPY . .

# Final verification that packages are available before copying code
RUN Rscript -e "cat('Final package check...\n'); \
    library(plumber); \
    library(survival); \
    library(jsonlite); \
    cat('✓ All packages loaded successfully\n')"

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8001/ || exit 1

# Run the application
CMD ["Rscript", "main.R"]


FROM r-base:4.3.0

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install R packages - use faster method without all dependencies
# Install plumber with minimal dependencies first (faster)
RUN Rscript -e "options(repos = c(CRAN = 'https://cloud.r-project.org')); \
    options(timeout = 300); \
    cat('Installing plumber (this may take a few minutes)...\n'); \
    install.packages('plumber', repos='https://cloud.r-project.org', dependencies = c('Depends', 'Imports')); \
    cat('✓ plumber installed\n')"

# Install survival (usually fast)
RUN Rscript -e "options(repos = c(CRAN = 'https://cloud.r-project.org')); \
    install.packages('survival', repos='https://cloud.r-project.org'); \
    cat('✓ survival installed\n')"

# Install jsonlite (usually fast)
RUN Rscript -e "options(repos = c(CRAN = 'https://cloud.r-project.org')); \
    install.packages('jsonlite', repos='https://cloud.r-project.org'); \
    cat('✓ jsonlite installed\n')"

# Quick verification (don't load, just check if installed)
RUN Rscript -e "cat('Verifying packages...\n'); \
    pkgs <- c('plumber', 'survival', 'jsonlite'); \
    installed <- rownames(installed.packages()); \
    missing <- pkgs[!pkgs %in% installed]; \
    if (length(missing) > 0) stop(paste('Missing packages:', paste(missing, collapse=', '))); \
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


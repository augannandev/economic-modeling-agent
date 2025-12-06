FROM r-base:4.3.0

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install R packages with explicit error checking
# Install plumber - check if installation actually succeeded
RUN Rscript -e "options(repos = c(CRAN = 'https://cloud.r-project.org')); \
    options(timeout = 600); \
    cat('Installing plumber (this may take a few minutes)...\n'); \
    result <- tryCatch({ \
        install.packages('plumber', repos='https://cloud.r-project.org', dependencies = c('Depends', 'Imports'), quiet = FALSE); \
        TRUE \
    }, error = function(e) { \
        cat('ERROR installing plumber:', e$message, '\n'); \
        FALSE \
    }); \
    if (!result) stop('plumber installation failed'); \
    if (!'plumber' %in% rownames(installed.packages())) stop('plumber not found after installation'); \
    cat('✓ plumber installed and verified\n')"

# Install survival
RUN Rscript -e "options(repos = c(CRAN = 'https://cloud.r-project.org')); \
    cat('Installing survival...\n'); \
    install.packages('survival', repos='https://cloud.r-project.org', quiet = FALSE); \
    if (!'survival' %in% rownames(installed.packages())) stop('survival installation failed'); \
    cat('✓ survival installed\n')"

# Install jsonlite
RUN Rscript -e "options(repos = c(CRAN = 'https://cloud.r-project.org')); \
    cat('Installing jsonlite...\n'); \
    install.packages('jsonlite', repos='https://cloud.r-project.org', quiet = FALSE); \
    if (!'jsonlite' %in% rownames(installed.packages())) stop('jsonlite installation failed'); \
    cat('✓ jsonlite installed\n')"

# Copy application code
COPY . .

# Final verification - try to load packages
RUN Rscript -e "cat('Final package verification...\n'); \
    pkgs <- c('plumber', 'survival', 'jsonlite'); \
    installed <- rownames(installed.packages()); \
    missing <- pkgs[!pkgs %in% installed]; \
    if (length(missing) > 0) { \
        cat('Installed packages:', paste(installed, collapse=', '), '\n'); \
        stop(paste('Missing packages:', paste(missing, collapse=', '))); \
    }; \
    cat('✓ All packages verified\n')"

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8001/ || exit 1

# Run the application
CMD ["Rscript", "main.R"]


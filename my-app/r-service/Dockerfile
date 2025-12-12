FROM rocker/r-ver:4.3.0

WORKDIR /app

# Install system dependencies (including libsodium-dev for plumber dependency)
# Also include libraries needed for remotes, graphics packages, and survminer deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    libsodium-dev \
    libharfbuzz-dev \
    libfribidi-dev \
    libfreetype6-dev \
    libpng-dev \
    libtiff5-dev \
    libjpeg-dev \
    libfontconfig1-dev \
    libcairo2-dev \
    libpango1.0-dev \
    curl \
    git \
    build-essential \
    gfortran \
    cmake \
    pkg-config \
    libnlopt-dev \
    liblapack-dev \
    libblas-dev \
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

# Install base64enc (required for plot encoding)
RUN Rscript -e "options(repos = c(CRAN = 'https://cloud.r-project.org')); \
    cat('Installing base64enc...\n'); \
    install.packages('base64enc', repos='https://cloud.r-project.org', quiet = FALSE); \
    if (!'base64enc' %in% rownames(installed.packages())) stop('base64enc installation failed'); \
    cat('✓ base64enc installed\n')"

# Update Matrix package to system library (required >= 1.6.0 by MatrixModels)
RUN Rscript -e "options(repos=c(CRAN='https://cloud.r-project.org')); \
    cat('Updating Matrix package to system library...\n'); \
    install.packages('Matrix', lib=.Library, quiet=FALSE); \
    v <- packageVersion('Matrix'); \
    cat('Matrix version:', as.character(v), '\n'); \
    stopifnot(v >= '1.6.0'); \
    cat('✓ Matrix updated to', as.character(v), '\n')"

# Install SparseM and quantreg (dependencies for survminer chain)
RUN Rscript -e "options(repos=c(CRAN='https://cloud.r-project.org')); \
    cat('Installing SparseM...\n'); \
    install.packages('SparseM', quiet=FALSE); \
    stopifnot('SparseM' %in% rownames(installed.packages())); \
    cat('✓ SparseM installed\n')"

RUN Rscript -e "options(repos=c(CRAN='https://cloud.r-project.org')); \
    cat('Installing quantreg...\n'); \
    install.packages('quantreg', quiet=FALSE); \
    stopifnot('quantreg' %in% rownames(installed.packages())); \
    cat('✓ quantreg installed\n')"

# Install survminer (required by IPDfromKM)
RUN Rscript -e "options(repos=c(CRAN='https://cloud.r-project.org')); \
    cat('Installing survminer (this may take a few minutes)...\n'); \
    install.packages('survminer', quiet=FALSE); \
    stopifnot('survminer' %in% rownames(installed.packages())); \
    cat('✓ survminer installed\n')"

# Install zoo (lightweight, required by IPDfromKM)
RUN Rscript -e "options(repos = c(CRAN = 'https://cloud.r-project.org')); \
    cat('Installing zoo...\n'); \
    install.packages('zoo', repos='https://cloud.r-project.org', dependencies = FALSE, quiet = FALSE); \
    if (!'zoo' %in% rownames(installed.packages())) stop('zoo installation failed'); \
    cat('✓ zoo installed\n')"

# Install ggplot2 (required by IPDfromKM)
RUN Rscript -e "options(repos=c(CRAN='https://cloud.r-project.org')); \
    cat('Installing ggplot2...\n'); \
    install.packages('ggplot2', quiet=FALSE); \
    stopifnot('ggplot2' %in% rownames(installed.packages())); \
    cat('✓ ggplot2 installed\n')"

# Install gridExtra (required by IPDfromKM)
RUN Rscript -e "options(repos=c(CRAN='https://cloud.r-project.org')); \
    cat('Installing gridExtra...\n'); \
    install.packages('gridExtra', quiet=FALSE); \
    stopifnot('gridExtra' %in% rownames(installed.packages())); \
    cat('✓ gridExtra installed\n')"

# Install remotes (lightweight) once
RUN Rscript -e "options(repos=c(CRAN='https://cloud.r-project.org')); \
    if (!require('remotes', quietly=TRUE)) install.packages('remotes', Ncpus=2)"

# Install IPDfromKM (required) - no devtools, no dependency explosion
RUN Rscript -e "options(repos=c(CRAN='https://cloud.r-project.org')); \
    cat('Installing IPDfromKM from GitHub...\n'); \
    remotes::install_github('NaLiuStat/IPDfromKM', dependencies=FALSE, upgrade='never', build_vignettes=FALSE); \
    stopifnot('IPDfromKM' %in% rownames(installed.packages())); \
    cat('✓ IPDfromKM installed and verified\n')"

# Install flexsurv (required by survival_models.R)
RUN Rscript -e "options(repos = c(CRAN = 'https://cloud.r-project.org')); \
    options(timeout = 600); \
    cat('Installing flexsurv (this may take a few minutes)...\n'); \
    install.packages('flexsurv', repos='https://cloud.r-project.org', quiet = FALSE); \
    if (!'flexsurv' %in% rownames(installed.packages())) stop('flexsurv installation failed'); \
    cat('✓ flexsurv installed\n')"

# Install rstpm2 (required by survival_models.R for Royston-Parmar splines)
RUN Rscript -e "options(repos = c(CRAN = 'https://cloud.r-project.org')); \
    options(timeout = 600); \
    cat('Installing rstpm2 (this may take a few minutes)...\n'); \
    install.packages('rstpm2', repos='https://cloud.r-project.org', quiet = FALSE); \
    if (!'rstpm2' %in% rownames(installed.packages())) stop('rstpm2 installation failed'); \
    cat('✓ rstpm2 installed\n')"

# Copy application code
COPY . .

# Final verification - try to load packages (IPDfromKM is required)
RUN Rscript -e "cat('Final package verification...\n'); \
    required_pkgs <- c('plumber', 'survival', 'jsonlite', 'base64enc', 'flexsurv', 'rstpm2', 'IPDfromKM'); \
    installed <- rownames(installed.packages()); \
    missing_required <- required_pkgs[!required_pkgs %in% installed]; \
    if (length(missing_required) > 0) { \
    cat('Installed packages:', paste(installed, collapse=', '), '\n'); \
    stop(paste('Missing required packages:', paste(missing_required, collapse=', '))); \
    }; \
    cat('✓ All required packages verified (including IPDfromKM)\n')"

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8001/ || exit 1

# Run the application
CMD ["Rscript", "main.R"]


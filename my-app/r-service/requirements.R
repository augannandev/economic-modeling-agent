# R package requirements for Railway deployment
# This file is used by Railway's Nixpacks builder if Dockerfile isn't used

# Set CRAN repository
options(repos = c(CRAN = 'https://cloud.r-project.org'))

# Install required packages
install.packages(c('plumber', 'survival', 'jsonlite', 'base64enc', 'survminer'), dependencies = TRUE)

# Optional packages (may fail, but that's OK)
tryCatch({
  install.packages('flexsurv', dependencies = TRUE)
}, error = function(e) {
  cat('Note: flexsurv installation failed (optional package)\n')
})

# Install IPDfromKM - required package, try hard to get it installed
# First install zoo (dependency)
if (!require('zoo', quietly = TRUE)) {
  install.packages('zoo', repos = 'https://cloud.r-project.org', dependencies = TRUE)
}

# Try to install IPDfromKM - use remotes first, then devtools
success <- FALSE

# First try remotes (lighter weight)
if (!success) {
  tryCatch({
    cat('Attempting IPDfromKM installation via remotes...\n')
    if (!require('remotes', quietly = TRUE)) {
      install.packages('remotes', repos = 'https://cloud.r-project.org', dependencies = c('Depends', 'Imports'))
    }
    if (require('remotes', quietly = TRUE)) {
      remotes::install_github('NaLiuStat/IPDfromKM', dependencies = c('Depends', 'Imports'), quiet = FALSE)
      if ('IPDfromKM' %in% rownames(installed.packages())) {
        cat('✓ IPDfromKM installed via remotes\n')
        success <- TRUE
      }
    }
  }, error = function(e) {
    cat('Note: remotes installation failed:', e$message, '\n')
  })
}

# Fallback to devtools if remotes failed
if (!success) {
  tryCatch({
    cat('Trying devtools as fallback for IPDfromKM...\n')
    if (!require('devtools', quietly = TRUE)) {
      cat('Installing devtools (this may take a while)...\n')
      install.packages('devtools', repos = 'https://cloud.r-project.org', dependencies = c('Depends', 'Imports'))
    }
    if (require('devtools', quietly = TRUE)) {
      devtools::install_github('NaLiuStat/IPDfromKM', dependencies = c('Depends', 'Imports'), quiet = FALSE)
      if ('IPDfromKM' %in% rownames(installed.packages())) {
        cat('✓ IPDfromKM installed via devtools\n')
        success <- TRUE
      }
    }
  }, error = function(e) {
    cat('ERROR: devtools installation failed:', e$message, '\n')
  })
}

# Verify installation
if (!success || !('IPDfromKM' %in% rownames(installed.packages()))) {
  cat('ERROR: IPDfromKM installation failed after all attempts!\n')
  cat('This is a required package. Please check system dependencies.\n')
  stop('IPDfromKM installation failed - this package is required')
} else {
  cat('✓ IPDfromKM successfully installed and verified\n')
}

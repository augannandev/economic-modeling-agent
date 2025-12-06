# R package requirements for Railway deployment
# This file is used by Railway's Nixpacks builder if Dockerfile isn't used

# Set CRAN repository
options(repos = c(CRAN = 'https://cloud.r-project.org'))

# Install required packages
install.packages(c('plumber', 'survival', 'jsonlite'), dependencies = TRUE)

# Optional packages (may fail, but that's OK)
tryCatch({
  install.packages('flexsurv', dependencies = TRUE)
}, error = function(e) {
  cat('Note: flexsurv installation failed (optional package)\n')
})

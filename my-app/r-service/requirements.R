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

tryCatch({
  install.packages(c('devtools', 'zoo'), dependencies = TRUE)
  devtools::install_github('NaLiuStat/IPDfromKM', dependencies = TRUE)
}, error = function(e) {
  cat('Note: IPDfromKM installation failed (optional package)\n')
  cat('Error:', e$message, '\n')
})

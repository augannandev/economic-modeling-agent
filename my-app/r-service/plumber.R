# Plumber API for R Survival Analysis Service
# Run with: plumber::plumb("plumber.R")$run(port = 8001)

library(plumber)
library(jsonlite)

# Create router from survival_models.R (which contains all endpoints with #* annotations)
r <- plumber::plumb("survival_models.R")

# Return the router
r


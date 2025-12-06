#!/usr/bin/env Rscript
# Main entry point for R Survival Analysis Service
# Run with: Rscript main.R

library(plumber)

# Get the directory where this script is located
args <- commandArgs(trailingOnly = FALSE)
file_arg <- "--file="
script_path <- sub(file_arg, "", args[grep(file_arg, args)])
if (length(script_path) > 0) {
  script_dir <- dirname(normalizePath(script_path))
  setwd(script_dir)
}

# Load the Plumber API directly from survival_models.R (which has all endpoints)
pr <- plumber::plumb("survival_models.R")

# Get port from environment variable (Railway) or use default
port <- as.integer(Sys.getenv("PORT", "8001"))

# Run the service
cat(sprintf("Starting R Survival Analysis Service on port %d...\n", port))
pr$run(port = port, host = "0.0.0.0")


#!/usr/bin/env Rscript

# Standalone script to reconstruct IPD from KM data and Risk Tables
# Usage: Rscript reconstruct_ipd_standalone.R
# Requirements: IPDfromKM, dplyr (optional, using base R where possible)

# Set CRAN mirror for any auto-install attempts (though we expect pkgs to be present)
options(repos = c(CRAN = "https://cloud.r-project.org"))

# Load required packages
if (!require("IPDfromKM", quietly = TRUE)) {
    if (!require("devtools", quietly = TRUE)) install.packages("devtools")
    devtools::install_github("NaLiuStat/IPDfromKM")
    library(IPDfromKM)
}

# Define paths (relative to script location or absolute)
# Assuming script is in my-app/r-service/ and data is in my-app/PseuodoIPD/
# We'll use absolute paths based on the project structure we know
base_dir <- "/Users/ansberthafreiku/dev/SurvivalAgent/my-app/PseuodoIPD"
km_file <- file.path(base_dir, "km_data_all_endpoints.csv")
risk_file <- file.path(base_dir, "risk_table_OS.csv")
output_dir <- base_dir

cat("Reading data from:", base_dir, "\n")

# Read data
if (!file.exists(km_file)) stop(paste("KM file not found:", km_file))
km_data <- read.csv(km_file)

if (!file.exists(risk_file)) {
    cat("Warning: Risk table not found:", risk_file, "- proceeding without risk table (less accurate)\n")
    risk_data <- NULL
} else {
    risk_data <- read.csv(risk_file)
}

# Normalize column names to lowercase for consistency
names(km_data) <- tolower(names(km_data))
if (!is.null(risk_data)) names(risk_data) <- tolower(names(risk_data))

# Identify unique endpoint/arm combinations
# Create a unique key
km_data$key <- paste(km_data$endpoint, km_data$arm, sep = "_")
unique_combos <- unique(km_data$key)

cat("Found", length(unique_combos), "combinations to reconstruct:\n")
print(unique_combos)

for (combo in unique_combos) {
    cat("\n------------------------------------------------\n")
    cat("Processing:", combo, "\n")

    # Filter data for this combination
    subset_km <- km_data[km_data$key == combo, ]

    # Sort by time
    subset_km <- subset_km[order(subset_km$time), ]

    # Ensure monotonicity of survival (required for IPDfromKM)
    subset_km$survival <- cummin(subset_km$survival)

    # Parse arm/endpoint for risk table matching
    this_endpoint <- subset_km$endpoint[1]
    this_arm <- subset_km$arm[1]

    # Prepare input for getIPD
    # IPDfromKM expects a dataframe with 'time' and 'survival'
    dat_frame <- data.frame(
        time = subset_km$time,
        survival = subset_km$survival
    )

    # Try to find matching risk table data
    trisk <- NULL
    nrisk <- NULL

    if (!is.null(risk_data)) {
        # Match on endpoint and arm
        # Note: risk table usually has specific time points
        subset_risk <- risk_data[risk_data$endpoint == this_endpoint & risk_data$arm == this_arm, ]

        if (nrow(subset_risk) > 0) {
            cat("  Found matching risk table with", nrow(subset_risk), "rows\n")
            # IPDfromKM expects sorted unique time points
            subset_risk <- subset_risk[order(subset_risk$time_months), ]
            trisk <- subset_risk$time_months
            nrisk <- subset_risk$n_risk
        } else {
            cat("  No matching risk table data found for this arm.\n")
        }
    }

    # We need totalpts (total patients) for the calculation
    # If we have risk table, t=0 usually has the total count
    total_pts <- NULL

    if (!is.null(nrisk) && !is.null(trisk)) {
        # Find n at time 0
        idx_0 <- which(trisk == 0)
        if (length(idx_0) > 0) {
            total_pts <- nrisk[idx_0]
        } else {
            # Use the max risk if t=0 missing (conservative guess)
            total_pts <- max(nrisk)
        }
    }

    # Fallback if no total_pts found: guess or default?
    if (is.null(total_pts)) {
        cat("  Warning: Could not determine total patients. Using default n=100 for estimation.\n")
        total_pts <- 100
    }

    cat("  Reconstructing with N =", total_pts, "\n")

    tryCatch(
        {
            # Step 1: Preprocess
            # maxy=1 implies survival is 0-1. If data is 0-100, use maxy=100.
            # Looking at CSV, survival is 0.0-1.0 (e.g. 0.9912). So maxy=1.
            prep <- IPDfromKM::preprocess(
                dat = dat_frame,
                trisk = trisk,
                nrisk = nrisk,
                totalpts = total_pts,
                maxy = 1
            )

            # Step 2: Get IPD
            # armID is just a label
            ipd_res <- IPDfromKM::getIPD(
                prep = prep,
                tot.events = NULL # Let it estimate
            )

            # Save output
            out_file <- file.path(output_dir, paste0("reconstructed_ipd_", this_endpoint, "_", this_arm, ".csv"))

            # Convert to standard DF
            # ipd_res is a list with IPD dataframe inside
            out_df <- data.frame(
                time = ipd_res$IPD$time,
                event = ipd_res$IPD$status, # 1=event, 0=censored
                arm = this_arm,
                endpoint = this_endpoint
            )

            write.csv(out_df, out_file, row.names = FALSE)
            cat("  Saved result to:", out_file, "\n")
            cat("  Reconstructed", nrow(out_df), "patients (", sum(out_df$event), "events )\n")
        },
        error = function(e) {
            cat("  Error during reconstruction:", e$message, "\n")
        }
    )
}

cat("\nComplete.\n")

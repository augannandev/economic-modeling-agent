#!/usr/bin/env Rscript

# Script to check HR and Median Survival of reconstructed IPD
# Usage: Rscript check_reconstruction_stats.R

options(repos = c(CRAN = "https://cloud.r-project.org"))

if (!require("survival", quietly = TRUE)) install.packages("survival")
library(survival)

base_dir <- "/Users/ansberthafreiku/dev/SurvivalAgent/my-app/PseuodoIPD"

# Define file paths
pembro_file <- file.path(base_dir, "reconstructed_ipd_OS_Pembrolizumab.csv")
chemo_file <- file.path(base_dir, "reconstructed_ipd_OS_Chemotherapy.csv")

# Check files exist
if (!file.exists(pembro_file) || !file.exists(chemo_file)) {
    stop("Reconstructed IPD files not found. Run reconstruct_ipd_standalone.R first.")
}

# Read data
pembro_data <- read.csv(pembro_file)
chemo_data <- read.csv(chemo_file)

# Add numeric arm indicator for coxph if needed, though name is fine usually.
# Let's verify columns: time, event, arm
# Combine
all_data <- rbind(pembro_data, chemo_data)

# Ensure arm is a factor and set reference level (usually Control/Standard of Care is ref)
# Here Chemo is the reference arm for HR calculation (HR of Pembro vs Chemo)
all_data$arm <- as.factor(all_data$arm)
# "Chemotherapy" should be reference to see HR for Pembrolizumab
all_data$arm <- relevel(all_data$arm, ref = "Chemotherapy")

cat("--------------------------------------------------\n")
cat("Reconstruction Statistics Check\n")
cat("--------------------------------------------------\n\n")

# 1. Median Survival
cat("1. Median Survival Estimates:\n")
fit_km <- survfit(Surv(time, event) ~ arm, data = all_data)
print(fit_km)

# Extract precise medians
medians <- quantile(fit_km, probs = 0.5)$quantile
cat("\nPrecise Medians:\n")
print(medians)

cat("\n--------------------------------------------------\n")

# 2. Hazard Ratio
# Fit Cox PH model: Surv ~ arm
cat("2. Hazard Ratio (Pembrolizumab vs Chemotherapy):\n")
fit_cox <- coxph(Surv(time, event) ~ arm, data = all_data)
summary_cox <- summary(fit_cox)

# Extract HR and CI
hr <- summary_cox$conf.int[1] # exp(coef)
hr_lower <- summary_cox$conf.int[3] # lower .95
hr_upper <- summary_cox$conf.int[4] # upper .95
p_val <- summary_cox$coefficients[5] # p-value

cat(sprintf("Hazard Ratio: %.3f (95%% CI: %.3f - %.3f)\n", hr, hr_lower, hr_upper))
cat(sprintf("P-value: %.5f\n", p_val))

cat("\n--------------------------------------------------\n")

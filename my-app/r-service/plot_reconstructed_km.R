#!/usr/bin/env Rscript

# Script to plot reconstructed KM curves
# Usage: Rscript plot_reconstructed_km.R

options(repos = c(CRAN = "https://cloud.r-project.org"))

if (!require("survival", quietly = TRUE)) install.packages("survival")
library(survival)

# Check for survminer for pretty plots, fallback to base plot if missing
has_survminer <- require("survminer", quietly = TRUE)

base_dir <- "/Users/ansberthafreiku/dev/SurvivalAgent/my-app/PseuodoIPD"
output_plot <- file.path(base_dir, "reconstructed_km_plot.png")

# Define file paths
pembro_file <- file.path(base_dir, "reconstructed_ipd_OS_Pembrolizumab.csv")
chemo_file <- file.path(base_dir, "reconstructed_ipd_OS_Chemotherapy.csv")

if (!file.exists(pembro_file) || !file.exists(chemo_file)) {
    stop("Files not found.")
}

pembro_data <- read.csv(pembro_file)
chemo_data <- read.csv(chemo_file)

all_data <- rbind(pembro_data, chemo_data)
# Ensure Arm is factor with correct order
all_data$arm <- factor(all_data$arm, levels = c("Chemotherapy", "Pembrolizumab"))

# Fit KM
fit <- survfit(Surv(time, event) ~ arm, data = all_data)

# Create Plot
png(output_plot, width = 800, height = 600, res = 100)

if (has_survminer) {
    print("Using survminer for plotting...")
    p <- ggsurvplot(
        fit,
        data = all_data,
        risk.table = TRUE,
        pval = TRUE,
        conf.int = TRUE,
        xlab = "Time (Months)",
        ylab = "Overall Survival Probability",
        title = "Reconstructed Kaplan-Meier Curves (KEYNOTE-024)",
        palette = c("red", "blue"),
        ggtheme = theme_minimal()
    )
    print(p)
} else {
    print("Using base R plot...")
    plot(fit,
        col = c("red", "blue"),
        lwd = 2,
        xlab = "Time (Months)",
        ylab = "Survival Probability",
        main = "Reconstructed Kaplan-Meier Curves (KEYNOTE-024)"
    )
    legend("topright",
        legend = levels(all_data$arm),
        col = c("red", "blue"),
        lwd = 2,
        bty = "n"
    )
}

dev.off()
cat("Plot saved to:", output_plot, "\n")

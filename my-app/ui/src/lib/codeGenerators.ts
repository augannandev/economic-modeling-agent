/**
 * Code generators for reproducibility tab
 * Generates R and Python code for survival analysis
 */

export interface CodeGeneratorParams {
  distributions: string[];
  arms: string[];
  armLabels: Record<string, string>;
  armData: {
    pembro?: { n: number; events: number; maxTime: number };
    chemo?: { n: number; events: number; maxTime: number };
  };
  modelParams?: Record<string, Record<string, number>>;
}

/**
 * Generate R code for IPD reconstruction using IPDfromKM package
 */
export function generateIPDReconstructionCode(params: CodeGeneratorParams): string {
  const pembroData = params.armData?.pembro || { n: 154, events: 45, maxTime: 18.75 };
  const chemoData = params.armData?.chemo || { n: 151, events: 59, maxTime: 18.5 };

  return `# IPD Reconstruction from Kaplan-Meier Curves
# Using the Guyot et al. (2012) algorithm
# ==========================================

# Install required packages (run once)
# install.packages("IPDfromKM")
# install.packages("survival")
# install.packages("flexsurv")

library(IPDfromKM)
library(survival)

# -----------------------------------------
# Step 1: Load digitized KM data
# -----------------------------------------

# The digitized KM coordinates should be in CSV format:
# time, survival (as proportion 0-1)

# Pembrolizumab arm
pembro_km <- read.csv("pembrolizumab_km_digitized.csv")
# Expected columns: time, survival

# Chemotherapy arm  
chemo_km <- read.csv("chemotherapy_km_digitized.csv")
# Expected columns: time, survival

# -----------------------------------------
# Step 2: Load risk table data
# -----------------------------------------

# Risk table from publication (Number at risk at each timepoint)

# Pembrolizumab risk table
pembro_risk <- data.frame(
  time = c(0, 3, 6, 9, 12, 15, 18),
  nrisk = c(${pembroData.n}, 140, 128, 115, 98, 72, 45)  # Update with actual values
)

# Chemotherapy risk table
chemo_risk <- data.frame(
  time = c(0, 3, 6, 9, 12, 15, 18),
  nrisk = c(${chemoData.n}, 125, 98, 75, 55, 38, 22)  # Update with actual values
)

# -----------------------------------------
# Step 3: Reconstruct IPD
# -----------------------------------------

# Pembrolizumab IPD
pembro_ipd <- getIPD(
  surv_inp = pembro_km,
  nrisk_inp = pembro_risk,
  tot_events = ${pembroData.events}  # Total events from publication
)

# Chemotherapy IPD
chemo_ipd <- getIPD(
  surv_inp = chemo_km,
  nrisk_inp = chemo_risk,
  tot_events = ${chemoData.events}  # Total events from publication
)

# -----------------------------------------
# Step 4: Combine and format IPD
# -----------------------------------------

# Add arm labels
pembro_ipd$arm <- "Pembrolizumab"
chemo_ipd$arm <- "Chemotherapy"

# Combine into single dataset
ipd_combined <- rbind(pembro_ipd, chemo_ipd)

# Summary statistics
cat("\\n=== IPD Summary ===\\n")
cat("Pembrolizumab: N =", nrow(pembro_ipd), 
    ", Events =", sum(pembro_ipd$event), "\\n")
cat("Chemotherapy: N =", nrow(chemo_ipd), 
    ", Events =", sum(chemo_ipd$event), "\\n")

# Save reconstructed IPD
write.csv(ipd_combined, "reconstructed_ipd.csv", row.names = FALSE)

# -----------------------------------------
# Citation
# -----------------------------------------
# Guyot P, Ades AE, Ouwens MJ, Welton NJ. Enhanced secondary analysis of 
# survival data: reconstructing the data from published Kaplan-Meier 
# survival curves. BMC Med Res Methodol. 2012;12:9.`;
}

/**
 * Generate R code for model fitting using flexsurv
 */
export function generateModelFittingCode(params: CodeGeneratorParams): string {
  const distributions = params.distributions.length > 0 
    ? params.distributions 
    : ['exponential', 'weibull', 'lognormal', 'llogis', 'gompertz', 'gengamma'];

  const distMapping: Record<string, string> = {
    'exponential': 'exp',
    'weibull': 'weibull',
    'lognormal': 'lnorm',
    'log-normal': 'lnorm',
    'llogis': 'llogis',
    'log-logistic': 'llogis',
    'gompertz': 'gompertz',
    'gengamma': 'gengamma',
    'generalized-gamma': 'gengamma',
    'gen-gamma': 'gengamma'
  };

  const distList = distributions
    .map(d => distMapping[d.toLowerCase()] || d)
    .filter((v, i, a) => a.indexOf(v) === i); // unique

  return `# Parametric Survival Model Fitting
# Using flexsurv package
# ==========================================

library(flexsurv)
library(survival)

# -----------------------------------------
# Step 1: Load IPD data
# -----------------------------------------

# Load reconstructed IPD (from previous step)
ipd <- read.csv("reconstructed_ipd.csv")

# Split by arm
pembro_data <- subset(ipd, arm == "Pembrolizumab")
chemo_data <- subset(ipd, arm == "Chemotherapy")

# Fix zero times (required for some distributions)
pembro_data$time[pembro_data$time <= 0] <- 0.001
chemo_data$time[chemo_data$time <= 0] <- 0.001

# -----------------------------------------
# Step 2: Fit parametric models
# -----------------------------------------

# Distributions to fit
distributions <- c(${distList.map(d => `"${d}"`).join(', ')})
dist_names <- c(${distList.map(d => {
    const names: Record<string, string> = {
      'exp': 'Exponential',
      'weibull': 'Weibull',
      'lnorm': 'Log-Normal',
      'llogis': 'Log-Logistic',
      'gompertz': 'Gompertz',
      'gengamma': 'Gen-Gamma'
    };
    return `"${names[d] || d}"`;
  }).join(', ')})

# Function to fit all distributions for an arm
fit_all_distributions <- function(data, arm_name) {
  results <- data.frame(
    Distribution = character(),
    AIC = numeric(),
    BIC = numeric(),
    LogLik = numeric(),
    stringsAsFactors = FALSE
  )
  
  fits <- list()
  
  for (i in seq_along(distributions)) {
    dist <- distributions[i]
    name <- dist_names[i]
    
    tryCatch({
      fit <- flexsurvreg(Surv(time, event) ~ 1, data = data, dist = dist)
      fits[[name]] <- fit
      
      results <- rbind(results, data.frame(
        Distribution = name,
        AIC = round(AIC(fit), 2),
        BIC = round(BIC(fit), 2),
        LogLik = round(fit$loglik, 2)
      ))
      
      cat("  Fitted:", name, "- AIC:", round(AIC(fit), 2), "\\n")
    }, error = function(e) {
      cat("  Warning: Could not fit", name, "-", e$message, "\\n")
    })
  }
  
  # Sort by AIC
  results <- results[order(results$AIC), ]
  results$Rank <- 1:nrow(results)
  
  return(list(results = results, fits = fits))
}

# Fit models for Pembrolizumab
cat("\\n=== Fitting Pembrolizumab Models ===\\n")
pembro_fits <- fit_all_distributions(pembro_data, "Pembrolizumab")

# Fit models for Chemotherapy
cat("\\n=== Fitting Chemotherapy Models ===\\n")
chemo_fits <- fit_all_distributions(chemo_data, "Chemotherapy")

# -----------------------------------------
# Step 3: Display results
# -----------------------------------------

cat("\\n=== PEMBROLIZUMAB RESULTS ===\\n")
print(pembro_fits$results, row.names = FALSE)

cat("\\n=== CHEMOTHERAPY RESULTS ===\\n")
print(chemo_fits$results, row.names = FALSE)

# -----------------------------------------
# Step 4: Extract survival predictions
# -----------------------------------------

# Timepoints for prediction (in months)
timepoints <- c(12, 24, 60, 120)  # 1yr, 2yr, 5yr, 10yr

# Get predictions from best model (lowest AIC)
best_pembro <- pembro_fits$fits[[pembro_fits$results$Distribution[1]]]
best_chemo <- chemo_fits$fits[[chemo_fits$results$Distribution[1]]]

cat("\\n=== SURVIVAL EXTRAPOLATION ===\\n")
cat("Best model (Pembrolizumab):", pembro_fits$results$Distribution[1], "\\n")
cat("Best model (Chemotherapy):", chemo_fits$results$Distribution[1], "\\n\\n")

# Pembrolizumab predictions
pembro_surv <- summary(best_pembro, t = timepoints, type = "survival")
cat("Pembrolizumab Survival:\\n")
for (i in seq_along(timepoints)) {
  cat(sprintf("  %d months: %.1f%% (95%% CI: %.1f-%.1f)\\n",
              timepoints[i],
              pembro_surv[[1]]$est[i] * 100,
              pembro_surv[[1]]$lcl[i] * 100,
              pembro_surv[[1]]$ucl[i] * 100))
}

# Chemotherapy predictions
chemo_surv <- summary(best_chemo, t = timepoints, type = "survival")
cat("\\nChemotherapy Survival:\\n")
for (i in seq_along(timepoints)) {
  cat(sprintf("  %d months: %.1f%% (95%% CI: %.1f-%.1f)\\n",
              timepoints[i],
              chemo_surv[[1]]$est[i] * 100,
              chemo_surv[[1]]$lcl[i] * 100,
              chemo_surv[[1]]$ucl[i] * 100))
}

# -----------------------------------------
# Step 5: Save results
# -----------------------------------------

# Save model comparison tables
write.csv(pembro_fits$results, "pembro_model_comparison.csv", row.names = FALSE)
write.csv(chemo_fits$results, "chemo_model_comparison.csv", row.names = FALSE)`;
}

/**
 * Generate R code for plotting
 */
export function generatePlottingCode(_params: CodeGeneratorParams): string {
  void _params; // Parameter kept for API consistency with other generators
  return `# Survival Curve Plotting
# KM curves with parametric model overlays
# ==========================================

library(flexsurv)
library(survival)
library(ggplot2)

# -----------------------------------------
# Step 1: Load data and fit models
# -----------------------------------------

# Assuming models have been fitted (see model_fitting.R)
# pembro_data, chemo_data, pembro_fits, chemo_fits should exist

# -----------------------------------------
# Step 2: Short-term plot (observed period)
# -----------------------------------------

create_short_term_plot <- function(data, fit, arm_name, max_time = NULL) {
  if (is.null(max_time)) {
    max_time <- max(data$time)
  }
  
  # KM curve
  km_fit <- survfit(Surv(time, event) ~ 1, data = data)
  
  # Create plot
  p <- ggplot() +
    # KM curve (step function)
    geom_step(
      data = data.frame(
        time = km_fit$time,
        surv = km_fit$surv
      ),
      aes(x = time, y = surv),
      color = "steelblue",
      size = 1
    ) +
    # 95% CI
    geom_ribbon(
      data = data.frame(
        time = km_fit$time,
        lower = km_fit$lower,
        upper = km_fit$upper
      ),
      aes(x = time, ymin = lower, ymax = upper),
      fill = "steelblue",
      alpha = 0.2
    ) +
    # Parametric model overlay
    stat_function(
      fun = function(t) {
        summary(fit, t = t, type = "survival")[[1]]$est
      },
      color = "red",
      size = 1,
      linetype = "dashed"
    ) +
    # Formatting
    scale_y_continuous(
      labels = scales::percent,
      limits = c(0, 1)
    ) +
    scale_x_continuous(limits = c(0, max_time)) +
    labs(
      title = paste(arm_name, "- Short-term Fit"),
      subtitle = paste("Model:", class(fit)[1]),
      x = "Time (months)",
      y = "Overall Survival"
    ) +
    theme_minimal() +
    theme(
      plot.title = element_text(face = "bold"),
      panel.grid.minor = element_blank()
    )
  
  return(p)
}

# -----------------------------------------
# Step 3: Long-term extrapolation plot
# -----------------------------------------

create_extrapolation_plot <- function(data, fit, arm_name, extrap_time = 120) {
  # KM curve
  km_fit <- survfit(Surv(time, event) ~ 1, data = data)
  max_observed <- max(data$time)
  
  # Time sequence for extrapolation
  t_seq <- seq(0, extrap_time, length.out = 500)
  
  # Get model predictions
  surv_pred <- summary(fit, t = t_seq, type = "survival")[[1]]
  
  # Create plot
  p <- ggplot() +
    # KM curve (observed period)
    geom_step(
      data = data.frame(
        time = km_fit$time,
        surv = km_fit$surv
      ),
      aes(x = time, y = surv),
      color = "steelblue",
      size = 1
    ) +
    # Parametric model (full extrapolation)
    geom_line(
      data = data.frame(
        time = t_seq,
        surv = surv_pred$est,
        lcl = surv_pred$lcl,
        ucl = surv_pred$ucl
      ),
      aes(x = time, y = surv),
      color = "red",
      size = 1
    ) +
    # 95% CI for extrapolation
    geom_ribbon(
      data = data.frame(
        time = t_seq,
        lcl = surv_pred$lcl,
        ucl = surv_pred$ucl
      ),
      aes(x = time, ymin = lcl, ymax = ucl),
      fill = "red",
      alpha = 0.1
    ) +
    # Vertical line at end of observed period
    geom_vline(
      xintercept = max_observed,
      linetype = "dotted",
      color = "gray50"
    ) +
    annotate(
      "text",
      x = max_observed,
      y = 0.95,
      label = "End of\\nobservation",
      hjust = -0.1,
      size = 3,
      color = "gray50"
    ) +
    # Formatting
    scale_y_continuous(
      labels = scales::percent,
      limits = c(0, 1)
    ) +
    scale_x_continuous(
      breaks = seq(0, extrap_time, by = 12),
      limits = c(0, extrap_time)
    ) +
    labs(
      title = paste(arm_name, "- Long-term Extrapolation"),
      subtitle = paste("Model:", class(fit)[1]),
      x = "Time (months)",
      y = "Overall Survival"
    ) +
    theme_minimal() +
    theme(
      plot.title = element_text(face = "bold"),
      panel.grid.minor = element_blank()
    )
  
  return(p)
}

# -----------------------------------------
# Step 4: Generate plots
# -----------------------------------------

# Short-term plots
p1 <- create_short_term_plot(pembro_data, best_pembro, "Pembrolizumab")
p2 <- create_short_term_plot(chemo_data, best_chemo, "Chemotherapy")

# Long-term extrapolation plots (10 years)
p3 <- create_extrapolation_plot(pembro_data, best_pembro, "Pembrolizumab", 120)
p4 <- create_extrapolation_plot(chemo_data, best_chemo, "Chemotherapy", 120)

# Save plots
ggsave("pembro_short_term.png", p1, width = 8, height = 6)
ggsave("chemo_short_term.png", p2, width = 8, height = 6)
ggsave("pembro_extrapolation.png", p3, width = 10, height = 6)
ggsave("chemo_extrapolation.png", p4, width = 10, height = 6)

# Combined panel
library(patchwork)
combined <- (p1 | p2) / (p3 | p4)
ggsave("survival_analysis_plots.png", combined, width = 16, height = 12)

cat("Plots saved successfully!\\n")`;
}


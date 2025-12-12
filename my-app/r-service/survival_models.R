# Survival model fitting functions using R
# This service provides models that may not be available in Python lifelines

library(survival)
library(flexsurv)
library(rstpm2) # For Royston-Parmar splines
library(jsonlite)
library(base64enc) # For base64 encoding of plots

# Try to load IPDfromKM and zoo (for na.locf)
# Initialize flag first to avoid linting warnings
IPDFROMKM_AVAILABLE <- FALSE
tryCatch(
  {
    library(IPDfromKM)
    library(zoo) # For na.locf function
    IPDFROMKM_AVAILABLE <- TRUE
  },
  error = function(e) {
    IPDFROMKM_AVAILABLE <<- FALSE
    cat("Note: IPDfromKM package not available. Install with: devtools::install_github('NaLiuStat/IPDfromKM')\n")
    cat("Error:", e$message, "\n")
  }
)

#* Health check endpoint
#* @get /
#* @serializer json
health_check <- function() {
  list(
    message = "R Survival Analysis Service",
    status = "running",
    models = c("parametric", "gompertz", "rp-spline", "schoenfeld", "refit-and-predict", "reconstruct-ipd", "plot-ipd-reconstruction", "plot-km-from-ipd"),
    distributions = c("exponential", "weibull", "log-normal", "log-logistic", "gompertz", "generalized-gamma")
  )
}

#* Fit Gompertz survival model
#* @post /fit-gompertz
#* @serializer json
fit_gompertz <- function(req) {
  body <- jsonlite::fromJSON(rawToChar(req$body))
  time <- body$time
  event <- body$event

  tryCatch(
    {
      # Create survival object
      surv_obj <- Surv(time = time, event = event) # nolint: object_usage_linter

      # Fit Gompertz model using flexsurv
      fit <- flexsurvreg(surv_obj ~ 1, dist = "gompertz")

      # Extract parameters
      params <- coef(fit)

      # Get AIC/BIC
      aic <- AIC(fit)
      bic <- BIC(fit)
      log_lik <- logLik(fit)[1]

      # Get survival function
      surv_function <- summary(fit, type = "survival", t = seq(0, max(time), length.out = 100))

      result <- list(
        parameters = as.list(params),
        aic = as.numeric(aic),
        bic = as.numeric(bic),
        log_likelihood = as.numeric(log_lik),
        survival_times = surv_function[[1]]$time,
        survival_probs = surv_function[[1]]$est
      )

      return(result)
    },
    error = function(e) {
      return(list(error = e$message))
    }
  )
}

#* Fit any parametric survival model using flexsurv
#* @post /fit-parametric
#* @serializer json
fit_parametric <- function(req) {
  body <- jsonlite::fromJSON(rawToChar(req$body))
  time <- body$time
  event <- body$event
  distribution <- body$distribution

  # Map distribution names to flexsurv names
  dist_map <- list(
    "exponential" = "exp",
    "weibull" = "weibull",
    "log-normal" = "lnorm",
    "lognormal" = "lnorm",
    "log-logistic" = "llogis",
    "loglogistic" = "llogis",
    "gompertz" = "gompertz",
    "generalized-gamma" = "gengamma",
    "gamma" = "gamma"
  )

  flexsurv_dist <- dist_map[[distribution]]
  if (is.null(flexsurv_dist)) {
    return(list(error = paste("Unknown distribution:", distribution)))
  }

  tryCatch(
    {
      surv_obj <- Surv(time = time, event = event) # nolint: object_usage_linter
      fit <- flexsurvreg(surv_obj ~ 1, dist = flexsurv_dist)

      # Extract parameters
      params <- coef(fit)
      aic <- AIC(fit)
      bic <- BIC(fit)
      log_lik <- logLik(fit)[1]

      # Get survival predictions at 60 and 120 months
      pred_60 <- summary(fit, type = "survival", t = 60)[[1]]$est
      pred_120 <- summary(fit, type = "survival", t = 120)[[1]]$est

      result <- list(
        distribution = distribution,
        parameters = as.list(params),
        aic = as.numeric(aic),
        bic = as.numeric(bic),
        log_likelihood = as.numeric(log_lik),
        predictions = list(
          "60" = as.numeric(pred_60),
          "120" = as.numeric(pred_120)
        )
      )

      return(result)
    },
    error = function(e) {
      return(list(error = e$message))
    }
  )
}

#* Fit Royston-Parmar flexible parametric spline model
#* @post /fit-rp-spline
#* @serializer json
fit_rp_spline <- function(req) {
  body <- jsonlite::fromJSON(rawToChar(req$body))
  time <- body$time
  event <- body$event
  scale <- if (is.null(body$scale)) "hazard" else body$scale
  knots <- if (is.null(body$knots)) 2 else body$knots

  tryCatch(
    {
      # Create data frame for fitting to ensure consistent variable names
      df_model <- data.frame(time = time, event = event)

      # Fit Royston-Parmar model using rstpm2
      # rstpm2 provides better implementation than Python's CRCSplineFitter
      if (scale == "hazard") {
        fit <- stpm2(Surv(time, event) ~ 1, data = df_model, df = knots + 1)
      } else if (scale == "odds") {
        fit <- stpm2(Surv(time, event) ~ 1, data = df_model, df = knots + 1, link.type = "odds")
      } else if (scale == "normal") {
        fit <- stpm2(Surv(time, event) ~ 1, data = df_model, df = knots + 1, link.type = "normal")
      } else {
        stop(paste("Unknown scale:", scale))
      }

      # Extract parameters
      params <- coef(fit)

      # Get AIC/BIC
      aic <- AIC(fit)
      bic <- BIC(fit)
      log_lik <- logLik(fit)[1]

      # Get survival function predictions
      times_pred <- seq(0, max(time), length.out = 500)
      surv_pred <- predict(fit, newdata = data.frame(), type = "surv", se.fit = FALSE)

      result <- list(
        parameters = as.list(params),
        aic = as.numeric(aic),
        bic = as.numeric(bic),
        log_likelihood = as.numeric(log_lik),
        survival_times = times_pred,
        survival_probs = as.numeric(surv_pred),
        predictions = list(
          "60" = as.numeric(predict(fit, newdata = data.frame(time = 60), type = "surv")),
          "120" = as.numeric(predict(fit, newdata = data.frame(time = 120), type = "surv"))
        )
      )

      return(result)
    },
    error = function(e) {
      return(list(error = e$message))
    }
  )
}

#* Refit model and generate survival predictions for plotting
#* @post /refit-and-predict
#* @serializer json
refit_and_predict <- function(req) {
  body <- jsonlite::fromJSON(rawToChar(req$body))
  model_type <- body$model_type
  time <- body$time
  event <- body$event
  model_params <- jsonlite::fromJSON(if (is.null(body$model_params)) "{}" else body$model_params)
  prediction_times <- body$prediction_times

  tryCatch(
    {
      surv_obj <- Surv(time = time, event = event) # nolint

      if (model_type == "gompertz") {
        fit <- flexsurvreg(surv_obj ~ 1, dist = "gompertz")
        surv_pred <- summary(fit, type = "survival", t = prediction_times)
        surv_probs <- surv_pred[[1]]$est
      } else if (model_type == "rp-spline") {
        scale <- if (is.null(model_params$scale)) "hazard" else model_params$scale
        knots <- if (is.null(model_params$knots)) 2 else model_params$knots

        if (scale == "hazard") {
          fit <- stpm2(surv_obj ~ 1, df = knots + 1)
        } else if (scale == "odds") {
          fit <- stpm2(surv_obj ~ 1, df = knots + 1, link.type = "odds")
        } else {
          fit <- stpm2(surv_obj ~ 1, df = knots + 1, link.type = "normal")
        }

        surv_pred <- predict(fit, newdata = data.frame(), type = "surv", se.fit = FALSE)
        surv_probs <- as.numeric(surv_pred)
      } else {
        stop(paste("Unknown model type:", model_type))
      }

      result <- list(
        times = prediction_times,
        survival = as.numeric(surv_probs)
      )

      return(result)
    },
    error = function(e) {
      return(list(error = e$message))
    }
  )
}

#* Calculate Schoenfeld Residuals using R's cox.zph
#* @post /schoenfeld-residuals
#* @serializer json
get_schoenfeld_residuals <- function(req) {
  tryCatch(
    {
      # Parse JSON body
      if (is.raw(req$body)) {
        body <- jsonlite::fromJSON(rawToChar(req$body))
      } else if (is.character(req$body)) {
        body <- jsonlite::fromJSON(req$body)
      } else {
        body <- req$body
      }

      time <- body$time
      event <- body$event
      arm <- body$arm # 0/1 or categorical

      # Create data frame
      df <- data.frame(time = time, event = event, arm = arm)

      # Fit Cox model
      cox_fit <- coxph(Surv(time, event) ~ arm, data = df)

      # Calculate Schoenfeld residuals
      zph <- cox.zph(cox_fit)

      # Extract residuals and times
      # zph$y contains the scaled Schoenfeld residuals (matrix with one column per covariate)
      # zph$time contains the actual event times (not transformed)
      # zph$x contains transformed time points (by default, KM transform)
      # zph$table contains the test statistics

      # Get residuals for the 'arm' variable (first and only covariate)
      residuals <- as.numeric(zph$y[, 1])
      # Use actual event times for plotting
      times <- as.numeric(zph$time)

      # Get the p-value from the table
      p_value <- as.numeric(zph$table["arm", "p"])
      chisq <- as.numeric(zph$table["arm", "chisq"])
      df_val <- as.numeric(zph$table["arm", "df"])

      # Calculate smoothed trend and confidence intervals
      # Use loess smoothing similar to plot.cox.zph
      if (length(times) > 3) {
        # Create smooth curve using loess
        loess_fit <- loess(residuals ~ times, span = 0.4)

        # Create prediction grid (use log scale for matching reference)
        time_seq <- seq(min(times), max(times), length.out = 200)
        smooth_pred <- predict(loess_fit, newdata = time_seq, se = TRUE)

        smooth_times <- time_seq
        smooth_values <- as.numeric(smooth_pred$fit)
        smooth_se <- as.numeric(smooth_pred$se.fit)

        # 95% confidence intervals
        ci_lower <- smooth_values - 1.96 * smooth_se
        ci_upper <- smooth_values + 1.96 * smooth_se
      } else {
        # Not enough points for smoothing
        smooth_times <- times
        smooth_values <- residuals
        ci_lower <- residuals
        ci_upper <- residuals
      }

      result <- list(
        residuals = residuals,
        times = times,
        smooth_times = as.numeric(smooth_times),
        smooth_values = as.numeric(smooth_values),
        ci_lower = as.numeric(ci_lower),
        ci_upper = as.numeric(ci_upper),
        p_value = p_value,
        chisq = chisq,
        df = df_val
      )

      return(result)
    },
    error = function(e) {
      # Return detailed error message with stack trace
      error_msg <- paste("Error in get_schoenfeld_residuals:", e$message)
      if (!is.null(e$call)) {
        error_msg <- paste(error_msg, "\nCall:", deparse(e$call))
      }
      return(list(error = error_msg))
    }
  )
}

#* Reconstruct IPD from KM curve using IPDfromKM package (Guyot method)
#* @post /reconstruct-ipd
#* @serializer json
reconstruct_ipd <- function(req) {
  tryCatch(
    {
      if (!IPDFROMKM_AVAILABLE) {
        return(list(error = "IPDfromKM package not available. Install with: devtools::install_github('NaLiuStat/IPDfromKM')"))
      }

      # Parse JSON body
      if (is.raw(req$body)) {
        body <- jsonlite::fromJSON(rawToChar(req$body))
      } else if (is.character(req$body)) {
        body <- jsonlite::fromJSON(req$body)
      } else {
        body <- req$body
      }

      # Extract KM data
      km_times <- body$km_times
      km_survival <- body$km_survival

      # Extract at-risk data (optional)
      atrisk_times <- body$atrisk_times
      atrisk_n <- body$atrisk_n

      # Total number of patients (required)
      total_patients <- body$total_patients

      # IPDfromKM workflow:
      # 1. Create data frame with time and survival columns
      # 2. Use preprocess() to prepare data
      # 3. Use getIPD() to reconstruct IPD

      # Prepare input data frame: preprocess expects 2-column data frame (time, survival)
      input_data <- data.frame(
        time = km_times,
        survival = km_survival
      )

      # Ensure data is sorted by time
      input_data <- input_data[order(input_data$time), ]

      # Ensure survival is non-increasing
      input_data$survival <- cummin(input_data$survival)

      # Prepare at-risk vectors (if provided)
      trisk_vec <- NULL
      nrisk_vec <- NULL
      if (!is.null(atrisk_times) && !is.null(atrisk_n) && length(atrisk_times) > 0) {
        trisk_vec <- atrisk_times
        nrisk_vec <- atrisk_n
      }

      # Step 1: Preprocess data using IPDfromKM::preprocess
      # preprocess expects: dat (2-col data frame: time, survival), trisk (time points), nrisk (numbers), totalpts
      # maxy=1 because survival is in proportion (0-1), not percentage (0-100)
      prep <- IPDfromKM::preprocess(
        dat = input_data,
        trisk = trisk_vec,
        nrisk = nrisk_vec,
        totalpts = total_patients,
        maxy = 1
      )

      # Step 2: Reconstruct IPD using IPDfromKM::getIPD
      # getIPD expects: prep (preprocessed object), armind (arm identifier), tot.events (optional)
      ipd_result <- IPDfromKM::getIPD(
        prep = prep,
        tot.events = NULL # Will be calculated
      )

      # Extract reconstructed IPD
      # getIPD returns a list with an 'IPD' element containing the data frame
      # The IPD data frame has columns: time, status (0=censored, 1=event), arm
      ipd_df <- ipd_result$IPD
      ipd_time <- ipd_df$time
      ipd_event <- ipd_df$status # 1 = event, 0 = censored

      # Return IPD data
      # Note: Plumber serializes single values as lists, so we return single values
      result <- list(
        success = TRUE,
        data = list(
          time = as.numeric(ipd_time),
          event = as.numeric(ipd_event)
        ),
        summary = list(
          n_patients = as.integer(length(ipd_time)),
          n_events = as.integer(sum(ipd_event)),
          n_censored = as.integer(sum(1 - ipd_event))
        )
      )

      return(result)
    },
    error = function(e) {
      error_msg <- paste("Error in reconstruct_ipd:", e$message)
      if (!is.null(e$call)) {
        error_msg <- paste(error_msg, "\nCall:", deparse(e$call))
      }
      return(list(success = FALSE, error = error_msg))
    }
  )
}

#* Plot IPD reconstruction comparison
#* @post /plot-ipd-reconstruction
#* @serializer json
plot_ipd_reconstruction <- function(req) {
  tryCatch(
    {
      # Parse JSON body
      if (is.raw(req$body)) {
        body <- jsonlite::fromJSON(rawToChar(req$body))
      } else if (is.character(req$body)) {
        body <- jsonlite::fromJSON(req$body)
      } else {
        body <- req$body
      }

      # Extract data
      original_times <- body$original_times
      original_survival <- body$original_survival
      ipd_time <- body$ipd_time
      ipd_event <- body$ipd_event
      arm_name <- if (is.null(body$arm_name)) "Arm" else body$arm_name
      endpoint_type <- if (is.null(body$endpoint_type)) "OS" else body$endpoint_type

      # Create survival object from reconstructed IPD
      surv_obj <- Surv(time = ipd_time, event = ipd_event) # nolint

      # Fit Kaplan-Meier curve to reconstructed IPD
      km_fit <- survfit(surv_obj ~ 1)

      # Get survival estimates at original timepoints
      reconstructed_survival <- summary(km_fit, times = original_times)$surv

      # Create comparison plot
      # Save to temporary file
      temp_file <- tempfile(fileext = ".png")
      png(temp_file, width = 10, height = 7, units = "in", res = 300)

      par(mar = c(5, 5, 4, 2) + 0.1)
      plot(
        original_times,
        original_survival,
        type = "s",
        lwd = 2,
        col = "black",
        xlab = "Time (months)",
        ylab = "Survival Probability",
        main = paste0("IPD Reconstruction Validation: ", arm_name, " (", endpoint_type, ")"),
        ylim = c(0, 1),
        xlim = c(0, max(original_times, na.rm = TRUE)),
        cex.lab = 1.2,
        cex.main = 1.3,
        font.lab = 2
      )

      # Add reconstructed KM curve
      lines(
        original_times,
        reconstructed_survival,
        type = "s",
        lwd = 2,
        col = "red",
        lty = 2
      )

      # Add legend
      legend(
        "topright",
        legend = c("Original KM Curve", "Reconstructed KM Curve"),
        col = c("black", "red"),
        lty = c(1, 2),
        lwd = 2,
        cex = 1.1
      )

      # Add grid
      grid(col = "gray90", lty = "dotted")

      dev.off()

      # Read file and convert to base64
      plot_data <- readBin(temp_file, "raw", file.info(temp_file)$size)
      plot_base64 <- base64enc::base64encode(plot_data)

      # Clean up temp file
      unlink(temp_file)

      return(list(
        success = TRUE,
        plot_base64 = plot_base64,
        comparison = list(
          original_times = as.numeric(original_times),
          original_survival = as.numeric(original_survival),
          reconstructed_survival = as.numeric(reconstructed_survival)
        )
      ))
    },
    error = function(e) {
      error_msg <- paste("Error in plot_ipd_reconstruction:", e$message)
      if (!is.null(e$call)) {
        error_msg <- paste(error_msg, "\nCall:", deparse(e$call))
      }
      return(list(success = FALSE, error = error_msg))
    }
  )
}

#* Plot combined KM curves from IPD data (legacy endpoint for chemo/pembro)
#* @post /plot-km-from-ipd
#* @serializer json
plot_km_from_ipd <- function(req) {
  tryCatch(
    {
      # Parse JSON body
      if (is.raw(req$body)) {
        body <- jsonlite::fromJSON(rawToChar(req$body))
      } else if (is.character(req$body)) {
        body <- jsonlite::fromJSON(req$body)
      } else {
        body <- req$body
      }

      # Extract IPD data for both arms
      chemo_time <- body$chemo_time
      chemo_event <- body$chemo_event
      pembro_time <- body$pembro_time
      pembro_event <- body$pembro_event
      endpoint_type <- if (is.null(body$endpoint_type)) "OS" else body$endpoint_type

      # Create combined data frame
      all_data <- data.frame(
        time = c(chemo_time, pembro_time),
        event = c(chemo_event, pembro_event),
        arm = factor(
          c(rep("Chemotherapy", length(chemo_time)), rep("Pembrolizumab", length(pembro_time))),
          levels = c("Chemotherapy", "Pembrolizumab")
        )
      )

      # Fit KM curves
      surv_obj <- Surv(time = all_data$time, event = all_data$event) # nolint
      fit <- survfit(surv_obj ~ arm, data = all_data)

      # Calculate log-rank test p-value
      logrank_test <- survdiff(surv_obj ~ arm, data = all_data)
      p_value <- 1 - pchisq(logrank_test$chisq, length(logrank_test$n) - 1)

      # Create plot
      temp_file <- tempfile(fileext = ".png")
      png(temp_file, width = 10, height = 7, units = "in", res = 300)

      # Try to use survminer for enhanced plots
      has_survminer <- requireNamespace("survminer", quietly = TRUE)

      if (has_survminer) {
        library(survminer)
        # survminer loads ggplot2, so theme_minimal is available
        p <- ggsurvplot(
          fit,
          data = all_data,
          risk.table = TRUE,
          pval = TRUE,
          pval.coord = c(0, 0.1),
          conf.int = TRUE,
          xlab = "Time (Months)",
          ylab = "Overall Survival Probability",
          title = paste0("Kaplan-Meier Curves from Reconstructed IPD (", endpoint_type, ")"),
          palette = c("red", "blue"),
          ggtheme = ggplot2::theme_minimal(), # nolint
          risk.table.height = 0.25,
          fontsize = 4
        )
        print(p)
      } else {
        # Fallback to base R plot
        par(mar = c(5, 5, 4, 2) + 0.1)
        plot(fit,
          col = c("red", "blue"),
          lwd = 2,
          xlab = "Time (Months)",
          ylab = "Survival Probability",
          main = paste0("Kaplan-Meier Curves from Reconstructed IPD (", endpoint_type, ")"),
          cex.lab = 1.2,
          cex.main = 1.3,
          font.lab = 2
        )
        legend("topright",
          legend = levels(all_data$arm),
          col = c("red", "blue"),
          lwd = 2,
          bty = "n",
          cex = 1.1
        )
        # Add p-value text
        text(
          x = max(all_data$time) * 0.7, y = 0.2,
          labels = paste0("Log-rank p = ", format.pval(p_value, digits = 3)),
          cex = 1.0
        )
        grid(col = "gray90", lty = "dotted")
      }

      dev.off()

      # Read file and convert to base64
      plot_data <- readBin(temp_file, "raw", file.info(temp_file)$size)
      plot_base64 <- base64enc::base64encode(plot_data)

      # Clean up temp file
      unlink(temp_file)

      return(list(
        success = TRUE,
        plot_base64 = plot_base64,
        p_value = as.numeric(p_value)
      ))
    },
    error = function(e) {
      error_msg <- paste("Error in plot_km_from_ipd:", e$message)
      if (!is.null(e$call)) {
        error_msg <- paste(error_msg, "\nCall:", deparse(e$call))
      }
      return(list(success = FALSE, error = error_msg))
    }
  )
}

#* Plot combined KM curves from IPD data with dynamic arm names
#* @post /plot-km-dynamic
#* @serializer json
plot_km_dynamic <- function(req) {
  tryCatch(
    {
      # Parse JSON body - use simplifyVector=FALSE to preserve list structure
      if (is.raw(req$body)) {
        body <- jsonlite::fromJSON(rawToChar(req$body), simplifyVector = FALSE)
      } else if (is.character(req$body)) {
        body <- jsonlite::fromJSON(req$body, simplifyVector = FALSE)
      } else {
        body <- req$body
      }

      # Extract parameters
      # arms: list of {name, time, event, color}
      arms_data <- body$arms
      endpoint_type <- if (is.null(body$endpoint_type)) "OS" else body$endpoint_type

      if (is.null(arms_data) || length(arms_data) == 0) {
        return(list(success = FALSE, error = "No arm data provided"))
      }

      # Color palette (fallback if not provided)
      default_colors <- c("#FF7F0E", "#1F77B4", "#2CA02C", "#D62728", "#9467BD",
                          "#8C564B", "#E377C2", "#7F7F7F", "#BCBD22", "#17BECF")

      # Build combined data frame from all arms
      all_times <- c()
      all_events <- c()
      all_arms <- c()
      arm_names <- c()
      arm_colors <- c()

      # Handle both list and data.frame structures from jsonlite
      n_arms <- if (is.data.frame(arms_data)) nrow(arms_data) else length(arms_data)

      for (i in seq_len(n_arms)) {
        # Extract arm data - handle both data.frame and list formats
        if (is.data.frame(arms_data)) {
          arm_name <- arms_data$name[i]
          arm_time <- unlist(arms_data$time[i])
          arm_event <- unlist(arms_data$event[i])
          arm_color <- if (is.null(arms_data$color) || is.na(arms_data$color[i])) {
            default_colors[((i - 1) %% length(default_colors)) + 1]
          } else {
            arms_data$color[i]
          }
        } else {
          arm <- arms_data[[i]]
          arm_name <- arm$name
          arm_time <- unlist(arm$time)
          arm_event <- unlist(arm$event)
          arm_color <- if (is.null(arm$color)) {
            default_colors[((i - 1) %% length(default_colors)) + 1]
          } else {
            arm$color
          }
        }

        all_times <- c(all_times, arm_time)
        all_events <- c(all_events, arm_event)
        all_arms <- c(all_arms, rep(arm_name, length(arm_time)))
        arm_names <- c(arm_names, arm_name)
        arm_colors <- c(arm_colors, arm_color)
      }

      # Create data frame
      all_data <- data.frame(
        time = all_times,
        event = all_events,
        arm = factor(all_arms, levels = arm_names)
      )

      # Fit KM curves
      surv_obj <- Surv(time = all_data$time, event = all_data$event) # nolint
      fit <- survfit(surv_obj ~ arm, data = all_data)

      # Calculate log-rank test p-value (only if 2+ arms)
      p_value <- NA
      if (length(arm_names) >= 2) {
        logrank_test <- survdiff(surv_obj ~ arm, data = all_data)
        p_value <- 1 - pchisq(logrank_test$chisq, length(logrank_test$n) - 1)
      }

      # Create plot
      temp_file <- tempfile(fileext = ".png")
      png(temp_file, width = 10, height = 7, units = "in", res = 300)

      # Try to use survminer for enhanced plots
      has_survminer <- requireNamespace("survminer", quietly = TRUE)

      if (has_survminer) {
        library(survminer)
        p <- ggsurvplot(
          fit,
          data = all_data,
          risk.table = TRUE,
          pval = !is.na(p_value),
          pval.coord = c(0, 0.1),
          conf.int = TRUE,
          xlab = "Time (Months)",
          ylab = "Survival Probability",
          title = paste0("Kaplan-Meier Curves from Reconstructed IPD (", endpoint_type, ")"),
          palette = arm_colors,
          ggtheme = ggplot2::theme_minimal(), # nolint
          risk.table.height = 0.25,
          fontsize = 4
        )
        print(p)
      } else {
        # Fallback to base R plot
        par(mar = c(5, 5, 4, 2) + 0.1)
        plot(fit,
          col = arm_colors,
          lwd = 2,
          xlab = "Time (Months)",
          ylab = "Survival Probability",
          main = paste0("Kaplan-Meier Curves from Reconstructed IPD (", endpoint_type, ")"),
          cex.lab = 1.2,
          cex.main = 1.3,
          font.lab = 2
        )
        legend("topright",
          legend = arm_names,
          col = arm_colors,
          lwd = 2,
          bty = "n",
          cex = 1.1
        )
        if (!is.na(p_value)) {
          text(
            x = max(all_data$time) * 0.7, y = 0.2,
            labels = paste0("Log-rank p = ", format.pval(p_value, digits = 3)),
            cex = 1.0
          )
        }
        grid(col = "gray90", lty = "dotted")
      }

      dev.off()

      # Read file and convert to base64
      plot_data <- readBin(temp_file, "raw", file.info(temp_file)$size)
      plot_base64 <- base64enc::base64encode(plot_data)

      # Clean up temp file
      unlink(temp_file)

      return(list(
        success = TRUE,
        plot_base64 = plot_base64,
        p_value = if (is.na(p_value)) NULL else as.numeric(p_value),
        arms = arm_names
      ))
    },
    error = function(e) {
      error_msg <- paste("Error in plot_km_dynamic:", e$message)
      if (!is.null(e$call)) {
        error_msg <- paste(error_msg, "\nCall:", deparse(e$call))
      }
      return(list(success = FALSE, error = error_msg))
    }
  )
}

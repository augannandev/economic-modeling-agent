# Survival model fitting functions using R
# This service provides models that may not be available in Python lifelines

library(survival)
library(flexsurv)
library(rstpm2)  # For Royston-Parmar splines
library(jsonlite)

#* Health check endpoint
#* @get /
#* @serializer json
health_check <- function() {
  list(
    message = "R Survival Analysis Service",
    status = "running",
    models = c("gompertz", "rp-spline", "schoenfeld", "refit-and-predict")
  )
}

#* Fit Gompertz survival model
#* @post /fit-gompertz
#* @serializer json
fit_gompertz <- function(req) {
  body <- jsonlite::fromJSON(rawToChar(req$body))
  time <- body$time
  event <- body$event
  
  tryCatch({
    # Create survival object
    surv_obj <- Surv(time = time, event = event)
    
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
  }, error = function(e) {
    return(list(error = e$message))
  })
}

#* Fit Royston-Parmar flexible parametric spline model
#* @post /fit-rp-spline
#* @serializer json
fit_rp_spline <- function(req) {
  body <- jsonlite::fromJSON(rawToChar(req$body))
  time <- body$time
  event <- body$event
  scale <- if(is.null(body$scale)) "hazard" else body$scale
  knots <- if(is.null(body$knots)) 2 else body$knots
  
  tryCatch({
    # Create survival object
    surv_obj <- Surv(time = time, event = event)
    
    # Fit Royston-Parmar model using rstpm2
    # rstpm2 provides better implementation than Python's CRCSplineFitter
    if (scale == "hazard") {
      fit <- stpm2(surv_obj ~ 1, df = knots + 1)
    } else if (scale == "odds") {
      fit <- stpm2(surv_obj ~ 1, df = knots + 1, link.type = "odds")
    } else if (scale == "normal") {
      fit <- stpm2(surv_obj ~ 1, df = knots + 1, link.type = "normal")
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
      survival_probs = as.numeric(surv_pred)
    )
    
    return(result)
  }, error = function(e) {
    return(list(error = e$message))
  })
}

#* Refit model and generate survival predictions for plotting
#* @post /refit-and-predict
#* @serializer json
refit_and_predict <- function(req) {
  body <- jsonlite::fromJSON(rawToChar(req$body))
  model_type <- body$model_type
  time <- body$time
  event <- body$event
  model_params <- jsonlite::fromJSON(if(is.null(body$model_params)) "{}" else body$model_params)
  prediction_times <- body$prediction_times
  
  tryCatch({
    surv_obj <- Surv(time = time, event = event)
    
    if (model_type == "gompertz") {
      fit <- flexsurvreg(surv_obj ~ 1, dist = "gompertz")
      surv_pred <- summary(fit, type = "survival", t = prediction_times)
      surv_probs <- surv_pred[[1]]$est
    } else if (model_type == "rp-spline") {
      scale <- if(is.null(model_params$scale)) "hazard" else model_params$scale
      knots <- if(is.null(model_params$knots)) 2 else model_params$knots
      
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
  }, error = function(e) {
    return(list(error = e$message))
  })
}

#* Calculate Schoenfeld Residuals using R's cox.zph
#* @post /schoenfeld-residuals
#* @serializer json
get_schoenfeld_residuals <- function(req) {
  tryCatch({
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
    residuals <- as.numeric(zph$y[,1])
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
  }, error = function(e) {
    # Return detailed error message with stack trace
    error_msg <- paste("Error in get_schoenfeld_residuals:", e$message)
    if (!is.null(e$call)) {
      error_msg <- paste(error_msg, "\nCall:", deparse(e$call))
    }
    return(list(error = error_msg))
  })
}

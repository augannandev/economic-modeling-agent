/**
 * R Service client for survival analysis
 * Provides fallback when Python doesn't have equivalent models
 */

import { getRServiceUrl } from '../lib/env';

const R_SERVICE_URL = getRServiceUrl();

export interface RModelFitResult {
  parameters: Record<string, number>;
  aic: number | null;
  bic: number | null;
  log_likelihood: number | null;
  survival_times?: number[];
  survival_probs?: number[];
  error?: string;
}

export interface RSurvivalPredictions {
  times: number[];
  survival: number[];
  error?: string;
}

/**
 * Fit Gompertz survival model using R (flexsurv)
 */
export async function fitGompertzR(
  time: number[],
  event: number[]
): Promise<RModelFitResult> {
  const response = await fetch(`${R_SERVICE_URL}/fit-gompertz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      time,
      event,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`R service error: ${error}`);
  }

  const result = await response.json();
  
  if (result.error) {
    throw new Error(`R model fitting error: ${result.error}`);
  }

  return result;
}

/**
 * Fit Royston-Parmar spline model using R (rstpm2)
 * R's implementation is more complete than Python's CRCSplineFitter
 */
export async function fitRPSplineR(
  time: number[],
  event: number[],
  scale: 'hazard' | 'odds' | 'normal',
  knots: number
): Promise<RModelFitResult> {
  const response = await fetch(`${R_SERVICE_URL}/fit-rp-spline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      time,
      event,
      scale,
      knots,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`R service error: ${error}`);
  }

  const result = await response.json();
  
  if (result.error) {
    throw new Error(`R model fitting error: ${result.error}`);
  }

  return result;
}

/**
 * Refit model and generate survival predictions for plotting
 */
export async function refitAndPredictR(
  modelType: 'gompertz' | 'rp-spline',
  time: number[],
  event: number[],
  modelParams: Record<string, any>,
  predictionTimes: number[]
): Promise<RSurvivalPredictions> {
  const response = await fetch(`${R_SERVICE_URL}/refit-and-predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_type: modelType,
      time,
      event,
      model_params: JSON.stringify(modelParams),
      prediction_times: JSON.stringify(predictionTimes),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`R service error: ${error}`);
  }

  const result = await response.json();
  
  if (result.error) {
    throw new Error(`R prediction error: ${result.error}`);
  }

  return result;
}

/**
 * Check if R service is available
 */
export async function checkRServiceHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${R_SERVICE_URL}/`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  }
}


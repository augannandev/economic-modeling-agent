import { getPythonServiceUrl } from '../lib/env';

const PYTHON_SERVICE_URL = getPythonServiceUrl();

export interface ParquetData {
  time: number[];
  event: number[];
  arm: string[];
}

export interface KMFitResult {
  times: number[];
  survival: number[];
  confidence_lower: number[];
  confidence_upper: number[];
}

export interface ModelFitResult {
  model_id: string;
  arm: string;
  approach: string;
  distribution?: string;
  scale?: string;
  knots?: number;
  cutpoint?: number;
  parameters: Record<string, number>;
  aic?: number;
  bic?: number;
  log_likelihood: number;
}

export interface PlotResult {
  plot_type: 'short_term' | 'long_term';
  file_path: string;
  base64_data: string;
}

export interface PHTestsResult {
  chow_test_pvalue: number;
  schoenfeld_pvalue: number;
  logrank_pvalue: number;
  diagnostic_plots: Record<string, string>;
  decision: string;
  rationale: string;
  crossing_detected?: boolean;
  crossing_time?: number | null;
}

export interface ChowTestResult {
  cutpoint: number;           // In original time units (months)
  cutpoint_weeks: number;     // In weeks
  lrt_statistic: number;      // Likelihood Ratio Test statistic
  lrt_pvalue: number;         // p-value from chi-squared(1)
  ll_null: number;            // Log-likelihood of one-piece model
  ll_alternative: number;     // Log-likelihood of piecewise model
  n_events_pre: number;       // Events before cutpoint
  n_events_post: number;      // Events after cutpoint
  n_at_risk_pre: number;      // Patients at risk before cutpoint
  n_at_risk_post: number;     // Patients at risk after cutpoint
}

/**
 * Load parquet data files
 */
export async function loadParquetData(chemoPath: string, pembroPath: string): Promise<{
  chemo: ParquetData;
  pembro: ParquetData;
}> {
  const response = await fetch(`${PYTHON_SERVICE_URL}/load-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chemo_path: chemoPath,
      pembro_path: pembroPath,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to load parquet data: ${error}`);
  }

  return response.json();
}

/**
 * Fit Kaplan-Meier curves
 */
export async function fitKMCurves(data: { chemo: ParquetData; pembro: ParquetData }): Promise<{
  chemo: KMFitResult;
  pembro: KMFitResult;
}> {
  const response = await fetch(`${PYTHON_SERVICE_URL}/fit-km`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fit KM curves: ${error}`);
  }

  return response.json();
}

/**
 * Test proportional hazards
 */
export async function testProportionalHazards(data: { chemo: ParquetData; pembro: ParquetData }): Promise<PHTestsResult> {
  const response = await fetch(`${PYTHON_SERVICE_URL}/test-ph`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to test proportional hazards: ${error}`);
  }

  return response.json();
}

/**
 * Fit one-piece parametric model
 */
export async function fitOnePieceModel(
  data: ParquetData,
  arm: string,
  distribution: 'exponential' | 'weibull' | 'log-normal' | 'log-logistic' | 'gompertz' | 'generalized-gamma'
): Promise<ModelFitResult> {
  const response = await fetch(`${PYTHON_SERVICE_URL}/fit-one-piece`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data,
      arm,
      distribution,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fit one-piece model: ${error}`);
  }

  return response.json();
}

/**
 * Detect piecewise cutpoint using Chow test (Likelihood Ratio Test).
 * Returns full statistics for the synthesis agent to analyze.
 */
export async function detectPiecewiseCutpoint(data: ParquetData, arm: string, weeksStart: number = 12, weeksEnd: number = 52): Promise<ChowTestResult> {
  const response = await fetch(`${PYTHON_SERVICE_URL}/detect-cutpoint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data,
      arm,
      weeks_start: weeksStart,
      weeks_end: weeksEnd,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to detect cutpoint: ${error}`);
  }

  return response.json() as Promise<ChowTestResult>;
}

/**
 * Fit piecewise parametric model
 */
export async function fitPiecewiseModel(
  data: ParquetData,
  arm: string,
  distribution: 'exponential' | 'weibull' | 'log-normal' | 'log-logistic' | 'gompertz' | 'generalized-gamma',
  cutpoint: number
): Promise<ModelFitResult> {
  const response = await fetch(`${PYTHON_SERVICE_URL}/fit-piecewise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data,
      arm,
      distribution,
      cutpoint,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fit piecewise model: ${error}`);
  }

  return response.json();
}

/**
 * Fit Royston-Parmar spline model
 */
export async function fitSplineModel(
  data: ParquetData,
  arm: string,
  scale: 'hazard' | 'odds' | 'normal',
  knots: 1 | 2 | 3
): Promise<ModelFitResult> {
  const response = await fetch(`${PYTHON_SERVICE_URL}/fit-spline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data,
      arm,
      scale,
      knots,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fit spline model: ${error}`);
  }

  return response.json();
}

/**
 * Generate dual plots for a model
 */
export async function generateDualPlots(
  modelId: string,
  modelResult: ModelFitResult,
  kmData: KMFitResult,
  originalData?: ParquetData,  // Original time/event data for refitting
  seerData?: any
): Promise<{ short_term: PlotResult; long_term: PlotResult }> {
  const response = await fetch(`${PYTHON_SERVICE_URL}/generate-plots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_id: modelId,
      model_result: modelResult,
      km_data: kmData,
      original_data: originalData,  // Pass original data for actual model refitting
      seer_data: seerData,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to generate plots: ${error}`);
  }

  return response.json();
}

/**
 * Validate against SEER data
 */
export async function validateWithSeer(modelResult: ModelFitResult, seerDataPath?: string): Promise<{
  comparison: Record<string, any>;
  milestones: Record<string, number>;
}> {
  const response = await fetch(`${PYTHON_SERVICE_URL}/validate-seer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_result: modelResult,
      seer_data_path: seerDataPath,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to validate with SEER: ${error}`);
  }

  return response.json();
}


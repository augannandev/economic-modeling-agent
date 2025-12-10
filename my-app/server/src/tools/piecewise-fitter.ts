import { fitPiecewiseModel, detectPiecewiseCutpoint } from '../services/python-service';
import type { ParquetData, ChowTestResult } from '../services/python-service';
import type { Distribution } from './one-piece-fitter';

/**
 * Detect cutpoint for piecewise model using Chow test (Likelihood Ratio Test).
 * Returns full statistics including LRT, p-value, and event counts.
 */
export async function detectCutpointTool(
  data: ParquetData,
  arm: 'chemo' | 'pembro',
  weeksStart: number = 12,
  weeksEnd: number = 52
): Promise<ChowTestResult> {
  return await detectPiecewiseCutpoint(data, arm, weeksStart, weeksEnd);
}

/**
 * Fit piecewise parametric model
 */
export async function fitPiecewiseModelTool(
  data: ParquetData,
  arm: 'chemo' | 'pembro',
  distribution: Distribution,
  cutpoint: number
) {
  return await fitPiecewiseModel(data, arm, distribution, cutpoint);
}


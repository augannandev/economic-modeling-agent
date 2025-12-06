import { fitPiecewiseModel, detectPiecewiseCutpoint } from '../services/python-service';
import type { ParquetData } from '../services/python-service';
import type { Distribution } from './one-piece-fitter';

/**
 * Detect cutpoint for piecewise model
 */
export async function detectCutpointTool(
  data: ParquetData,
  arm: 'chemo' | 'pembro',
  weeksStart: number = 12,
  weeksEnd: number = 52
): Promise<number> {
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


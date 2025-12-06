import { fitOnePieceModel } from '../services/python-service';
import type { ParquetData } from '../services/python-service';

export type Distribution = 'exponential' | 'weibull' | 'log-normal' | 'log-logistic' | 'gompertz' | 'generalized-gamma';

/**
 * Fit one-piece parametric model
 */
export async function fitOnePieceModelTool(
  data: ParquetData,
  arm: 'chemo' | 'pembro',
  distribution: Distribution
) {
  return await fitOnePieceModel(data, arm, distribution);
}


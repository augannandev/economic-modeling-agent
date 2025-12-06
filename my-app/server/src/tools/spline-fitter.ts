import { fitSplineModel } from '../services/python-service';
import type { ParquetData } from '../services/python-service';

/**
 * Fit Royston-Parmar spline model
 */
export async function fitSplineModelTool(
  data: ParquetData,
  arm: 'chemo' | 'pembro',
  scale: 'hazard' | 'odds' | 'normal',
  knots: 1 | 2 | 3
) {
  return await fitSplineModel(data, arm, scale, knots);
}


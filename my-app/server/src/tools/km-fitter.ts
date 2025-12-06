import { fitKMCurves } from '../services/python-service';
import type { ParquetData } from '../services/python-service';

/**
 * Fit Kaplan-Meier curves for both arms
 */
export async function fitKMCurvesTool(data: {
  chemo: ParquetData;
  pembro: ParquetData;
}) {
  return await fitKMCurves(data);
}


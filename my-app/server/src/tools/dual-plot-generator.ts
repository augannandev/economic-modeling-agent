import { generateDualPlots } from '../services/python-service';
import type { ModelFitResult, KMFitResult, ParquetData } from '../services/python-service';

/**
 * Generate dual plots (short-term and long-term) for a model
 */
export async function generateDualPlotsTool(
  modelId: string,
  modelResult: ModelFitResult,
  kmData: KMFitResult,
  originalData?: ParquetData,  // Original time/event data for actual model refitting
  seerData?: any
) {
  return await generateDualPlots(modelId, modelResult, kmData, originalData, seerData);
}


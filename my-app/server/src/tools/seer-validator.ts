import { validateWithSeer } from '../services/python-service';
import type { ModelFitResult } from '../services/python-service';
import { getSeerDataPath } from '../lib/env';

/**
 * Validate model against SEER benchmark data
 */
export async function validateWithSeerTool(modelResult: ModelFitResult) {
  const seerDataPath = getSeerDataPath();
  return await validateWithSeer(modelResult, seerDataPath);
}


import { testProportionalHazards, fitKMCurves } from '../services/python-service';
import type { ParquetData, PHTestsResult } from '../services/python-service';

/**
 * Test proportional hazards assumption
 */
export async function testProportionalHazardsTool(data: {
  chemo: ParquetData;
  pembro: ParquetData;
}): Promise<PHTestsResult & { km_curves: any }> {
  // First fit KM curves
  const kmCurves = await fitKMCurves(data);
  
  // Then test proportional hazards
  const phTests = await testProportionalHazards(data);
  
  return {
    ...phTests,
    km_curves: kmCurves,
  };
}


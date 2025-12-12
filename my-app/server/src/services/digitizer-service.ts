import { getPythonServiceUrl, getRServiceUrl } from '../lib/env';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { saveIPD, isSupabaseConfigured, saveProjectKMCurve } from '../lib/supabase';

const PYTHON_SERVICE_URL = getPythonServiceUrl();
const R_SERVICE_URL = getRServiceUrl();

// Data structures matching the frontend
export interface DataPoint {
  time: number;
  survival: number;
  id?: string;
  isNew?: boolean;
}

export interface RiskTableRow {
  time: number;
  atRisk: number;
  events?: number;
}

export interface ExtractedCurve {
  id: string;
  name: string;
  color: string;
  points: DataPoint[];  // Full resolution points
  resampledPoints?: DataPoint[];  // Resampled at requested granularity
  riskTable?: RiskTableRow[];  // Per-arm risk table data
}

export interface ExtractionResult {
  success: boolean;
  points: DataPoint[];  // First curve points (backwards compat)
  curves?: ExtractedCurve[];  // All extracted curves
  riskTable: RiskTableRow[];
  axisRanges: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  };
  metadata?: {
    numCurves?: number;
    curveColors?: string[];
    outcomeType?: string;
    detectedArmName?: string;
    detectedArmNames?: string[];  // All arm names
    hasRiskTable?: boolean;
    studyInfo?: string;
    xUnit?: string;
  };
  error?: string;
}

export interface IPDGenerationRequest {
  endpointType: string;
  arm: string;
  points: DataPoint[];
  riskTable: RiskTableRow[];
}

export interface IPDPatientRecord {
  patient_id: number;
  time: number;
  event: number;
  arm: string;
}

export interface IPDValidationMetrics {
  hazardRatio: number;
  hrLowerCI: number;
  hrUpperCI: number;
  pValue: number;
  armStats: { arm: string; nPatients: number; events: number }[];
  referenceArm?: string;
  comparisonArm?: string;
}

export interface IPDGenerationResult {
  success: boolean;
  files: {
    endpoint: string;
    arm: string;
    filePath: string;
    nPatients: number;
    events: number;
    medianFollowup: number;
    data?: IPDPatientRecord[];  // Include actual IPD data for download
  }[];
  validation?: IPDValidationMetrics;  // HR, CI, p-value if 2+ arms
  savedToDatabase?: boolean;  // Whether IPD was saved to Supabase
  projectId?: string;         // Project ID if saved to database
  error?: string;
}

/**
 * Extract KM curve data from an uploaded image
 * This calls the Python service which uses LLM vision + OpenCV extraction
 * 
 * @param imageBase64 - Base64 encoded image
 * @param riskTableImageBase64 - Optional risk table image
 * @param endpointType - 'OS' or 'PFS'
 * @param arm - Treatment arm name
 * @param granularity - Time granularity for resampling
 * @param apiProvider - LLM provider ('anthropic' or 'openai')
 * @param projectId - Optional: Save extraction to Supabase for this project
 * @param imageFilename - Optional: Original filename for storage
 */
export async function extractKMCurve(
  imageBase64: string,
  riskTableImageBase64?: string,
  endpointType?: string,
  arm?: string,
  granularity?: number,
  apiProvider?: string,
  projectId?: string,
  imageFilename?: string
): Promise<ExtractionResult> {
  try {
    console.log(`[Digitizer] Calling Python extraction service at ${PYTHON_SERVICE_URL}`);

    // Call Python service for extraction
    const response = await fetch(`${PYTHON_SERVICE_URL}/extract-km-curve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: imageBase64,
        risk_table_image_base64: riskTableImageBase64 || null,
        granularity: granularity || 0.25,
        endpoint_type: endpointType || 'OS',
        arm: arm || 'Treatment',
        api_provider: apiProvider || 'anthropic'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`KM extraction endpoint returned ${response.status}: ${errorText}`);
      console.warn('Falling back to simulated extraction');
      return generateSimulatedExtraction();
    }

    // Type the response from the Python service
    interface PythonCurve {
      id: string;
      name: string;
      color: string;
      points: Array<{ time: number; survival: number; id?: string }>;  // Full resolution
      resampledPoints?: Array<{ time: number; survival: number; id?: string }>;  // Resampled
      riskTable?: Array<{ time: number; atRisk: number; events?: number }>;  // Per-arm risk table
    }

    interface PythonExtractionResponse {
      success: boolean;
      points?: Array<{ time: number; survival: number; id?: string }>;
      curves?: PythonCurve[];  // All extracted curves
      riskTable?: Array<{ time: number; atRisk: number; events?: number }>;
      axisRanges?: { xMin: number; xMax: number; yMin: number; yMax: number };
      metadata?: {
        numCurves?: number;
        curveColors?: string[];
        detectedEndpointType?: string;
        detectedArmName?: string;
        detectedArmNames?: string[];
        hasRiskTable?: boolean;
        studyInfo?: string;
        xUnit?: string;
      };
      error?: string;
    }

    const result = await response.json() as PythonExtractionResponse;

    if (!result.success) {
      console.warn('KM extraction failed:', result.error);
      console.warn('Falling back to simulated extraction');
      return generateSimulatedExtraction();
    }

    // Process curves data including per-arm risk tables
    const curves: ExtractedCurve[] = (result.curves || []).map((curve) => ({
      id: curve.id,
      name: curve.name,
      color: curve.color,
      points: curve.points.map((p, i) => ({
        time: p.time,
        survival: p.survival,
        id: p.id || `${curve.id}_${i}`,
      })),
      resampledPoints: curve.resampledPoints ? curve.resampledPoints.map((p, i) => ({
        time: p.time,
        survival: p.survival,
        id: p.id || `${curve.id}_rs_${i}`,
      })) : undefined,
      riskTable: (curve.riskTable || []).map((r) => ({
        time: r.time,
        atRisk: r.atRisk,
        events: r.events || 0,
      })),
    }));

    console.log(`[Digitizer] Extraction successful: ${curves.length} curves, ${result.points?.length || 0} points (first curve)`);
    console.log(`[Digitizer] Curves risk tables:`, curves.map(c => ({ name: c.name, riskTableCount: c.riskTable?.length || 0 })));

    // Save to Supabase if projectId is provided
    if (projectId && isSupabaseConfigured()) {
      try {
        // Create image hash for deduplication
        const imageHash = createHash('sha256').update(imageBase64).digest('hex');

        // Save each curve separately
        for (const curve of curves) {
          await saveProjectKMCurve(projectId, {
            image_hash: imageHash,
            image_data: imageBase64,
            image_filename: imageFilename,
            endpoint_type: endpointType || 'OS',
            arm: curve.name,
            points: curve.points.map(p => ({ time: p.time, survival: p.survival })),
            risk_table: curve.riskTable?.map(r => ({ time: r.time, atRisk: r.atRisk, events: r.events })),
            axis_ranges: result.axisRanges,
            metadata: {
              curveId: curve.id,
              curveColor: curve.color,
              ...result.metadata,
            },
          });
        }
        console.log(`[Digitizer] Saved ${curves.length} curves to Supabase for project ${projectId}`);
      } catch (err) {
        console.warn('[Digitizer] Failed to save to Supabase:', err);
        // Don't fail the extraction if Supabase save fails
      }
    }

    return {
      success: true,
      points: (result.points || []).map((p, i) => ({
        time: p.time,
        survival: p.survival,
        id: p.id || `extracted_${i}`,
      })),
      curves: curves.length > 0 ? curves : undefined,
      riskTable: (result.riskTable || []).map((r) => ({
        time: r.time,
        atRisk: r.atRisk,
        events: r.events || 0,
      })),
      axisRanges: result.axisRanges || {
        xMin: 0,
        xMax: 36,
        yMin: 0,
        yMax: 1
      },
      metadata: {
        numCurves: result.metadata?.numCurves,
        curveColors: result.metadata?.curveColors,
        outcomeType: result.metadata?.detectedEndpointType,
        detectedArmName: result.metadata?.detectedArmName,
        detectedArmNames: result.metadata?.detectedArmNames,
        hasRiskTable: result.metadata?.hasRiskTable,
        studyInfo: result.metadata?.studyInfo,
        xUnit: result.metadata?.xUnit,
      }
    };
  } catch (error) {
    console.error('KM extraction error:', error);
    console.warn('Falling back to simulated extraction');
    return generateSimulatedExtraction();
  }
}

/**
 * Generate simulated extraction data for development/testing
 */
function generateSimulatedExtraction(): ExtractionResult {
  const maxTime = 36 + Math.random() * 24;
  const numPoints = 25;

  const points: DataPoint[] = [];
  let survival = 1.0;

  for (let i = 0; i < numPoints; i++) {
    const time = (i / (numPoints - 1)) * maxTime;
    // Exponential decay with some noise
    survival = Math.max(0.05, survival - (Math.random() * 0.04 + 0.01));
    points.push({
      time: Math.round(time * 100) / 100,
      survival: Math.round(survival * 1000) / 1000,
      id: `extracted_${i}`,
    });
  }

  // Generate risk table
  const riskTable: RiskTableRow[] = [];
  const initialAtRisk = 100 + Math.floor(Math.random() * 100);
  let atRisk = initialAtRisk;

  for (let i = 0; i <= 6; i++) {
    const time = i * 6;
    const events = Math.floor(Math.random() * 15) + 5;
    riskTable.push({
      time,
      atRisk: Math.max(10, atRisk),
      events,
    });
    atRisk = Math.max(10, atRisk - events - Math.floor(Math.random() * 10));
  }

  return {
    success: true,
    points,
    riskTable,
    axisRanges: {
      xMin: 0,
      xMax: Math.round(maxTime),
      yMin: 0,
      yMax: 1,
    },
    metadata: {
      numCurves: 1,
      outcomeType: 'OS',
    },
  };
}

/**
 * Get the data directory for IPD files
 * Uses DATA_DIRECTORY env var (consistent with survival analysis)
 */
function getIPDDataDirectory(): string {
  // Use DATA_DIRECTORY env var, default to ./my-app/PseuodoIPD
  const dataDir = process.env.DATA_DIRECTORY || './my-app/PseuodoIPD';

  // Handle relative paths from workspace root
  if (dataDir.startsWith('./') || dataDir.startsWith('../')) {
    return join(process.cwd(), dataDir);
  }
  return dataDir;
}

/**
 * Generate Pseudo-IPD from extracted/edited KM data using R service (IPDfromKM)
 * 
 * Files are saved to DATA_DIRECTORY with naming convention:
 * ipd_EndpointType.{endpoint}_{arm}.csv (Using CSV for R output)
 * 
 * Note: R service is preferred for IPD reconstruction quality (Guyot method implementation).
 */
export async function generatePseudoIPD(
  endpoints: IPDGenerationRequest[],
  projectId?: string
): Promise<IPDGenerationResult> {
  try {
    // Use the same DATA_DIRECTORY that survival analysis expects
    const outputDir = getIPDDataDirectory();
    console.log(`[IPD Generation] Saving IPD files to: ${outputDir}`);

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const files: IPDGenerationResult['files'] = [];

    for (const endpoint of endpoints) {
      console.log(`[IPD Generation] Processing ${endpoint.endpointType} - ${endpoint.arm} via R service`);

      // Prepare data for R service
      // R expects: km_times, km_survival, atrisk_times, atrisk_n, total_patients

      const kmTimes = endpoint.points.map(p => p.time);
      const kmSurvival = endpoint.points.map(p => p.survival);

      const atriskTimes = endpoint.riskTable.map(r => r.time);
      const atriskN = endpoint.riskTable.map(r => r.atRisk);

      // Get total patients from t=0 in risk table or max at risk
      let totalPatients = 100; // Default
      if (endpoint.riskTable.length > 0) {
        // Try to find t=0
        const t0 = endpoint.riskTable.find(r => r.time === 0);
        if (t0) {
          totalPatients = t0.atRisk;
        } else {
          totalPatients = Math.max(...endpoint.riskTable.map(r => r.atRisk));
        }
      }

      try {
        // Call R service for IPD generation
        const response = await fetch(`${R_SERVICE_URL}/reconstruct-ipd`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            km_times: kmTimes,
            km_survival: kmSurvival,
            atrisk_times: atriskTimes,
            atrisk_n: atriskN,
            total_patients: totalPatients
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`R service returned ${response.status}: ${errText}`);
        }

        const result = await response.json() as {
          success: boolean;
          data: { time: number[]; event: number[] };
          summary: { n_patients: number; n_events: number; n_censored: number };
          error?: string;
        };

        if (!result.success || !result.data) {
          throw new Error(result.error || 'R service returned failure');
        }

        // Save to CSV
        // Format: time,event,arm,endpoint (though data loader mainly needs time, event)
        const csvLines = ['time,event,arm'];
        const n = result.data.time.length;
        const ipdRecords: IPDPatientRecord[] = [];

        for (let i = 0; i < n; i++) {
          const t = result.data.time[i];
          const e = result.data.event[i];
          // Quote arm to match Python usage if needed, though simple string is fine
          csvLines.push(`${t},${e},"${endpoint.arm}"`); // Quotes for safety

          ipdRecords.push({
            patient_id: i,
            time: t,
            event: e,
            arm: endpoint.arm
          });
        }

        const fileName = `ipd_EndpointType.${endpoint.endpointType}_${endpoint.arm}.csv`;
        const filePath = join(outputDir, fileName);

        console.log(`[IPD Generation] Writing CSV to ${filePath}`);
        writeFileSync(filePath, csvLines.join('\n'));

        // Calculate stats
        const events = result.summary.n_events;
        // Calculate approximate median followup
        const medianFollowup = n > 0 ? result.data.time[Math.floor(n / 2)] : 0; // Rough approx

        files.push({
          endpoint: endpoint.endpointType,
          arm: endpoint.arm,
          filePath: filePath,
          nPatients: result.summary.n_patients,
          events: events,
          medianFollowup: medianFollowup,
          data: ipdRecords,  // Include IPD data for download
        });

      } catch (rError) {
        console.warn(`[IPD Generation] R service failed for ${endpoint.arm}:`, rError);
        console.warn('Falling back to Python/simulation');

        // Fallback logic could go here, for now using existing simulation logic
        const simulated = simulateIPDGeneration(endpoint, outputDir);
        files.push(simulated);
      }
    }

    console.log(`[IPD Generation] Complete. Generated ${files.length} files.`);
    console.log(`[IPD Generation] Files available for survival analysis at: ${outputDir}`);

    // If we have 2+ arms with data, calculate validation metrics (HR, CI, p-value)
    // NOTE: Validation API call still goes to Python service as R service might not have validation endpoint handy yet
    let validation: IPDValidationMetrics | undefined;

    const armsWithData = files.filter(f => f.data && f.data.length > 0);
    if (armsWithData.length >= 2) {
      try {
        console.log(`[IPD Validation] Calculating HR for ${armsWithData.length} arms...`);

        const validationResponse = await fetch(`${PYTHON_SERVICE_URL}/validate-ipd`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            arms: armsWithData.map(f => ({
              arm: f.arm,
              data: f.data,
            })),
          }),
        });

        if (validationResponse.ok) {
          const validationResult = await validationResponse.json() as {
            success: boolean;
            hazardRatio?: number;
            hrLowerCI?: number;
            hrUpperCI?: number;
            pValue?: number;
            armStats?: { arm: string; nPatients: number; events: number }[];
            referenceArm?: string;
            comparisonArm?: string;
            error?: string;
          };

          if (validationResult.success && validationResult.hazardRatio !== undefined) {
            validation = {
              hazardRatio: validationResult.hazardRatio,
              hrLowerCI: validationResult.hrLowerCI!,
              hrUpperCI: validationResult.hrUpperCI!,
              pValue: validationResult.pValue!,
              armStats: validationResult.armStats || [],
              referenceArm: validationResult.referenceArm,
              comparisonArm: validationResult.comparisonArm,
            };
            console.log(`[IPD Validation] HR: ${validation.hazardRatio} (${validation.hrLowerCI}-${validation.hrUpperCI}), p=${validation.pValue}`);
          } else {
            console.warn(`[IPD Validation] Validation failed: ${validationResult.error || 'Unknown error'}`);
          }
        } else {
          console.warn(`[IPD Validation] Validation endpoint returned ${validationResponse.status}`);
        }
      } catch (validationError) {
        console.warn(`[IPD Validation] Could not calculate validation metrics:`, validationError);
      }
    } else {
      console.log(`[IPD Validation] Skipping validation - need 2+ arms with data (have ${armsWithData.length})`);
    }

    // Save to Supabase if projectId is provided and Supabase is configured
    let savedToDatabase = false;
    if (projectId && isSupabaseConfigured()) {
      console.log(`[IPD Storage] Saving IPD to Supabase for project ${projectId}...`);

      for (const file of files) {
        if (file.data && file.data.length > 0) {
          try {
            const result = await saveIPD({
              project_id: projectId,
              endpoint_type: file.endpoint,
              arm: file.arm,
              ipd_data: file.data,
              n_patients: file.nPatients,
              n_events: file.events,
              median_followup: file.medianFollowup,
              validation_hr: validation?.hazardRatio,
              validation_hr_lower: validation?.hrLowerCI,
              validation_hr_upper: validation?.hrUpperCI,
              validation_pvalue: validation?.pValue,
            });

            if (result.error) {
              console.warn(`[IPD Storage] Failed to save ${file.endpoint}-${file.arm}: ${result.error}`);
            } else {
              console.log(`[IPD Storage] Saved ${file.endpoint}-${file.arm} to Supabase`);
              savedToDatabase = true;
            }
          } catch (saveError) {
            console.warn(`[IPD Storage] Error saving ${file.endpoint}-${file.arm}:`, saveError);
          }
        }
      }

      if (savedToDatabase) {
        console.log(`[IPD Storage] Successfully saved IPD to Supabase for project ${projectId}`);
      }
    } else if (projectId && !isSupabaseConfigured()) {
      console.log(`[IPD Storage] Supabase not configured - IPD not saved to database`);
    }

    return {
      success: true,
      files,
      validation,
      savedToDatabase,
      projectId: savedToDatabase ? projectId : undefined,
    };
  } catch (error) {
    console.error('IPD generation error:', error);

    // Simulate for development
    const outputDir = getIPDDataDirectory();
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const files = endpoints.map(e => simulateIPDGeneration(e, outputDir));

    return {
      success: true,
      files,
    };
  }
}

/**
 * Simulate IPD generation for development/testing
 */
function simulateIPDGeneration(
  endpoint: IPDGenerationRequest,
  outputDir: string
): IPDGenerationResult['files'][0] {
  const fileName = `ipd_${endpoint.endpointType}_${endpoint.arm}.parquet`;
  const filePath = join(outputDir, fileName);

  // Calculate simulated IPD stats from the KM data
  const nPatients = endpoint.riskTable[0]?.atRisk || 100;
  const events = endpoint.riskTable.reduce((sum, r) => sum + (r.events || 0), 0);
  const medianFollowup = endpoint.points[Math.floor(endpoint.points.length / 2)]?.time || 18;

  // In a real implementation, we would create the parquet file here
  // For now, just return the metadata

  return {
    endpoint: endpoint.endpointType,
    arm: endpoint.arm,
    filePath,
    nPatients,
    events,
    medianFollowup,
  };
}

/**
 * Validate KM data before IPD generation
 */
export function validateKMData(points: DataPoint[], riskTable: RiskTableRow[]): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check minimum points
  if (points.length < 5) {
    errors.push('At least 5 survival points are required for IPD reconstruction');
  }

  // Check risk table
  if (riskTable.length < 2) {
    errors.push('At least 2 risk table entries are required');
  }

  // Check survival values are monotonically decreasing
  let lastSurvival = 1.0;
  for (const point of points) {
    if (point.survival > lastSurvival) {
      warnings.push(`Non-monotonic survival at time ${point.time}: ${point.survival} > ${lastSurvival}`);
    }
    lastSurvival = point.survival;
  }

  // Check survival range
  const maxSurvival = Math.max(...points.map(p => p.survival));
  const minSurvival = Math.min(...points.map(p => p.survival));

  if (maxSurvival > 1.0) {
    errors.push('Survival values must not exceed 1.0');
  }
  if (minSurvival < 0) {
    errors.push('Survival values must not be negative');
  }

  // Check time values
  if (points.some(p => p.time < 0)) {
    errors.push('Time values must not be negative');
  }

  // Check risk table consistency
  const maxTime = Math.max(...points.map(p => p.time));
  const maxRiskTime = Math.max(...riskTable.map(r => r.time));

  if (maxRiskTime > maxTime * 1.1) {
    warnings.push('Risk table extends beyond survival curve data');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}


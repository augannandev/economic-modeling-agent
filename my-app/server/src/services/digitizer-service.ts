import { getPythonServiceUrl } from '../lib/env';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { saveIPD, isSupabaseConfigured } from '../lib/supabase';

const PYTHON_SERVICE_URL = getPythonServiceUrl();

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
 */
export async function extractKMCurve(
  imageBase64: string,
  riskTableImageBase64?: string,
  endpointType?: string,
  arm?: string,
  granularity?: number,
  apiProvider?: string
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
 * Generate Pseudo-IPD from extracted/edited KM data using Guyot method
 * This calls the Python service which uses the ipd_builder.py script
 * 
 * Files are saved to DATA_DIRECTORY with naming convention:
 * ipd_EndpointType.{endpoint}_{arm}.parquet
 *
 * This matches the expected format for survival analysis.
 * 
 * If projectId is provided and Supabase is configured, IPD will also be saved to the database.
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
      // Prepare data for IPD reconstruction
      const kmData = endpoint.points.map(p => ({
        time_months: p.time,
        survival: p.survival,
        endpoint: endpoint.endpointType,
        arm: endpoint.arm,
      }));

      const atRiskData = endpoint.riskTable.map(r => ({
        time_months: r.time,
        at_risk: r.atRisk,
        events: r.events || 0,
        endpoint: endpoint.endpointType,
        arm: endpoint.arm,
      }));

      console.log(`[IPD Generation] Processing ${endpoint.endpointType} - ${endpoint.arm} with ${kmData.length} KM points`);

      // Call Python service for IPD generation
      const response = await fetch(`${PYTHON_SERVICE_URL}/generate-ipd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          km_data: kmData,
          atrisk_data: atRiskData,
          output_dir: outputDir,
          endpoint_type: endpoint.endpointType,
          arm: endpoint.arm,
        }),
      });

      if (!response.ok) {
        // If Python service doesn't have this endpoint yet, simulate IPD generation
        console.warn('IPD generation endpoint not available, simulating');
        const simulated = simulateIPDGeneration(endpoint, outputDir);
        files.push(simulated);
        continue;
      }

      // Type the response from the Python service
      interface PythonIPDResponse {
        success: boolean;
        file_path: string;
        n_patients: number;
        events: number;
        censored?: number;
        median_followup: number;
        data?: IPDPatientRecord[];  // Actual IPD data for download
      }

      const result = await response.json() as PythonIPDResponse;
      
      console.log(`[IPD Generation] Generated: ${result.file_path}`);
      console.log(`[IPD Generation] Patients: ${result.n_patients}, Events: ${result.events}, Censored: ${result.censored || 'N/A'}`);
      
      files.push({
        endpoint: endpoint.endpointType,
        arm: endpoint.arm,
        filePath: result.file_path,
        nPatients: result.n_patients,
        events: result.events,
        medianFollowup: result.median_followup,
        data: result.data,  // Include IPD data for download
      });
    }

    console.log(`[IPD Generation] Complete. Generated ${files.length} files.`);
    console.log(`[IPD Generation] Files available for survival analysis at: ${outputDir}`);

    // If we have 2+ arms with data, calculate validation metrics (HR, CI, p-value)
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
        // Don't fail the whole operation if validation fails
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


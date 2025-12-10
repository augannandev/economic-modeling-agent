import { getAuthHeaders } from './serverComm';

// API URL from environment variable (set in .env.production for builds)
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5500';

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

export interface ExtractionMetadata {
  numCurves?: number;
  curveColors?: string[];
  outcomeType?: string;
  detectedArmName?: string;  // First arm name (for backwards compatibility)
  detectedArmNames?: string[];  // All detected arm names from legend
  hasRiskTable?: boolean;
  studyInfo?: string;
  xUnit?: string;
}

export interface ExtractedCurve {
  id: string;
  name: string;  // Detected name from legend
  color: string;
  points: DataPoint[];  // Full resolution points
  resampledPoints?: DataPoint[];  // Resampled at requested granularity
  riskTable?: RiskTableRow[];  // Per-arm risk table data
}

export interface ExtractionResult {
  success: boolean;
  points: DataPoint[];  // First curve's points (backwards compatible)
  allPoints?: (DataPoint & { curve?: string; curveIndex?: number })[];  // All points with curve info
  curves?: ExtractedCurve[];  // All curves structured
  riskTable: RiskTableRow[];
  axisRanges: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  };
  metadata?: ExtractionMetadata;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
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
  error?: string;
}

/**
 * Convert a File to base64 string
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

export interface ExtractKMCurveOptions {
  kmPlotFile: File;
  riskTableFile?: File;
  endpointType?: string;
  arm?: string;
  granularity?: number;
  apiProvider?: 'anthropic' | 'openai';
}

/**
 * Extract KM curve data from an uploaded image
 * Uses LLM vision analysis + computer vision extraction
 */
export async function extractKMCurve(options: ExtractKMCurveOptions): Promise<ExtractionResult>;
export async function extractKMCurve(
  kmPlotFile: File,
  riskTableFile?: File,
  endpointType?: string,
  arm?: string,
  granularity?: number,
  apiProvider?: 'anthropic' | 'openai'
): Promise<ExtractionResult>;
export async function extractKMCurve(
  optionsOrFile: ExtractKMCurveOptions | File,
  riskTableFile?: File,
  endpointType?: string,
  arm?: string,
  granularity?: number,
  apiProvider?: 'anthropic' | 'openai'
): Promise<ExtractionResult> {
  // Handle both call signatures
  let options: ExtractKMCurveOptions;
  if (optionsOrFile instanceof File) {
    options = {
      kmPlotFile: optionsOrFile,
      riskTableFile,
      endpointType,
      arm,
      granularity,
      apiProvider
    };
  } else {
    options = optionsOrFile;
  }

  try {
    const imageBase64 = await fileToBase64(options.kmPlotFile);
    const riskTableImageBase64 = options.riskTableFile 
      ? await fileToBase64(options.riskTableFile) 
      : undefined;

    console.log(`[DigitizerAPI] Extracting KM curve - endpoint: ${options.endpointType}, arm: ${options.arm}, granularity: ${options.granularity}`);

    const response = await fetch(`${API_BASE}/api/v1/digitizer/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        imageBase64,
        riskTableImageBase64,
        endpointType: options.endpointType,
        arm: options.arm,
        granularity: options.granularity || 0.25,
        apiProvider: options.apiProvider || 'anthropic',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Extraction failed');
    }

    const result = await response.json();
    console.log(`[DigitizerAPI] Extraction successful: ${result.points?.length || 0} points`);
    return result;
  } catch (error) {
    console.error('Extraction API error:', error);
    throw error;
  }
}

/**
 * Validate KM data before IPD generation
 */
export async function validateKMData(
  points: DataPoint[],
  riskTable: RiskTableRow[]
): Promise<ValidationResult> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/digitizer/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ points, riskTable }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Validation failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Validation API error:', error);
    throw error;
  }
}

/**
 * Generate Pseudo-IPD from KM data
 */
export async function generatePseudoIPD(
  endpoints: IPDGenerationRequest[]
): Promise<IPDGenerationResult> {
  try {
    console.log(`[DigitizerAPI] Generating IPD for ${endpoints.length} endpoints`);

    const response = await fetch(`${API_BASE}/api/v1/digitizer/generate-ipd`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ endpoints }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'IPD generation failed');
    }

    const result = await response.json();
    console.log(`[DigitizerAPI] IPD generation successful`);
    return result;
  } catch (error) {
    console.error('IPD generation API error:', error);
    throw error;
  }
}

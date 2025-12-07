import { loadParquetData } from '../services/python-service';
import { getDataDirectory, getPythonServiceUrl } from '../lib/env';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load pseudo IPD data from parquet files or fall back to demo data from Python service
 */
export async function loadPseudoIPD(endpointType: 'OS' | 'PFS' = 'OS'): Promise<{
  chemo: { time: number[]; event: number[]; arm: string[] };
  pembro: { time: number[]; event: number[]; arm: string[] };
}> {
  const dataDir = getDataDirectory();

  // Try multiple path resolutions for local files
  const possibleRoots = [
    path.resolve(__dirname, '../../..'), // From server/src/tools
    path.resolve(__dirname, '../../../..'), // From server/src
    process.cwd(), // Current working directory
  ];

  let chemoPath: string | null = null;
  let pembroPath: string | null = null;

  for (const root of possibleRoots) {
    const testChemoPath = path.join(root, dataDir, `ipd_EndpointType.${endpointType}_Chemotherapy.parquet`);
    const testPembroPath = path.join(root, dataDir, `ipd_EndpointType.${endpointType}_Pembrolizumab.parquet`);

    if (existsSync(testChemoPath) && existsSync(testPembroPath)) {
      chemoPath = testChemoPath;
      pembroPath = testPembroPath;
      break;
    }
  }

  // If local files exist, use them
  if (chemoPath && pembroPath) {
    try {
      const data = await loadParquetData(chemoPath, pembroPath);
      console.log(`[DataLoader] Loaded local IPD data for ${endpointType}`);
      return data;
    } catch (error) {
      console.warn(`[DataLoader] Failed to load local files, falling back to demo data: ${error}`);
    }
  }

  // Fallback: Load demo data from Python service
  console.log(`[DataLoader] Local IPD files not found, loading demo data from Python service for ${endpointType}`);
  
  try {
    const pythonServiceUrl = getPythonServiceUrl();
    const response = await fetch(`${pythonServiceUrl}/demo-data/${endpointType}`);
    
    if (!response.ok) {
      throw new Error(`Python service returned ${response.status}: ${await response.text()}`);
    }
    
    const demoData = await response.json() as {
      success: boolean;
      chemo: { time: number[]; event: number[]; arm: string[] };
      pembro: { time: number[]; event: number[]; arm: string[] };
      message?: string;
    };
    
    if (!demoData.success) {
      throw new Error('Demo data request was not successful');
    }
    
    console.log(`[DataLoader] Loaded demo data: ${demoData.message || 'success'}`);
    
    return {
      chemo: demoData.chemo,
      pembro: demoData.pembro,
    };
  } catch (fetchError) {
    console.error(`[DataLoader] Failed to load demo data from Python service:`, fetchError);
    throw new Error(
      `Could not load IPD data. Local files not found in ${dataDir} and demo data fetch failed: ${
        fetchError instanceof Error ? fetchError.message : String(fetchError)
      }`
    );
  }
}


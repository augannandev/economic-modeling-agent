import { loadParquetData } from '../services/python-service';
import { getDataDirectory } from '../lib/env';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load pseudo IPD data from parquet files
 */
export async function loadPseudoIPD(endpointType: 'OS' | 'PFS' = 'OS'): Promise<{
  chemo: { time: number[]; event: number[]; arm: string[] };
  pembro: { time: number[]; event: number[]; arm: string[] };
}> {
  const dataDir = getDataDirectory();

  // Try multiple path resolutions
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

  if (!chemoPath || !pembroPath) {
    // Fallback: try absolute path if dataDir is absolute
    if (path.isAbsolute(dataDir)) {
      chemoPath = path.join(dataDir, `ipd_EndpointType.${endpointType}_Chemotherapy.parquet`);
      pembroPath = path.join(dataDir, `ipd_EndpointType.${endpointType}_Pembrolizumab.parquet`);
    } else {
      throw new Error(`Could not find parquet files in ${dataDir}. Checked paths: ${possibleRoots.map(r => path.join(r, dataDir)).join(', ')}`);
    }
  }

  try {
    const data = await loadParquetData(chemoPath, pembroPath);
    return data;
  } catch (error) {
    throw new Error(`Failed to load pseudo IPD data: ${error instanceof Error ? error.message : String(error)}`);
  }
}


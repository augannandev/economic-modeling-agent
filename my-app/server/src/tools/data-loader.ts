import { loadParquetData } from '../services/python-service';
import { getDataDirectory, getPythonServiceUrl } from '../lib/env';
import { isSupabaseConfigured, getIPD } from '../lib/supabase';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load IPD data from Supabase for a specific project
 */
async function loadIPDFromSupabase(
  projectId: string,
  endpointType: 'OS' | 'PFS'
): Promise<{
  chemo: { time: number[]; event: number[]; arm: string[] };
  pembro: { time: number[]; event: number[]; arm: string[] };
} | null> {
  if (!isSupabaseConfigured()) {
    console.log('[DataLoader] Supabase not configured');
    return null;
  }

  try {
    // Load chemo arm
    const chemoResult = await getIPD(projectId, endpointType, 'Chemotherapy');
    // Load pembro arm
    const pembroResult = await getIPD(projectId, endpointType, 'Pembrolizumab');

    if (chemoResult.error || pembroResult.error) {
      console.warn('[DataLoader] Supabase IPD fetch error:', chemoResult.error || pembroResult.error);
      return null;
    }

    const chemoRecords = chemoResult.data || [];
    const pembroRecords = pembroResult.data || [];

    if (chemoRecords.length === 0 && pembroRecords.length === 0) {
      console.log(`[DataLoader] No IPD data found in Supabase for project ${projectId}`);
      return null;
    }

    // Transform Supabase records to the expected format
    const transformRecords = (records: Array<{ time: number; event: boolean; arm: string }>) => ({
      time: records.map(r => r.time),
      event: records.map(r => r.event ? 1 : 0),
      arm: records.map(r => r.arm),
    });

    console.log(`[DataLoader] Loaded ${chemoRecords.length} chemo, ${pembroRecords.length} pembro records from Supabase`);

    return {
      chemo: chemoRecords.length > 0 ? transformRecords(chemoRecords) : { time: [], event: [], arm: [] },
      pembro: pembroRecords.length > 0 ? transformRecords(pembroRecords) : { time: [], event: [], arm: [] },
    };
  } catch (err) {
    console.warn('[DataLoader] Error loading from Supabase:', err);
    return null;
  }
}

/**
 * Load pseudo IPD data from Supabase (if projectId provided), 
 * parquet files, or fall back to demo data from Python service
 * Returns data and source indicator
 */
export async function loadPseudoIPD(
  endpointType: 'OS' | 'PFS' = 'OS',
  projectId?: string
): Promise<{
  chemo: { time: number[]; event: number[]; arm: string[] };
  pembro: { time: number[]; event: number[]; arm: string[] };
  data_source: 'project' | 'demo' | 'local';
}> {
  // Priority 1: Load from Supabase if projectId is provided
  if (projectId) {
    const supabaseData = await loadIPDFromSupabase(projectId, endpointType);
    if (supabaseData && (supabaseData.chemo.time.length > 0 || supabaseData.pembro.time.length > 0)) {
      console.log(`[DataLoader] Using IPD data from Supabase for project ${projectId}`);
      return {
        ...supabaseData,
        data_source: 'project' as const
      };
    }
    console.log(`[DataLoader] No Supabase IPD for project ${projectId}, falling back to local/demo data`);
  }
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
    // Remove extension if present to try variants
    const baseChemoPath = path.join(root, dataDir, `ipd_EndpointType.${endpointType}_Chemotherapy`);
    const basePembroPath = path.join(root, dataDir, `ipd_EndpointType.${endpointType}_Pembrolizumab`);

    const testChemoPath = baseChemoPath;
    const testPembroPath = basePembroPath;

    if (existsSync(testChemoPath + '.parquet') && existsSync(testPembroPath + '.parquet')) {
      chemoPath = testChemoPath + '.parquet';
      pembroPath = testPembroPath + '.parquet';
      break;
    }

    // Check for CSVs
    if (existsSync(testChemoPath + '.csv') && existsSync(testPembroPath + '.csv')) {
      chemoPath = testChemoPath + '.csv';
      pembroPath = testPembroPath + '.csv';
      break;
    }

    // Check for existing full extensions (legacy check)
    if (existsSync(testChemoPath) && existsSync(testPembroPath)) {
      chemoPath = testChemoPath;
      pembroPath = testPembroPath;
      break;
    }
  }

  // If local files exist, use them
  if (chemoPath && pembroPath) {
    try {
      if (chemoPath.endsWith('.csv')) {
        const chemoData = parseCSV(readFileSync(chemoPath, 'utf-8'));
        const pembroData = parseCSV(readFileSync(pembroPath, 'utf-8'));
        console.log(`[DataLoader] Loaded local IPD data (CSV) for ${endpointType}`);
        return { 
          chemo: chemoData, 
          pembro: pembroData,
          data_source: 'local' as const
        };
      } else {
        const data = await loadParquetData(chemoPath, pembroPath);
        console.log(`[DataLoader] Loaded local IPD data (Parquet) for ${endpointType}`);
        return {
          ...data,
          data_source: 'local' as const
        };
      }
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
      data_source: 'demo' as const
    };
  } catch (fetchError) {
    console.error(`[DataLoader] Failed to load demo data from Python service:`, fetchError);
    throw new Error(
      `Could not load IPD data. Local files not found in ${dataDir} and demo data fetch failed: ${fetchError instanceof Error ? fetchError.message : String(fetchError)
      }`
    );
  }
}

/**
 * Simple CSV parser for IPD data
 */
function parseCSV(content: string): { time: number[]; event: number[]; arm: string[] } {
  const lines = content.trim().split('\n');
  const header = lines[0].toLowerCase().split(',');

  const timeIdx = header.indexOf('time');
  const eventIdx = header.indexOf('event');
  const armIdx = header.indexOf('arm');

  if (timeIdx === -1 || eventIdx === -1) {
    throw new Error('CSV missing required columns: time, event');
  }

  const result = {
    time: [] as number[],
    event: [] as number[],
    arm: [] as string[],
  };

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(',');
    result.time.push(parseFloat(parts[timeIdx]));
    result.event.push(parseFloat(parts[eventIdx])); // Ensure number
    if (armIdx !== -1) {
      // Remove quotes if present
      result.arm.push(parts[armIdx].replace(/^"|"$/g, ''));
    } else {
      result.arm.push('unknown');
    }
  }

  return result;
}

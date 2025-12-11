import { loadParquetData } from '../services/python-service';
import { getDataDirectory, getPythonServiceUrl } from '../lib/env';
import { isSupabaseConfigured, getIPD } from '../lib/supabase';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

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
 */
export async function loadPseudoIPD(
  endpointType: 'OS' | 'PFS' = 'OS',
  projectId?: string
): Promise<{
  chemo: { time: number[]; event: number[]; arm: string[] };
  pembro: { time: number[]; event: number[]; arm: string[] };
}> {
  // Priority 1: Load from Supabase if projectId is provided
  if (projectId) {
    const supabaseData = await loadIPDFromSupabase(projectId, endpointType);
    if (supabaseData && (supabaseData.chemo.time.length > 0 || supabaseData.pembro.time.length > 0)) {
      console.log(`[DataLoader] Using IPD data from Supabase for project ${projectId}`);
      return supabaseData;
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


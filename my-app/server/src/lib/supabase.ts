/**
 * Supabase REST API client for SurvivalAgent
 * Uses fetch directly to avoid additional dependencies
 */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

interface SupabaseResponse<T> {
  data: T | null;
  error: string | null;
}

/**
 * Make a request to the Supabase REST API
 */
export async function supabaseRequest<T>(
  table: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: Record<string, unknown> | Record<string, unknown>[];
    select?: string;
    filters?: Record<string, string>;
    order?: string;
    limit?: number;
    upsert?: boolean;
  } = {}
): Promise<SupabaseResponse<T>> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[Supabase] Not configured - SUPABASE_URL or SUPABASE_ANON_KEY missing');
    return { data: null, error: 'Supabase not configured' };
  }

  const { method = 'GET', body, select, filters = {}, order, limit, upsert } = options;
  
  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  
  // Build query string
  const params = new URLSearchParams();
  if (select) params.set('select', select);
  if (order) params.set('order', order);
  if (limit) params.set('limit', String(limit));
  
  // Add filters (e.g., project_id=eq.uuid)
  Object.entries(filters).forEach(([key, value]) => {
    params.set(key, value);
  });
  
  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  const headers: Record<string, string> = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  // Set Prefer header based on operation
  if (method === 'POST') {
    if (upsert) {
      headers['Prefer'] = 'resolution=merge-duplicates,return=representation';
    } else {
      headers['Prefer'] = 'return=representation';
    }
  } else if (method === 'PATCH') {
    headers['Prefer'] = 'return=representation';
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Supabase] Error ${response.status}:`, errorText);
      return { data: null, error: `Supabase error: ${response.status} - ${errorText}` };
    }

    // For DELETE or methods with no content
    if (response.status === 204) {
      return { data: null, error: null };
    }

    const data = await response.json();
    return { data: data as T, error: null };
  } catch (err) {
    console.error('[Supabase] Fetch error:', err);
    return { data: null, error: `Fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ============================================
// Type Definitions
// ============================================

export interface Project {
  id: string;
  user_id?: string;
  name: string;
  description?: string;
  therapeutic_area?: string;
  disease_condition?: string;
  intervention?: string;
  comparator?: string;
  status: string;
  settings?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface IPDRecord {
  id?: string;
  project_id: string;
  endpoint_type: string;
  arm: string;
  ipd_data: {
    patient_id: number;
    time: number;
    event: number;
    arm: string;
  }[];
  n_patients: number;
  n_events: number;
  median_followup?: number;
  validation_hr?: number;
  validation_hr_lower?: number;
  validation_hr_upper?: number;
  validation_pvalue?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Analysis {
  id?: string;
  project_id: string;
  endpoint_type: string;
  status: string;
  workflow_state?: string;
  progress?: number;
  total_steps?: number;
  parameters?: Record<string, unknown>;
  error_message?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
}

export interface KMExtractionCache {
  id?: string;
  image_hash: string;
  endpoint_type?: string;
  arm?: string;
  points: { time: number; survival: number }[];
  risk_table?: { time: number; atRisk: number; events?: number }[];
  axis_ranges?: { xMin: number; xMax: number; yMin: number; yMax: number };
  metadata?: Record<string, unknown>;
  created_at?: string;
}

// ============================================
// Project Functions
// ============================================

export async function createProject(project: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<SupabaseResponse<Project[]>> {
  return supabaseRequest<Project[]>('projects', {
    method: 'POST',
    body: project,
  });
}

export async function getProject(projectId: string): Promise<SupabaseResponse<Project[]>> {
  return supabaseRequest<Project[]>('projects', {
    method: 'GET',
    filters: { id: `eq.${projectId}` },
  });
}

export async function listProjects(userId?: string): Promise<SupabaseResponse<Project[]>> {
  const filters: Record<string, string> = {};
  if (userId) filters.user_id = `eq.${userId}`;
  
  return supabaseRequest<Project[]>('projects', {
    method: 'GET',
    filters,
    order: 'created_at.desc',
  });
}

export async function updateProject(projectId: string, updates: Partial<Project>): Promise<SupabaseResponse<Project[]>> {
  return supabaseRequest<Project[]>('projects', {
    method: 'PATCH',
    body: { ...updates, updated_at: new Date().toISOString() },
    filters: { id: `eq.${projectId}` },
  });
}

// ============================================
// IPD Storage Functions
// ============================================

/**
 * Save IPD data for a project (upserts based on project_id + endpoint_type + arm)
 */
export async function saveIPD(record: Omit<IPDRecord, 'id' | 'created_at' | 'updated_at'>): Promise<SupabaseResponse<IPDRecord[]>> {
  // Use upsert to handle both insert and update
  const now = new Date().toISOString();
  return supabaseRequest<IPDRecord[]>('ipd_data', {
    method: 'POST',
    body: {
      ...record,
      created_at: now,
      updated_at: now,
    },
    upsert: true,
  });
}

/**
 * Get IPD data for a project
 */
export async function getIPD(
  projectId: string,
  endpointType?: string,
  arm?: string
): Promise<SupabaseResponse<IPDRecord[]>> {
  const filters: Record<string, string> = { project_id: `eq.${projectId}` };
  if (endpointType) filters.endpoint_type = `eq.${endpointType}`;
  if (arm) filters.arm = `eq.${arm}`;
  
  return supabaseRequest<IPDRecord[]>('ipd_data', {
    method: 'GET',
    filters,
  });
}

/**
 * Get all IPD for a project
 */
export async function getAllProjectIPD(projectId: string): Promise<SupabaseResponse<IPDRecord[]>> {
  return supabaseRequest<IPDRecord[]>('ipd_data', {
    method: 'GET',
    filters: { project_id: `eq.${projectId}` },
  });
}

/**
 * Delete IPD data
 */
export async function deleteIPD(
  projectId: string,
  endpointType?: string,
  arm?: string
): Promise<SupabaseResponse<null>> {
  const filters: Record<string, string> = { project_id: `eq.${projectId}` };
  if (endpointType) filters.endpoint_type = `eq.${endpointType}`;
  if (arm) filters.arm = `eq.${arm}`;
  
  return supabaseRequest<null>('ipd_data', {
    method: 'DELETE',
    filters,
  });
}

// ============================================
// Analysis Functions
// ============================================

export async function createAnalysis(analysis: Omit<Analysis, 'id' | 'created_at' | 'updated_at'>): Promise<SupabaseResponse<Analysis[]>> {
  return supabaseRequest<Analysis[]>('analyses', {
    method: 'POST',
    body: {
      ...analysis,
      status: analysis.status || 'pending',
    },
  });
}

export async function getAnalysis(analysisId: string): Promise<SupabaseResponse<Analysis[]>> {
  return supabaseRequest<Analysis[]>('analyses', {
    method: 'GET',
    filters: { id: `eq.${analysisId}` },
  });
}

export async function getProjectAnalyses(projectId: string): Promise<SupabaseResponse<Analysis[]>> {
  return supabaseRequest<Analysis[]>('analyses', {
    method: 'GET',
    filters: { project_id: `eq.${projectId}` },
    order: 'created_at.desc',
  });
}

export async function updateAnalysis(analysisId: string, updates: Partial<Analysis>): Promise<SupabaseResponse<Analysis[]>> {
  return supabaseRequest<Analysis[]>('analyses', {
    method: 'PATCH',
    body: { ...updates, updated_at: new Date().toISOString() },
    filters: { id: `eq.${analysisId}` },
  });
}

// ============================================
// Model Functions
// ============================================

export interface ModelRecord {
  id?: string;
  analysis_id: string;
  arm: string;
  approach: string;
  distribution?: string;
  scale?: string;
  knots?: number;
  cutpoint?: number;
  parameters: Record<string, unknown>;
  aic?: number;
  bic?: number;
  log_likelihood?: number;
  survival_predictions?: { time: number; survival: number }[];
  milestone_survival?: Record<string, number>;
  model_order: number;
  created_at?: string;
}

export interface PHTestRecord {
  id?: string;
  analysis_id: string;
  chow_test_pvalue?: number;
  schoenfeld_pvalue?: number;
  logrank_pvalue?: number;
  decision: string;
  rationale?: string;
  diagnostic_plots?: Record<string, string>;
  vision_assessment?: Record<string, unknown>;
  reasoning_assessment?: Record<string, unknown>;
  created_at?: string;
}

export interface SynthesisReportRecord {
  id?: string;
  analysis_id: string;
  within_approach_rankings?: Record<string, unknown>;
  cross_approach_comparison?: Record<string, unknown>;
  primary_recommendation?: string;
  sensitivity_recommendations?: Record<string, unknown>;
  key_uncertainties?: string;
  hta_strategy?: string;
  full_text: string;
  token_usage?: number;
  created_at?: string;
}

/**
 * Save a fitted model to Supabase
 */
export async function saveModel(model: Omit<ModelRecord, 'id' | 'created_at'>): Promise<SupabaseResponse<ModelRecord[]>> {
  return supabaseRequest<ModelRecord[]>('models', {
    method: 'POST',
    body: model,
  });
}

/**
 * Get models for an analysis
 */
export async function getAnalysisModels(analysisId: string): Promise<SupabaseResponse<ModelRecord[]>> {
  return supabaseRequest<ModelRecord[]>('models', {
    method: 'GET',
    filters: { analysis_id: `eq.${analysisId}` },
    order: 'model_order.asc',
  });
}

/**
 * Save PH test results
 */
export async function savePHTest(phTest: Omit<PHTestRecord, 'id' | 'created_at'>): Promise<SupabaseResponse<PHTestRecord[]>> {
  return supabaseRequest<PHTestRecord[]>('ph_tests', {
    method: 'POST',
    body: phTest,
  });
}

/**
 * Get PH test for an analysis
 */
export async function getAnalysisPHTest(analysisId: string): Promise<SupabaseResponse<PHTestRecord[]>> {
  return supabaseRequest<PHTestRecord[]>('ph_tests', {
    method: 'GET',
    filters: { analysis_id: `eq.${analysisId}` },
  });
}

/**
 * Save synthesis report
 */
export async function saveSynthesisReport(report: Omit<SynthesisReportRecord, 'id' | 'created_at'>): Promise<SupabaseResponse<SynthesisReportRecord[]>> {
  return supabaseRequest<SynthesisReportRecord[]>('synthesis_reports', {
    method: 'POST',
    body: report,
  });
}

/**
 * Get synthesis report for an analysis
 */
export async function getAnalysisSynthesis(analysisId: string): Promise<SupabaseResponse<SynthesisReportRecord[]>> {
  return supabaseRequest<SynthesisReportRecord[]>('synthesis_reports', {
    method: 'GET',
    filters: { analysis_id: `eq.${analysisId}` },
  });
}

// ============================================
// KM Extraction Cache Functions
// ============================================

/**
 * Cache extracted KM curve data
 */
export async function cacheKMExtraction(cache: Omit<KMExtractionCache, 'id' | 'created_at'>): Promise<SupabaseResponse<KMExtractionCache[]>> {
  return supabaseRequest<KMExtractionCache[]>('km_extraction_cache', {
    method: 'POST',
    body: cache,
    upsert: true,
  });
}

/**
 * Get cached KM extraction by image hash
 */
export async function getCachedKMExtraction(imageHash: string): Promise<SupabaseResponse<KMExtractionCache[]>> {
  return supabaseRequest<KMExtractionCache[]>('km_extraction_cache', {
    method: 'GET',
    filters: { image_hash: `eq.${imageHash}` },
  });
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Test Supabase connection
 */
export async function testSupabaseConnection(): Promise<{ connected: boolean; tables?: string[]; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { connected: false, error: 'Supabase not configured' };
  }
  
  try {
    // Try to list projects (empty is fine, we just want to confirm connection)
    const response = await fetch(`${SUPABASE_URL}/rest/v1/projects?limit=1`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    
    if (response.ok) {
      return { connected: true, tables: ['projects', 'ipd_data', 'analyses', 'models', 'synthesis_reports'] };
    }
    
    return { connected: false, error: `Status: ${response.status}` };
  } catch (err) {
    return { connected: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get project summary (from view)
 */
export async function getProjectSummary(projectId: string): Promise<SupabaseResponse<Record<string, unknown>[]>> {
  return supabaseRequest<Record<string, unknown>[]>('project_summary', {
    method: 'GET',
    filters: { id: `eq.${projectId}` },
  });
}

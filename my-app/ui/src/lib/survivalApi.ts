import { fetchWithAuth } from './serverComm';

// API URL for plots (direct URLs, not through fetchWithAuth)
const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (typeof window !== 'undefined' && window.location.hostname === 'localhost' 
    ? 'http://localhost:5500' 
    : '');

// Log the API URL at startup for debugging
if (typeof window !== 'undefined') {
  console.log('[SurvivalAPI] API_BASE_URL:', API_BASE_URL || '(empty - using relative URLs)');
  console.log('[SurvivalAPI] VITE_API_URL env:', import.meta.env.VITE_API_URL || '(not set)');
}

export interface Analysis {
  id: string;
  user_id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  workflow_state: string | null;
  progress: number;
  total_models: number;
  parameters: any;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Model {
  id: string;
  analysis_id: string;
  arm: string;
  approach: string;
  distribution: string | null;
  scale: string | null;
  knots: number | null;
  cutpoint: number | null;
  parameters: any;
  aic: number | null;
  bic: number | null;
  log_likelihood: number | null;
  model_order: number;
  created_at: string;
}

export interface VisionAssessment {
  id: string;
  model_id: string;
  short_term_score: number | null;
  long_term_score: number | null;
  short_term_observations: string | null;
  long_term_observations: string | null;
  strengths: string | null;
  weaknesses: string | null;
  concerns: string | null;
  token_usage: number | null;
  created_at: string;
}

export interface ReasoningAssessment {
  id: string;
  model_id: string;
  full_text: string;
  sections: any;
  token_usage: number | null;
  created_at: string;
}

export interface Plot {
  id: string;
  model_id: string;
  plot_type: 'short_term' | 'long_term';
  file_path: string;
  base64_data: string | null;
  created_at: string;
}

export interface ModelDetails {
  model: Model;
  vision_assessment: VisionAssessment | null;
  reasoning_assessment: ReasoningAssessment | null;
  plots: Plot[];
}

export interface SynthesisReport {
  id: string;
  analysis_id: string;
  within_approach_rankings: any;
  cross_approach_comparison: any;
  primary_recommendation: string | null;
  sensitivity_recommendations: any;
  key_uncertainties: string | null;
  hta_strategy: string | null;
  full_text: string;
  token_usage: number | null;
  created_at: string;
}

export interface AnalysisStatus {
  status: string;
  workflow_state: string | null;
  progress: number;
  total_models: number;
}

export interface TokenUsage {
  usage: Array<{
    id: string;
    analysis_id: string;
    model_id: string | null;
    model_type: string;
    tokens_input: number;
    tokens_output: number;
    cost_estimate: number | null;
    timestamp: string;
  }>;
  total: {
    input: number;
    output: number;
    cost: number;
  };
}

/**
 * Start a new survival analysis workflow
 */
export async function startAnalysis(endpointType: 'OS' | 'PFS' = 'OS'): Promise<{ analysis_id: string; status: string; message: string }> {
  const response = await fetchWithAuth('/api/v1/survival/analyze', {
    method: 'POST',
    body: JSON.stringify({ endpointType }),
  });
  return response.json();
}

/**
 * List all analyses for the current user
 */
export async function listAnalyses(): Promise<{ analyses: Analysis[] }> {
  const response = await fetchWithAuth('/api/v1/survival/analyses');
  return response.json();
}

/**
 * Get analysis details
 */
export async function getAnalysis(analysisId: string): Promise<{ analysis: Analysis }> {
  const response = await fetchWithAuth(`/api/v1/survival/analyses/${analysisId}`);
  return response.json();
}

/**
 * Get analysis status
 */
export async function getAnalysisStatus(analysisId: string): Promise<AnalysisStatus> {
  const response = await fetchWithAuth(`/api/v1/survival/analyses/${analysisId}/status`);
  return response.json();
}

/**
 * List models for an analysis
 */
export async function listModels(analysisId: string): Promise<{ models: Model[] }> {
  const response = await fetchWithAuth(`/api/v1/survival/analyses/${analysisId}/models`);
  return response.json();
}

/**
 * Get model details with assessments
 */
export async function getModelDetails(analysisId: string, modelId: string): Promise<ModelDetails> {
  const response = await fetchWithAuth(`/api/v1/survival/analyses/${analysisId}/models/${modelId}`);
  return response.json();
}

/**
 * Get PH test results
 */
export async function getPHTests(analysisId: string): Promise<{ ph_tests: any }> {
  const response = await fetchWithAuth(`/api/v1/survival/analyses/${analysisId}/ph-tests`);
  return response.json();
}

/**
 * Get synthesis report
 */
export async function getSynthesis(analysisId: string): Promise<{ synthesis: SynthesisReport | null }> {
  const response = await fetchWithAuth(`/api/v1/survival/analyses/${analysisId}/synthesis`);
  return response.json();
}

/**
 * Get plot image URL
 */
export function getPlotUrl(analysisId: string, modelId: string, plotType: 'short_term' | 'long_term'): string {
  return `${API_BASE_URL}/api/v1/survival/analyses/${analysisId}/plots/${modelId}/${plotType}`;
}

/**
 * Get token usage for an analysis
 */
export async function deleteAnalysis(analysisId: string): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/survival/analyses/${analysisId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete analysis: ${error}`);
  }
}

export async function getTokenUsage(analysisId: string): Promise<TokenUsage> {
  const response = await fetchWithAuth(`/api/v1/survival/token-usage/${analysisId}`);
  return response.json();
}

export const survivalApi = {
  startAnalysis,
  listAnalyses,
  getAnalysis,
  getAnalysisStatus,
  listModels,
  getModelDetails,
  getPHTests,
  getSynthesis,
  getPlotUrl,
  getTokenUsage,
  deleteAnalysis,
  pauseAnalysis,
  resumeAnalysis,
};

export async function pauseAnalysis(analysisId: string): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/survival/analyses/${analysisId}/pause`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to pause analysis');
}

export async function resumeAnalysis(analysisId: string): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/survival/analyses/${analysisId}/resume`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to resume analysis');
}


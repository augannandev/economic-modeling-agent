import { createReasoningLLM, estimateCost } from '../lib/llm';
import { HumanMessage } from '@langchain/core/messages';
import { NICE_DSU_TSD_14_PRINCIPLES, NICE_DSU_TSD_21_PRINCIPLES } from '../lib/nice-guidelines';
import { loadRagDocuments } from '../lib/document-loader';
import path from 'path';
import fs from 'fs/promises';

export interface SynthesisReportResult {
  within_approach_rankings: Record<string, any>;
  cross_approach_comparison: Record<string, any>;
  primary_recommendation: string;
  sensitivity_recommendations: Array<{ model_id: string; rationale: string }>;
  key_uncertainties: string;
  hta_strategy: string;
  full_text: string;
  token_usage: {
    input: number;
    output: number;
    cost: number;
  };
}

/**
 * Generate cross-model synthesis report
 */
export async function synthesizeCrossModel(
  allModelAssessments: Array<{
    model_id: string;
    arm: string;
    approach: string;
    distribution?: string;
    vision_scores: { short_term: number; long_term: number };
    reasoning_summary: string;
  }>,
  phTestResults?: {
    chow_test_pvalue: number;
    schoenfeld_pvalue: number;
    logrank_pvalue: number;
    decision: string;
    rationale: string;
    crossing_detected?: boolean;
    crossing_time?: number | null;
  }
): Promise<SynthesisReportResult> {
  const llm = createReasoningLLM();

  // Load RAG documents (Core Docs Only Strategy)
  const ragDir = path.join(process.cwd(), 'data', 'rag_docs');
  // We filter for TSD 14 and 21 as per user agreement to save tokens/cost
  // Matches filenames containing "TSD_14" or "TSD_21" (case insensitive usually, but here exact string match on part)
  // Assuming user filenames are like "TSD_14.txt" or similar. 
  // We'll use a broad match for "14" and "21" combined with "TSD" if possible, 
  // but for now let's pass the specific identifiers the user likely used.
  const coreDocs = ['TSD_14', 'TSD 14', 'TSD14', 'TSD_21', 'TSD 21', 'TSD21'];
  const ragContext = await loadRagDocuments(ragDir, coreDocs);

  // Load Style Guide
  let styleGuide = '';
  try {
    styleGuide = await fs.readFile(path.join(process.cwd(), '..', 'synthesis_report_style.md'), 'utf-8');
  } catch (e) {
    console.warn('Style guide not found, using default style.');
  }

  const prompt = `${NICE_DSU_TSD_14_PRINCIPLES}

${NICE_DSU_TSD_21_PRINCIPLES}

You have completed comprehensive assessment of 42 survival models (21 per arm) across three approaches:
- One-piece parametric models (6 distributions × 2 arms = 12 models)
- Piecewise parametric models (6 distributions × 2 arms = 12 models)
- Royston-Parmar spline models (3 scales × 3 knot configurations × 2 arms = 18 models)

REFERENCE DOCUMENTS (RAG CONTEXT):
Use the following documents to guide your formatting, tone, and methodology citations.
${ragContext}

STYLE GUIDE (MANDATORY):
Follow these writing guidelines strictly.
${styleGuide}

MODEL ASSESSMENTS:
${JSON.stringify(allModelAssessments, null, 2)}

PH TESTING RESULTS (HARD FACTS):
${phTestResults ? JSON.stringify(phTestResults, null, 2) : 'Not available'}
${phTestResults?.crossing_detected ? `CRITICAL: A crossing was definitively detected at t=${phTestResults.crossing_time?.toFixed(2)} months. You MUST prioritize separate models.` : ''}

Generate a comprehensive synthesis report (6000-8000 words) covering:

1. EXECUTIVE SUMMARY
   - Brief overview of analysis
   - Key findings
   - Primary recommendation

2. DATA OVERVIEW
   - Summary of trial data
   - Proportional hazards testing results
   - Rationale for separate arm modeling

3. WITHIN-APPROACH RANKINGS
   - Best models per approach per arm
   - Justification for rankings
   - Note: AIC/BIC comparisons only within same approach

4. CROSS-APPROACH COMPARISON MATRIX
   Compare approaches across:
   - Short-term fit quality (from vision scores)
   - Long-term plausibility (from vision scores)
   - External validation (SEER comparison)
   - Methodological transparency
   - HTA reviewer acceptability

5. PRIMARY RECOMMENDATION (800-1000 words)
   - Base case model selection
   - Detailed justification
   - Why this model over alternatives

6. SENSITIVITY ANALYSIS RECOMMENDATIONS
   - Alternative models to include
   - Rationale for each alternative
   - Expected impact on results

7. KEY UNCERTAINTIES (500-700 words)
   - Where models disagree and why
   - Sources of uncertainty
   - Implications for decision-making

8. HTA SUBMISSION STRATEGY (400-500 words)
   - How to present findings
   - Key messages for reviewers
   - Recommended presentation format

Format your response as structured text with clear section headings.`;

  const messages = [new HumanMessage({ content: prompt })];
  const response = await llm.invoke(messages);
  const content = response.content as string;

  // Extract structured components (simplified - could be improved with better parsing)
  const within_approach_rankings = extractJSONSection(content, 'WITHIN-APPROACH RANKINGS');
  const cross_approach_comparison = extractJSONSection(content, 'CROSS-APPROACH COMPARISON');
  const primary_recommendation = extractSection(content, 'PRIMARY RECOMMENDATION', 'SENSITIVITY');
  const sensitivity_recommendations = extractSensitivityRecommendations(content);
  const key_uncertainties = extractSection(content, 'KEY UNCERTAINTIES', 'HTA');
  const hta_strategy = extractSection(content, 'HTA SUBMISSION STRATEGY', '');

  // Estimate token usage
  const inputTokens = Math.ceil(prompt.length / 4);
  const outputTokens = Math.ceil(content.length / 4);
  const cost = estimateCost('openai', inputTokens, outputTokens);

  return {
    within_approach_rankings: within_approach_rankings || {},
    cross_approach_comparison: cross_approach_comparison || {},
    primary_recommendation,
    sensitivity_recommendations,
    key_uncertainties,
    hta_strategy,
    full_text: content,
    token_usage: {
      input: inputTokens,
      output: outputTokens,
      cost,
    },
  };
}

function extractSection(text: string, startMarker: string, endMarker: string): string {
  const startIdx = text.indexOf(startMarker);
  if (startIdx === -1) return '';

  const endIdx = endMarker ? text.indexOf(endMarker, startIdx) : text.length;
  if (endIdx === -1) return text.substring(startIdx);

  return text.substring(startIdx, endIdx).trim();
}

function extractJSONSection(text: string, marker: string): any {
  const section = extractSection(text, marker, '');
  const jsonMatch = section.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
  return null;
}

function extractSensitivityRecommendations(text: string): Array<{ model_id: string; rationale: string }> {
  const section = extractSection(text, 'SENSITIVITY ANALYSIS', 'KEY UNCERTAINTIES');
  // Simple extraction - could be improved
  const recommendations: Array<{ model_id: string; rationale: string }> = [];

  // Look for model IDs and rationales in the text
  const lines = section.split('\n').filter(line => line.trim());
  let currentModel: string | null = null;
  let currentRationale: string[] = [];

  for (const line of lines) {
    if (line.match(/model.*id|model_id/i)) {
      if (currentModel) {
        recommendations.push({
          model_id: currentModel,
          rationale: currentRationale.join(' '),
        });
      }
      currentModel = line;
      currentRationale = [];
    } else if (currentModel) {
      currentRationale.push(line);
    }
  }

  if (currentModel) {
    recommendations.push({
      model_id: currentModel,
      rationale: currentRationale.join(' '),
    });
  }

  return recommendations.length > 0 ? recommendations : [];
}


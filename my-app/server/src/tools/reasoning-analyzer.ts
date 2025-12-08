import { createReasoningLLM, estimateCost } from '../lib/llm';
import { HumanMessage } from '@langchain/core/messages';
import { NICE_DSU_EVALUATION_PROMPT, NICE_DSU_TSD_14_PRINCIPLES, NICE_DSU_TSD_21_PRINCIPLES } from '../lib/nice-guidelines';
import type { VisionAssessmentResult } from './vision-analyzer';
import type { ModelFitResult } from '../services/python-service';
import { getRAGService, getSimpleRAGContext } from '../lib/rag-service';
import path from 'path';

export interface ReasoningAssessmentResult {
  full_text: string;
  sections: {
    statistical_fit: string;
    extrapolation: string;
    strengths: string[];
    weaknesses: string[];
    decision: 'Base Case' | 'Scenario' | 'Screen Out';
    justification: string;
    // Legacy fields for backward compatibility
    ph_assumption?: string;
    statistical_performance?: string;
    visual_fit?: string;
    clinical_plausibility?: string;
    nice_compliance?: string;
    scenarios?: string;
    recommendation?: string;
    uncertainties?: string;
    statistical_visual_fit?: string;
    strengths_weaknesses?: string;
  };
  token_usage: {
    input: number;
    output: number;
    cost: number;
  };
}

/**
 * Get RAG context for model assessment
 */
async function getModelRAGContext(
  distribution: string,
  approach: string,
  indication?: string
): Promise<string> {
  try {
    const ragService = getRAGService();
    
    // Query for methodology guidance
    const methodologyContext = await ragService.queryMethodology(
      distribution,
      `${approach} extrapolation plausibility`
    );
    
    // Query for benchmarks if indication provided
    let benchmarkContext = '';
    if (indication) {
      benchmarkContext = await ragService.queryBenchmarks(indication, 'overall');
    }
    
    if (methodologyContext || benchmarkContext) {
      return `
## RAG CONTEXT (Methodology & Benchmarks)

${methodologyContext ? `### Methodology Guidance\n${methodologyContext}` : ''}

${benchmarkContext ? `### External Benchmarks\n${benchmarkContext}` : ''}
`;
    }
    
    return '';
  } catch (error) {
    console.warn('[ReasoningAnalyzer] RAG query failed, using fallback:', error);
    
    // Fallback to simple file-based context
    try {
      const ragDir = path.join(process.cwd(), 'data', 'rag_docs');
      return await getSimpleRAGContext(ragDir, `${distribution} ${approach} survival`);
    } catch {
      return '';
    }
  }
}

/**
 * Concise reasoning analysis (200-word format) per plan specification
 * Uses Vision JSON output + RAG context
 */
export async function assessWithReasoningLLM(
  modelResult: ModelFitResult,
  visionAssessment: VisionAssessmentResult,
  clinicalContext: {
    trial_name?: string;
    indication?: string;
    comparator?: string;
    mechanism_of_action?: string;
  } = {},
  phPlots?: { log_cumulative_hazard?: string; schoenfeld_residuals?: string }
): Promise<ReasoningAssessmentResult> {
  const llm = createReasoningLLM();

  // Get RAG context
  const ragContext = await getModelRAGContext(
    modelResult.distribution || modelResult.approach,
    modelResult.approach,
    clinicalContext.indication
  );

  // Pre-compute key metrics from vision assessment
  const fitScore = visionAssessment.short_term_score;
  const extrapScore = visionAssessment.long_term_score;
  const aicRank = (modelResult as any).aicRank || 'N/A';
  
  // Extract predictions for comparison
  const predictions = visionAssessment.extracted_predictions || {};
  const benchmarkComparison = visionAssessment.benchmark_comparison || {
    plausibility_rating: 'plausible' as const,
    notes: 'No benchmark data'
  };

  // Build concise prompt (per plan: 200 words output)
  const prompt = `You are a senior health economist synthesizing vision analysis for a survival model.

## INPUT DATA (DO NOT REPEAT - SUMMARIZE ONLY)

**Scores:** AIC=${modelResult.aic?.toFixed(2) || 'N/A'} (Rank #${aicRank}) | Fit ${fitScore}/10 | Extrapolation ${extrapScore}/10

**Vision Observations:**
- Early (0-6mo): ${visionAssessment.observations?.early?.fit_quality || 'N/A'}
- Mid (6-18mo): ${visionAssessment.observations?.mid?.fit_quality || 'N/A'}
- Late (18mo+): ${visionAssessment.observations?.late?.fit_quality || 'N/A'}
- Extrapolation: ${visionAssessment.observations?.extrapolation?.trajectory || 'N/A'}

**Predictions Extracted:**
${predictions.year5 !== undefined ? `- 5yr: ${(predictions.year5 * 100).toFixed(1)}%` : ''}
${predictions.year10 !== undefined ? `- 10yr: ${(predictions.year10 * 100).toFixed(1)}%` : ''}

**Benchmark Comparison:**
${benchmarkComparison.notes || 'No benchmark data'}
- Plausibility: ${benchmarkComparison.plausibility_rating || 'N/A'}

**Red Flags:** ${visionAssessment.red_flags?.join('; ') || 'None'}

${ragContext}

## OUTPUT FORMAT

Provide a concise assessment with these sections:

**Statistical Fit**
Assess AIC competitiveness and visual tracking quality. Is fit good or poor?

**Extrapolation**
Compare predicted survival to benchmarks. Is the tail plausible for ${clinicalContext.indication || 'this indication'}?

**Strengths**
- Key strength 1
- Key strength 2

**Weaknesses**
- Key weakness 1
- Key weakness 2

**Recommendation**
State one of: Base Case, Scenario Analysis, or Screen Out, followed by a brief justification.

DECISION CRITERIA:
- Base Case: Top 2-3 AIC, fit ≥7, extrap ≥6, no red flags
- Scenario Analysis: Fit ≥5, useful for sensitivity, minor concerns
- Screen Out: Fit <5, implausible extrapolation, or critical red flags

Output ONLY the filled sections above. Do not include word counts or instructional text.`;

  const messages = [new HumanMessage({ content: prompt })];
  const response = await llm.invoke(messages);
  const content = response.content as string;

  // Parse the structured response
  const sections = parseReasoningResponse(content);

  // Estimate token usage
  const inputTokens = Math.ceil(prompt.length / 4);
  const outputTokens = Math.ceil(content.length / 4);
  const cost = estimateCost('anthropic', inputTokens, outputTokens);

  return {
    full_text: content,
    sections,
    token_usage: {
      input: inputTokens,
      output: outputTokens,
      cost,
    },
  };
}

/**
 * Parse the structured 200-word response
 */
function parseReasoningResponse(content: string): ReasoningAssessmentResult['sections'] {
  const extractSection = (text: string, marker: string, endMarkers: string[]): string => {
    const startIdx = text.indexOf(marker);
    if (startIdx === -1) return '';
    
    let endIdx = text.length;
    for (const endMarker of endMarkers) {
      const idx = text.indexOf(endMarker, startIdx + marker.length);
      if (idx !== -1 && idx < endIdx) {
        endIdx = idx;
      }
    }
    
    return text.substring(startIdx + marker.length, endIdx).trim();
  };

  const extractBullets = (text: string): string[] => {
    const bullets = text.match(/^[-•]\s*(.+)$/gm);
    if (!bullets) return [text.trim()];
    return bullets.map(b => b.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
  };

  const statisticalFit = extractSection(content, '**Statistical Fit', ['**Extrapolation', '**Strengths']);
  const extrapolation = extractSection(content, '**Extrapolation', ['**Strengths', '**Weaknesses']);
  const strengthsText = extractSection(content, '**Strengths', ['**Weaknesses', '**Decision', '**Recommendation']);
  const weaknessesText = extractSection(content, '**Weaknesses', ['**Decision', '**Recommendation']);
  
  // Try both "Decision" and "Recommendation" headers
  let decisionText = extractSection(content, '**Decision', []);
  if (!decisionText) {
    decisionText = extractSection(content, '**Recommendation', []);
  }

  // Parse decision
  let decision: 'Base Case' | 'Scenario' | 'Screen Out' = 'Scenario';
  const lowerDecision = decisionText.toLowerCase();
  if (lowerDecision.includes('base case')) {
    decision = 'Base Case';
  } else if (lowerDecision.includes('screen out')) {
    decision = 'Screen Out';
  } else if (lowerDecision.includes('scenario')) {
    decision = 'Scenario';
  }

  // Extract justification (everything after the decision keyword)
  const justificationMatch = decisionText.match(/(?:Base Case|Scenario Analysis|Scenario|Screen Out)\s*[-–—:.,]\s*(.+)/is);
  const justification = justificationMatch ? justificationMatch[1].trim() : decisionText;

  // Clean up any remaining word count markers or instructional text
  const cleanText = (text: string) => text
    .replace(/^\(\d+\s*words?\):?\s*/i, '')  // Remove "(50 words):" prefix
    .replace(/^\*\*$/, '')  // Remove stray **
    .replace(/\*\*$/g, '')  // Remove trailing **
    .trim();

  return {
    statistical_fit: cleanText(statisticalFit),
    extrapolation: cleanText(extrapolation),
    strengths: extractBullets(strengthsText),
    weaknesses: extractBullets(weaknessesText),
    decision,
    justification: cleanText(justification),
    // Legacy compatibility
    recommendation: cleanText(decisionText),
    statistical_visual_fit: cleanText(statisticalFit),
    strengths_weaknesses: `Strengths: ${strengthsText}\n\nWeaknesses: ${weaknessesText}`,
  };
}

/**
 * Assess Proportional Hazards assumption using Vision/Reasoning
 */
export async function assessPHAssumption(
  phPlots: { log_cumulative_hazard: string; schoenfeld_residuals: string },
  statisticalResults: {
    schoenfeld_p: number;
    chow_p: number;
    logrank_p: number;
    crossing_detected?: boolean;
    crossing_time?: number | null;
  },
  clinicalContext: { indication?: string; mechanism_of_action?: string }
): Promise<{ decision: 'separate' | 'pooled'; rationale: string }> {
  const llm = createReasoningLLM();

  console.log('🔍 Assessing PH Assumption with Claude Sonnet 4.5...');

  if (!phPlots.log_cumulative_hazard || phPlots.log_cumulative_hazard.length < 100) {
    throw new Error('Log-Cumulative Hazard plot data is missing or invalid');
  }
  if (!phPlots.schoenfeld_residuals || phPlots.schoenfeld_residuals.length < 100) {
    throw new Error('Schoenfeld Residuals plot data is missing or invalid');
  }

  const prompt = `You are a senior biostatistician analyzing proportional hazards (PH) assumption for an HTA.

CLINICAL CONTEXT:
- Indication: ${clinicalContext.indication || 'Unknown'}
- Mechanism: ${clinicalContext.mechanism_of_action || 'Unknown'}

COMPUTED CROSSING ANALYSIS:
- Crossing Detected: ${statisticalResults.crossing_detected ? 'YES' : 'NO'}
${statisticalResults.crossing_detected ? `- Crossing Time: t ≈ ${statisticalResults.crossing_time?.toFixed(2)} months` : ''}

Analyze the two plots (Log-Cumulative Hazard & Schoenfeld Residuals):

1. Do the curves cross in the log-cumulative hazard plot?
2. Is the Schoenfeld LOWESS trend flat?

OUTPUT (JSON only):
{
  "decision": "separate" | "pooled",
  "rationale": "<2 sentences describing what you see in plots>"
}`;

  const cleanLogCumHaz = phPlots.log_cumulative_hazard.replace(/^data:image\/\w+;base64,/, '').trim();
  const cleanSchoenfeld = phPlots.schoenfeld_residuals.replace(/^data:image\/\w+;base64,/, '').trim();

  const messages = [
    new HumanMessage({
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${cleanLogCumHaz}` },
        },
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${cleanSchoenfeld}` },
        },
      ],
    }),
  ];

  const response = await llm.invoke(messages);
  const content = response.content as string;

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        decision: result.decision === 'separate' ? 'separate' : 'pooled',
        rationale: result.rationale
      };
    }
    throw new Error('No JSON found');
  } catch {
    return {
      decision: 'separate',
      rationale: 'Analysis failed; defaulting to separate models.'
    };
  }
}

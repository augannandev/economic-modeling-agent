import { createReasoningLLM, estimateCost } from '../lib/llm';
import { HumanMessage } from '@langchain/core/messages';
import { NICE_DSU_TSD_14_PRINCIPLES, NICE_DSU_TSD_21_PRINCIPLES } from '../lib/nice-guidelines';
import { getRAGService, getSimpleRAGContext } from '../lib/rag-service';
import { formatMarkdown } from '../lib/markdown-formatter';
import path from 'path';

export interface SynthesisReportResult {
  within_approach_rankings: Record<string, unknown>;
  cross_approach_comparison: Record<string, unknown>;
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
 * Model assessment data for synthesis
 */
interface ModelAssessment {
  model_id: string;
  arm: string;
  approach: string;
  distribution?: string;
  aic: number;
  bic: number;
  vision_scores: { short_term: number; long_term: number };
  vision_observations: { short_term: string; long_term: string };
  reasoning_summary: string;
  // New fields from enhanced vision analyzer
  extracted_predictions?: {
    year1?: number;
    year2?: number;
    year5?: number;
    year10?: number;
  };
  recommendation?: 'Base Case' | 'Scenario' | 'Screen Out';
  red_flags?: string[];
}

/**
 * Get comprehensive RAG context for synthesis
 */
async function getSynthesisRAGContext(indication?: string): Promise<string> {
  try {
    const ragService = getRAGService();
    
    // Query for NICE methodology (TSD14, TSD16)
    const methodologyResults = await ragService.query(
      'NICE TSD14 survival extrapolation model selection criteria uncertainty',
      5
    );
    
    // Query for benchmarks
    const benchmarkResults = indication 
      ? await ragService.query(`${indication} survival benchmark external data 5-year 10-year`, 3)
      : [];
    
    let context = '';
    
    if (methodologyResults.length > 0) {
      context += '## NICE Methodology Guidance\n\n';
      for (const result of methodologyResults) {
        context += `**[${result.source}]**\n${result.content}\n\n`;
      }
    }
    
    if (benchmarkResults.length > 0) {
      context += '\n## External Benchmark Data\n\n';
      for (const result of benchmarkResults) {
        context += `**[${result.source}]**\n${result.content}\n\n`;
      }
    }
    
    return context;
  } catch (error) {
    console.warn('[SynthesisGenerator] RAG query failed, using fallback:', error);
    
    // Fallback to simple file-based context
    try {
      const ragDir = path.join(process.cwd(), 'data', 'rag_docs');
      const simpleContext = await getSimpleRAGContext(ragDir, 'TSD survival model selection');
      return `## Methodology Context\n\n${simpleContext}`;
    } catch {
      return '';
    }
  }
}

/**
 * Build model summary table for prompt
 */
function buildModelSummaryTable(models: ModelAssessment[], arm: string): string {
  const armModels = models
    .filter(m => m.arm === arm)
    .sort((a, b) => a.aic - b.aic);
  
  if (armModels.length === 0) return '*No models for this arm*';
  
  let table = '| Model | AIC | Fit | Extrap | 5yr | Decision |\n';
  table += '| --- | --- | --- | --- | --- | --- |\n';
  
  for (const m of armModels) {
    const year5 = m.extracted_predictions?.year5 
      ? `${(m.extracted_predictions.year5 * 100).toFixed(0)}%` 
      : 'N/A';
    table += `| ${m.distribution || m.approach} | ${m.aic.toFixed(0)} | ${m.vision_scores.short_term}/10 | ${m.vision_scores.long_term}/10 | ${year5} | ${m.recommendation || 'TBD'} |\n`;
  }
  
  return table;
}

/**
 * Generate cross-model synthesis report (3000 words)
 */
export async function synthesizeCrossModel(
  allModelAssessments: ModelAssessment[],
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

  // Get RAG context
  const ragContext = await getSynthesisRAGContext();

  // Categorize models
  const baseCaseModels = allModelAssessments.filter(m => m.recommendation === 'Base Case');
  const scenarioModels = allModelAssessments.filter(m => m.recommendation === 'Scenario');
  const screenedOutModels = allModelAssessments.filter(m => m.recommendation === 'Screen Out');

  // Group by approach
  const byApproach = {
    'One-piece': allModelAssessments.filter(m => m.approach === 'One-piece'),
    'Piecewise': allModelAssessments.filter(m => m.approach === 'Piecewise'),
    'Spline': allModelAssessments.filter(m => m.approach === 'Spline')
  };

  // Build comprehensive prompt
  const prompt = `${NICE_DSU_TSD_14_PRINCIPLES}

${NICE_DSU_TSD_21_PRINCIPLES}

You are synthesizing survival model analysis for an HTA submission.
Total models analyzed: ${allModelAssessments.length}

## RAG CONTEXT (Methodology & Benchmarks)

${ragContext}

## MODEL SUMMARY BY ARM

### Chemotherapy Arm
${buildModelSummaryTable(allModelAssessments, 'chemo')}

### Pembrolizumab Arm
${buildModelSummaryTable(allModelAssessments, 'pembro')}

## MODEL DECISIONS (Pre-computed by Vision + Reasoning)

**Base Case Candidates (${baseCaseModels.length}):** ${baseCaseModels.map(m => `${m.distribution} (${m.arm})`).join(', ') || 'None'}

**Scenario Candidates (${scenarioModels.length}):** ${scenarioModels.map(m => `${m.distribution} (${m.arm})`).join(', ') || 'None'}

**Screened Out (${screenedOutModels.length}):** ${screenedOutModels.map(m => `${m.distribution} (${m.arm})`).join(', ') || 'None'}

## PH TESTING RESULTS
${phTestResults ? `
- Schoenfeld p-value: ${phTestResults.schoenfeld_pvalue.toFixed(4)}
- Chow test p-value: ${phTestResults.chow_test_pvalue.toFixed(4)}
- Log-rank p-value: ${phTestResults.logrank_pvalue.toFixed(4)}
- Decision: ${phTestResults.decision}
- Rationale: ${phTestResults.rationale}
${phTestResults.crossing_detected ? `⚠️ **Curve Crossing Detected at t=${phTestResults.crossing_time?.toFixed(1)} months**` : ''}
` : 'Not available'}

## RED FLAGS ACROSS MODELS
${allModelAssessments.flatMap(m => (m.red_flags || []).map(f => `- ${m.distribution}: ${f}`)).join('\n') || 'No critical red flags identified'}

## DETAILED REASONING SUMMARIES

${allModelAssessments.map(m => `
### ${m.distribution || m.approach} (${m.arm})
${m.reasoning_summary}
`).join('\n')}

---

## OUTPUT REQUIREMENTS (3000 words)

Generate a comprehensive synthesis report with the following structure:

### 1. EXECUTIVE SUMMARY (300 words)
- Key findings overview
- Primary recommendation for each arm
- Critical uncertainties

### 2. PROPORTIONAL HAZARDS ASSESSMENT (200 words)
- Interpret PH test results
- Justify separate/pooled modeling decision
- Cite TSD14 guidance from RAG context

### 3. WITHIN-APPROACH COMPARISON (600 words)

**One-piece Parametric (${byApproach['One-piece'].length} models):**
- Best performers per arm
- Common issues observed
- Ranking rationale

**Piecewise (${byApproach['Piecewise'].length} models):**
- Improvement over one-piece?
- Cutpoint appropriateness
- Ranking rationale

**Spline (${byApproach['Spline'].length} models):**
- Flexibility benefits
- Overfitting concerns
- Ranking rationale

### 4. CROSS-APPROACH COMPARISON (400 words)
- Statistical fit comparison (AIC caveats)
- Extrapolation plausibility comparison
- Clinical appropriateness
- HTA reviewer perspective

### 5. PRIMARY RECOMMENDATIONS (500 words)

**Chemotherapy Arm Base Case:**
- Selected model and distribution
- Fit justification
- Extrapolation justification
- Benchmark alignment

**Pembrolizumab Arm Base Case:**
- Selected model and distribution
- Fit justification
- Extrapolation justification
- Benchmark alignment

### 6. SCENARIO ANALYSIS (400 words)
- Conservative scenario (pessimistic extrapolation)
- Optimistic scenario
- Structural sensitivity (alternative approach)
- When to use each scenario

### 7. UNCERTAINTIES & HTA STRATEGY (400 words)
- Key areas of disagreement between models
- Recommendations for ERG/committee
- Suggested presentation format
- Value of information considerations

### 8. SUMMARY TABLE
Include a formatted markdown table with:
| Arm | Base Case | Rationale | Scenario 1 | Scenario 2 |

---

FORMATTING REQUIREMENTS:
- Use proper markdown headings (##, ###)
- Use bullet points for lists
- Bold key terms and model names
- Include the summary table at the end
- Cite TSD14/TSD21 where relevant (from RAG context)
- No raw asterisks - format properly`;

  const messages = [new HumanMessage({ content: prompt })];
  const response = await llm.invoke(messages);
  let content = response.content as string;

  // Format the markdown output
  content = formatMarkdown(content);

  // Extract structured components
  const within_approach_rankings = extractApproachRankings(content);
  const cross_approach_comparison = extractCrossApproach(content);
  const primary_recommendation = extractSection(content, 'PRIMARY RECOMMENDATION', 'SCENARIO ANALYSIS');
  const sensitivity_recommendations = extractSensitivityRecommendations(content);
  const key_uncertainties = extractSection(content, 'UNCERTAINTIES', 'SUMMARY TABLE');
  const hta_strategy = extractSection(content, 'HTA STRATEGY', 'SUMMARY');

  // Estimate token usage
  const inputTokens = Math.ceil(prompt.length / 4);
  const outputTokens = Math.ceil(content.length / 4);
  const cost = estimateCost('anthropic', inputTokens, outputTokens);

  return {
    within_approach_rankings,
    cross_approach_comparison,
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
  const startIdx = text.toLowerCase().indexOf(startMarker.toLowerCase());
  if (startIdx === -1) return '';

  const endIdx = endMarker ? text.toLowerCase().indexOf(endMarker.toLowerCase(), startIdx) : text.length;
  if (endIdx === -1) return text.substring(startIdx);

  return text.substring(startIdx, endIdx).trim();
}

function extractApproachRankings(text: string): Record<string, unknown> {
  const rankings: Record<string, unknown> = {};
  
  const approaches = ['One-piece', 'Piecewise', 'Spline'];
  for (const approach of approaches) {
    const section = extractSection(text, `**${approach}`, '**');
    if (section) {
      rankings[approach] = section;
    }
  }
  
  return rankings;
}

function extractCrossApproach(text: string): Record<string, unknown> {
  const section = extractSection(text, 'CROSS-APPROACH COMPARISON', 'PRIMARY RECOMMENDATION');
  return { summary: section };
}

function extractSensitivityRecommendations(text: string): Array<{ model_id: string; rationale: string }> {
  const section = extractSection(text, 'SCENARIO ANALYSIS', 'UNCERTAINTIES');
  const recommendations: Array<{ model_id: string; rationale: string }> = [];

  // Look for scenario patterns
  const conservativeMatch = section.match(/conservative[:\s]+([^.]+)/i);
  if (conservativeMatch) {
    recommendations.push({
      model_id: 'conservative',
      rationale: conservativeMatch[1].trim()
    });
  }

  const optimisticMatch = section.match(/optimistic[:\s]+([^.]+)/i);
  if (optimisticMatch) {
    recommendations.push({
      model_id: 'optimistic',
      rationale: optimisticMatch[1].trim()
    });
  }

  const structuralMatch = section.match(/structural[:\s]+([^.]+)/i);
  if (structuralMatch) {
    recommendations.push({
      model_id: 'structural',
      rationale: structuralMatch[1].trim()
    });
  }

  return recommendations;
}


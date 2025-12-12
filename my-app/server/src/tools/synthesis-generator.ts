import { createReasoningLLM, estimateCost } from '../lib/llm';
import { HumanMessage } from '@langchain/core/messages';
import { NICE_DSU_TSD_14_PRINCIPLES, NICE_DSU_TSD_21_PRINCIPLES } from '../lib/nice-guidelines';
import { getRAGService, getSimpleRAGContext } from '../lib/rag-service';
import { formatMarkdown } from '../lib/markdown-formatter';
import type { ChowTestResult } from '../services/python-service';
import path from 'path';
import fs from 'fs';

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
  // Plot data for best models
  plots?: {
    short_term_base64?: string;
    long_term_base64?: string;
  };
}

/**
 * RAG source for citations
 */
interface RAGSource {
  id: string;
  source: string;
  shortName: string;
  fullName: string;
}

/**
 * Extract short name from source filename
 */
function getShortSourceName(source: string): string {
  // Extract TSD number or meaningful short name
  if (source.includes('TSD14')) return 'TSD14';
  if (source.includes('TSD16')) return 'TSD16';
  if (source.includes('TSD19')) return 'TSD19';
  if (source.includes('TSD21')) return 'TSD21';
  if (source.includes('benchmark')) return 'Benchmarks';
  if (source.includes('NEJM')) return 'NEJM';
  // Default to filename without extension
  return source.replace(/\.pdf|\.md/g, '').substring(0, 20);
}

/**
 * Get full document title
 */
function getFullSourceTitle(source: string): string {
  if (source.includes('TSD14')) return 'NICE DSU TSD14: Survival Analysis for Economic Evaluation';
  if (source.includes('TSD16')) return 'NICE DSU TSD16: Treatment Switching Adjustments';
  if (source.includes('TSD19')) return 'NICE DSU TSD19: Partitioned Survival Analysis';
  if (source.includes('TSD21')) return 'NICE DSU TSD21: Flexible Methods for Survival Analysis';
  if (source.includes('benchmark')) return 'External Survival Benchmarks';
  if (source.includes('NEJM')) return 'NEJM Clinical Trial Publication';
  return source;
}

/**
 * Get comprehensive RAG context for synthesis with source tracking
 */
async function getSynthesisRAGContext(indication?: string): Promise<{ context: string; sources: RAGSource[] }> {
  const sources: RAGSource[] = [];
  let sourceId = 1;
  
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
        const shortName = getShortSourceName(result.source);
        const existingSource = sources.find(s => s.shortName === shortName);
        
        if (!existingSource) {
          sources.push({
            id: String(sourceId++),
            source: result.source,
            shortName,
            fullName: getFullSourceTitle(result.source)
          });
        }
        
        context += `**[${shortName}]**\n${result.content}\n\n`;
      }
    }
    
    if (benchmarkResults.length > 0) {
      context += '\n## External Benchmark Data\n\n';
      for (const result of benchmarkResults) {
        const shortName = getShortSourceName(result.source);
        const existingSource = sources.find(s => s.shortName === shortName);
        
        if (!existingSource) {
          sources.push({
            id: String(sourceId++),
            source: result.source,
            shortName,
            fullName: getFullSourceTitle(result.source)
          });
        }
        
        context += `**[${shortName}]**\n${result.content}\n\n`;
      }
    }
    
    return { context, sources };
  } catch (error) {
    console.warn('[SynthesisGenerator] RAG query failed, using fallback:', error);
    
    // Fallback to simple file-based context
    try {
      const ragDir = path.join(process.cwd(), 'data', 'rag_docs');
      const simpleContext = await getSimpleRAGContext(ragDir, 'TSD survival model selection');
      return { 
        context: `## Methodology Context\n\n${simpleContext}`,
        sources: [{ id: '1', source: 'TSD14', shortName: 'TSD14', fullName: 'NICE DSU TSD14' }]
      };
    } catch {
      return { context: '', sources: [] };
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
 * Normalize approach name for case-insensitive comparison
 */
function normalizeApproach(approach: string): string {
  return approach.toLowerCase().replace(/[-_\s]/g, '');
}

/**
 * Build comparison table for a specific approach
 */
function buildApproachComparisonTable(models: ModelAssessment[], approach: string): string {
  const normalizedApproach = normalizeApproach(approach);
  const approachModels = models
    .filter(m => normalizeApproach(m.approach) === normalizedApproach)
    .sort((a, b) => a.aic - b.aic);
  
  if (approachModels.length === 0) return `*No ${approach} models available*`;
  
  let table = `### ${approach} Models Comparison\n\n`;
  table += '| Model | Arm | AIC | BIC | Fit Score | Extrap Score | Recommendation |\n';
  table += '|-------|-----|-----|-----|-----------|--------------|----------------|\n';
  
  for (const m of approachModels) {
    const distribution = m.distribution || 'N/A';
    const armLabel = m.arm === 'chemo' ? 'Chemo' : 'Pembro';
    table += `| ${distribution} | ${armLabel} | ${m.aic.toFixed(2)} | ${m.bic.toFixed(2)} | ${m.vision_scores.short_term}/10 | ${m.vision_scores.long_term}/10 | ${m.recommendation || 'TBD'} |\n`;
  }
  
  return table;
}

/**
 * Build all three comparison tables
 */
function buildAllComparisonTables(models: ModelAssessment[]): string {
  let tables = '## Statistical Comparison Tables\n\n';
  tables += buildApproachComparisonTable(models, 'One-piece') + '\n\n';
  tables += buildApproachComparisonTable(models, 'Piecewise') + '\n\n';
  tables += buildApproachComparisonTable(models, 'Spline') + '\n\n';
  return tables;
}

/**
 * Generate references section from RAG sources with proper academic formatting
 */
function generateReferencesSection(sources: RAGSource[]): string {
  if (sources.length === 0) return '';
  
  let refs = '\n\n---\n\n## References\n\n';
  refs += '*The following sources were consulted during this analysis:*\n\n';
  
  for (const source of sources) {
    // Format with citation number, italicized title, and description
    const url = getSourceUrl(source.source);
    if (url) {
      refs += `**[${source.id}]** *${source.fullName}* — [View Document](${url})\n\n`;
    } else {
      refs += `**[${source.id}]** *${source.fullName}*\n\n`;
    }
  }
  
  refs += '\n*Note: Citations marked with [n] correspond to the reference numbers above.*\n';
  return refs;
}

/**
 * Get URL for known sources
 */
function getSourceUrl(source: string): string | null {
  if (source.includes('TSD14')) return 'https://www.sheffield.ac.uk/nice-dsu/tsds/survival-analysis';
  if (source.includes('TSD16')) return 'https://www.sheffield.ac.uk/nice-dsu/tsds/treatment-switching';
  if (source.includes('TSD19')) return 'https://www.sheffield.ac.uk/nice-dsu/tsds/partitioned-survival';
  if (source.includes('TSD21')) return 'https://www.sheffield.ac.uk/nice-dsu/tsds/flexible-survival';
  if (source.includes('KEYNOTE') || source.includes('NEJM')) return 'https://www.nejm.org/doi/full/10.1056/NEJMoa1606774';
  return null;
}

/**
 * Model assessment data extended with diagnostic plots
 */
interface ExtendedModelAssessment extends ModelAssessment {
  diagnosticPlots?: {
    log_cumulative_hazard?: string;  // base64
    cumulative_hazard?: string;       // base64
  };
}

/**
 * Generate embedded plots section for base case models
 * Includes survival extrapolation plots and diagnostic plots
 */
function generatePlotsSection(baseCaseModels: ModelAssessment[], diagnosticPlots?: { 
  log_cumulative_hazard?: string; 
  cumulative_hazard?: string;
  schoenfeld?: string;
  ipd_reconstruction?: {
    chemo?: string;  // base64 plot
    pembro?: string; // base64 plot
  };
  ipd_km_plot?: string;  // Combined KM plot from IPD data (for demo data)
}): string {
  let plotsSection = '\n\n---\n\n## Model Diagnostic and Extrapolation Plots\n\n';
  plotsSection += '*Visual assessment of model fit and extrapolation behavior*\n\n';
  
  // Add diagnostic plots first (if available)
  if (diagnosticPlots) {
    if (diagnosticPlots.log_cumulative_hazard) {
      plotsSection += '### Log-Cumulative Hazard Plot\n\n';
      plotsSection += '*Used to assess proportional hazards assumption and guide distribution selection. ';
      plotsSection += 'Parallel lines suggest PH holds; diverging lines indicate time-varying hazard ratios.*\n\n';
      plotsSection += `![Log-Cumulative Hazard](data:image/png;base64,${diagnosticPlots.log_cumulative_hazard})\n\n`;
    }
    
    if (diagnosticPlots.cumulative_hazard) {
      plotsSection += '### Cumulative Hazard Plot\n\n';
      plotsSection += '*Cumulative hazard over time for each arm. Linear shape suggests exponential model; ';
      plotsSection += 'curvature indicates Weibull or other flexible distributions may be more appropriate.*\n\n';
      plotsSection += `![Cumulative Hazard](data:image/png;base64,${diagnosticPlots.cumulative_hazard})\n\n`;
    }
    
    if (diagnosticPlots.schoenfeld) {
      plotsSection += '### Schoenfeld Residuals Plot\n\n';
      plotsSection += '*Assessment of proportional hazards assumption over time.*\n\n';
      plotsSection += `![Schoenfeld Residuals](data:image/png;base64,${diagnosticPlots.schoenfeld})\n\n`;
    }
    
    // Add IPD reconstruction validation plots
    if (diagnosticPlots.ipd_reconstruction) {
      plotsSection += '### IPD Reconstruction Validation\n\n';
      plotsSection += '*Comparison of original Kaplan-Meier curves with reconstructed curves from individual patient data. ';
      plotsSection += 'These plots validate the accuracy of the IPD reconstruction process used to generate the survival analysis data.*\n\n';
      
      if (diagnosticPlots.ipd_reconstruction.chemo) {
        plotsSection += '#### Chemotherapy Arm\n\n';
        plotsSection += `![IPD Reconstruction - Chemotherapy](data:image/png;base64,${diagnosticPlots.ipd_reconstruction.chemo})\n\n`;
      }
      
      if (diagnosticPlots.ipd_reconstruction.pembro) {
        plotsSection += '#### Pembrolizumab Arm\n\n';
        plotsSection += `![IPD Reconstruction - Pembrolizumab](data:image/png;base64,${diagnosticPlots.ipd_reconstruction.pembro})\n\n`;
      }
    }
    
    // Add IPD KM plot (for demo data)
    if (diagnosticPlots.ipd_km_plot) {
      plotsSection += '### IPD Data Kaplan-Meier Curves\n\n';
      plotsSection += '*Kaplan-Meier survival curves generated from the reconstructed individual patient data. ';
      plotsSection += 'This plot shows the survival experience of both treatment arms based on the IPD data used for this analysis.*\n\n';
      plotsSection += `![IPD KM Curves](data:image/png;base64,${diagnosticPlots.ipd_km_plot})\n\n`;
    }
  }
  
  // Add base case model plots
  const modelsWithPlots = baseCaseModels.filter(m => m.plots?.short_term_base64 || m.plots?.long_term_base64);
  
  if (modelsWithPlots.length > 0) {
    plotsSection += '### Base Case Model Extrapolations\n\n';
    
    for (const model of modelsWithPlots) {
      const armLabel = model.arm === 'chemo' ? 'Chemotherapy' : 'Pembrolizumab';
      plotsSection += `#### ${armLabel} — ${model.distribution || model.approach}\n\n`;
      
      if (model.plots?.short_term_base64) {
        plotsSection += `**Short-term Fit (Observed Period)**\n\n`;
        plotsSection += `![${armLabel} Short-term Fit](data:image/png;base64,${model.plots.short_term_base64})\n\n`;
      }
      
      if (model.plots?.long_term_base64) {
        plotsSection += `**Long-term Extrapolation**\n\n`;
        plotsSection += `![${armLabel} Long-term Extrapolation](data:image/png;base64,${model.plots.long_term_base64})\n\n`;
      }
    }
  }
  
  if (!diagnosticPlots && modelsWithPlots.length === 0) {
    return ''; // No plots to show
  }
  
  return plotsSection;
}

/**
 * Load clinical context for cutpoint justification
 */
function loadCutpointClinicalContext(): string {
  try {
    // Try multiple possible paths (development vs production)
    const possiblePaths = [
      path.join(process.cwd(), 'data', 'rag_docs', 'cutpoint_clinical_context.md'),
      '/app/data/rag_docs/cutpoint_clinical_context.md',  // Docker/Railway
      path.join(__dirname, '..', 'data', 'rag_docs', 'cutpoint_clinical_context.md'),
    ];
    
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf-8');
      }
    }
    
    console.warn('[SynthesisGenerator] Clinical context file not found, using fallback');
    return '## Clinical Context\nNo clinical context available.';
  } catch (error) {
    console.error('[SynthesisGenerator] Error loading clinical context:', error);
    return '## Clinical Context\nError loading clinical context.';
  }
}

/**
 * Generate cutpoint justification using LLM
 */
export async function generateCutpointJustification(
  cutpointResults: { chemo: ChowTestResult; pembro: ChowTestResult }
): Promise<string> {
  const llm = createReasoningLLM();
  const clinicalContext = loadCutpointClinicalContext();
  
  // Format cutpoint analysis as JSON for the prompt
  const cutpointAnalysis = {
    chemotherapy: {
      arm: 'Chemotherapy',
      cutpoint_months: cutpointResults.chemo.cutpoint,
      cutpoint_weeks: cutpointResults.chemo.cutpoint_weeks,
      lrt_statistic: cutpointResults.chemo.lrt_statistic,
      lrt_pvalue: cutpointResults.chemo.lrt_pvalue,
      events_before_cutpoint: cutpointResults.chemo.n_events_pre,
      events_after_cutpoint: cutpointResults.chemo.n_events_post,
      patients_at_risk_before: cutpointResults.chemo.n_at_risk_pre,
      patients_at_risk_after: cutpointResults.chemo.n_at_risk_post,
    },
    pembrolizumab: {
      arm: 'Pembrolizumab',
      cutpoint_months: cutpointResults.pembro.cutpoint,
      cutpoint_weeks: cutpointResults.pembro.cutpoint_weeks,
      lrt_statistic: cutpointResults.pembro.lrt_statistic,
      lrt_pvalue: cutpointResults.pembro.lrt_pvalue,
      events_before_cutpoint: cutpointResults.pembro.n_events_pre,
      events_after_cutpoint: cutpointResults.pembro.n_events_post,
      patients_at_risk_before: cutpointResults.pembro.n_at_risk_pre,
      patients_at_risk_after: cutpointResults.pembro.n_at_risk_post,
    }
  };

  const prompt = `Generate a 2-paragraph justification for the piecewise model cutpoint for each treatment arm. Each justification should be 120-150 words total.

---

## Clinical Context

${clinicalContext}

---

## Statistical Analysis Results

${JSON.stringify(cutpointAnalysis, null, 2)}

---

## Output Requirements

Generate justification for each arm with a structure similar to this:

### Chemotherapy: ${cutpointResults.chemo.cutpoint_weeks.toFixed(0)} weeks (${cutpointResults.chemo.cutpoint.toFixed(1)} months)

**Paragraph 1 (3-4 sentences):**
- Open with cutpoint selection statement
- Cite Chow test result (LRT statistic, p-value)
- Explain relationship to PFS median (before/after, by how much)
- State key clinical rationale (crossover for chemo, responder plateau for pembro)

**Paragraph 2 (2-3 sentences):**
- Explain why timing aligns with treatment mechanism
- Note events distribution (adequate/excellent for fitting)
- Brief robustness statement (if results stable across ±4 week variation)

### Pembrolizumab: ${cutpointResults.pembro.cutpoint_weeks.toFixed(0)} weeks (${cutpointResults.pembro.cutpoint.toFixed(1)} months)

(Same structure as above)

---

## Style Guidelines
- Use precise numerical values from the statistical analysis
- Technical but readable prose (no bullet points in output)
- Reference biological mechanisms from clinical context
- Keep each arm's justification to 120-150 words
- Professional regulatory tone`;

  const messages = [new HumanMessage({ content: prompt })];
  const response = await llm.invoke(messages);
  let content = response.content as string;
  
  // Format and return
  return formatMarkdown(content);
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
    diagnostic_plots?: {
      log_cumulative_hazard?: string;
      cumulative_hazard?: string;
      schoenfeld?: string;
    };
  },
  cutpointResults?: {
    chemo: ChowTestResult;
    pembro: ChowTestResult;
  }
): Promise<SynthesisReportResult> {
  const llm = createReasoningLLM();

  // Get RAG context with source tracking
  const { context: ragContext, sources: ragSources } = await getSynthesisRAGContext();

  // Categorize models
  const baseCaseModels = allModelAssessments.filter(m => m.recommendation === 'Base Case');
  const scenarioModels = allModelAssessments.filter(m => m.recommendation === 'Scenario');
  const screenedOutModels = allModelAssessments.filter(m => m.recommendation === 'Screen Out');

  // Group by approach (case-insensitive)
  const byApproach = {
    'One-piece': allModelAssessments.filter(m => normalizeApproach(m.approach) === 'onepiece'),
    'Piecewise': allModelAssessments.filter(m => normalizeApproach(m.approach) === 'piecewise'),
    'Spline': allModelAssessments.filter(m => normalizeApproach(m.approach) === 'spline')
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
- Use proper markdown headings: ## for main sections, ### for subsections, #### for sub-subsections
- Do NOT use plain **Header** format - always use proper heading syntax (## Header)
- Use bullet points (- ) for lists, not asterisks
- Bold **key terms** and model names within sentences
- Italicize *citations* and *document titles*
- Include the summary table at the end
- CITE ALL SOURCES: Use [n] format to cite RAG sources (e.g., "as recommended in TSD14 [1]")
- Every major claim should have a citation from the RAG context
- For benchmark comparisons, cite the source of the benchmark data
- Ensure all tables have proper header separators (|---|)
- Use > blockquotes for important recommendations or warnings

CITATION EXAMPLES:
- "The NICE DSU recommends visual assessment of model fit [1]"
- "According to TSD21, flexible models should be considered when... [2]"
- "External benchmarks suggest 5-year OS of approximately X% [3]"

OUTPUT QUALITY:
- Professional, regulatory-ready prose
- No placeholder text or TODO markers
- Complete sentences and paragraphs
- Clear logical flow between sections`;

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

  // Append the three comparison tables
  content += '\n\n---\n\n';
  content += buildAllComparisonTables(allModelAssessments);

  // Append cutpoint justification if available
  if (cutpointResults) {
    try {
      const cutpointJustification = await generateCutpointJustification(cutpointResults);
      content += '\n\n---\n\n';
      content += '## Piecewise Models Cutpoint Analysis\n\n';
      content += cutpointJustification;
    } catch (error) {
      console.error('[SynthesisGenerator] Error generating cutpoint justification:', error);
      // Continue without cutpoint justification if it fails
    }
  }

  // Append diagnostic plots and base case model plots
  const plotsSection = generatePlotsSection(baseCaseModels, phTestResults?.diagnostic_plots);
  if (plotsSection) {
    content += plotsSection;
  }

  // Append references section
  const referencesSection = generateReferencesSection(ragSources);
  if (referencesSection) {
    content += referencesSection;
  }

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


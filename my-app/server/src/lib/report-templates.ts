/**
 * Report Templates for Survival Analysis
 * 
 * Provides structured templates for model assessments, summaries, and synthesis reports.
 * Embeds plots and tables in a consistent format.
 */

import { formatMarkdown, embedImage } from './markdown-formatter';

/**
 * Model metadata for reports
 */
export interface ModelReportData {
  name: string;
  distribution: string;
  approach: 'One-piece' | 'Piecewise' | 'Spline';
  arm: string;
  endpoint: string;
  
  // Statistical measures
  aic: number;
  bic: number;
  aicRank: number;
  bicRank: number;
  
  // Vision scores
  fitScore: number;
  extrapScore: number;
  
  // Recommendation
  recommendation: 'Base Case' | 'Scenario' | 'Screen Out';
  
  // Detailed assessment
  assessment: string;
  
  // Extracted predictions
  predictions?: {
    year1?: number;
    year2?: number;
    year5?: number;
    year10?: number;
  };
  
  // Benchmark comparison
  benchmarkDeviation?: {
    year5?: number;
    year10?: number;
  };
  
  // Plots (base64)
  fitPlot?: string;
  extrapolationPlot?: string;
}

/**
 * Summary statistics for all models
 */
export interface ModelSummaryStats {
  models: Array<{
    name: string;
    aic: number;
    bic: number;
    fitScore: number;
    extrapScore: number;
    recommendation: string;
  }>;
}

/**
 * Generate recommendation badge with icon
 */
function getRecommendationBadge(rec: 'Base Case' | 'Scenario' | 'Screen Out'): string {
  const badges: Record<string, string> = {
    'Base Case': '✅ **Base Case**',
    'Scenario': '⚠️ **Scenario Analysis**',
    'Screen Out': '❌ **Screen Out**'
  };
  return badges[rec] || rec;
}

/**
 * Generate deviation indicator
 */
function getDeviationIndicator(deviation: number): string {
  if (deviation < 50) return '🟢 Plausible';
  if (deviation < 100) return '🟡 Concern';
  if (deviation < 200) return '🟠 High Concern';
  return '🔴 Implausible';
}

/**
 * Generate model assessment report
 */
export function generateModelReport(data: ModelReportData): string {
  const predictionRows = data.predictions ? `
| Timepoint | Predicted Survival |
| --- | --- |
${data.predictions.year1 !== undefined ? `| 1 Year | ${(data.predictions.year1 * 100).toFixed(1)}% |` : ''}
${data.predictions.year2 !== undefined ? `| 2 Year | ${(data.predictions.year2 * 100).toFixed(1)}% |` : ''}
${data.predictions.year5 !== undefined ? `| 5 Year | ${(data.predictions.year5 * 100).toFixed(1)}% |` : ''}
${data.predictions.year10 !== undefined ? `| 10 Year | ${(data.predictions.year10 * 100).toFixed(1)}% |` : ''}
`.trim() : '';

  const benchmarkSection = data.benchmarkDeviation ? `
### Benchmark Comparison

${data.benchmarkDeviation.year5 !== undefined ? 
  `- **5-Year Deviation:** ${data.benchmarkDeviation.year5.toFixed(0)}% ${getDeviationIndicator(data.benchmarkDeviation.year5)}` : ''}
${data.benchmarkDeviation.year10 !== undefined ? 
  `- **10-Year Deviation:** ${data.benchmarkDeviation.year10.toFixed(0)}% ${getDeviationIndicator(data.benchmarkDeviation.year10)}` : ''}
` : '';

  const plotSection = (data.fitPlot || data.extrapolationPlot) ? `
### Visual Assessment

${data.fitPlot ? `
#### Model Fit

${embedImage(data.fitPlot, `${data.name} Model Fit`)}
` : ''}

${data.extrapolationPlot ? `
#### Extrapolation

${embedImage(data.extrapolationPlot, `${data.name} Extrapolation`)}
` : ''}
` : '';

  const template = `
## ${data.name}

**${data.distribution}** | ${data.approach} | ${data.arm} - ${data.endpoint}

${getRecommendationBadge(data.recommendation)}

### Statistical Summary

| Metric | Value | Rank |
| --- | --- | --- |
| AIC | ${data.aic.toFixed(2)} | #${data.aicRank} |
| BIC | ${data.bic.toFixed(2)} | #${data.bicRank} |
| Fit Score | ${data.fitScore}/10 | - |
| Extrapolation Score | ${data.extrapScore}/10 | - |

${predictionRows ? `
### Predicted Survival

${predictionRows}
` : ''}

${benchmarkSection}

### Assessment

${data.assessment}

${plotSection}

---
`;

  return formatMarkdown(template);
}

/**
 * Generate summary table for all models
 */
export function generateSummaryTable(stats: ModelSummaryStats): string {
  const rows = stats.models
    .sort((a, b) => a.aic - b.aic)
    .map((m, i) => 
      `| ${m.name} | ${m.aic.toFixed(2)} | ${m.bic.toFixed(2)} | ${m.fitScore}/10 | ${m.extrapScore}/10 | ${m.recommendation} |`
    )
    .join('\n');

  const template = `
## Model Comparison Summary

| Model | AIC | BIC | Fit | Extrapolation | Recommendation |
| --- | --- | --- | --- | --- | --- |
${rows}

`;

  return formatMarkdown(template);
}

/**
 * Generate synthesis report header
 */
export function generateSynthesisHeader(
  endpoint: string,
  arm: string,
  totalModels: number,
  baseCaseModels: string[],
  scenarioModels: string[],
  screenedOutModels: string[]
): string {
  const template = `
# Survival Model Selection: ${endpoint} - ${arm}

## Executive Summary

**Total Models Evaluated:** ${totalModels}

| Category | Count | Models |
| --- | --- | --- |
| ✅ Base Case | ${baseCaseModels.length} | ${baseCaseModels.join(', ') || 'None'} |
| ⚠️ Scenario Analysis | ${scenarioModels.length} | ${scenarioModels.join(', ') || 'None'} |
| ❌ Screen Out | ${screenedOutModels.length} | ${screenedOutModels.join(', ') || 'None'} |

---
`;

  return formatMarkdown(template);
}

/**
 * Generate approach-specific section for synthesis
 */
export function generateApproachSection(
  approach: 'One-piece' | 'Piecewise' | 'Spline',
  models: ModelReportData[],
  synthesisText: string
): string {
  const approachDescriptions: Record<string, string> = {
    'One-piece': 'Standard parametric models fit to entire observed period',
    'Piecewise': 'Hybrid approach: KM data followed by parametric extrapolation',
    'Spline': 'Flexible spline-based models capturing complex hazard patterns'
  };

  const modelTable = models.length > 0 ? `
| Distribution | AIC | Fit | Extrap | Recommendation |
| --- | --- | --- | --- | --- |
${models.map(m => 
  `| ${m.distribution} | ${m.aic.toFixed(2)} | ${m.fitScore}/10 | ${m.extrapScore}/10 | ${m.recommendation} |`
).join('\n')}
` : '*No models evaluated for this approach*';

  const template = `
## ${approach} Models

*${approachDescriptions[approach]}*

${modelTable}

### Analysis

${synthesisText}

---
`;

  return formatMarkdown(template);
}

/**
 * Generate final recommendations section
 */
export function generateRecommendations(
  primaryRecommendation: string,
  primaryRationale: string,
  alternatives: Array<{ model: string; rationale: string }>,
  uncertainties: string[],
  additionalNotes?: string
): string {
  const alternativesList = alternatives.length > 0 
    ? alternatives.map(a => `- **${a.model}:** ${a.rationale}`).join('\n')
    : '*No alternative models recommended*';

  const uncertaintiesList = uncertainties.length > 0
    ? uncertainties.map(u => `- ${u}`).join('\n')
    : '*No major uncertainties identified*';

  const template = `
## Recommendations

### Primary Recommendation

**${primaryRecommendation}**

${primaryRationale}

### Alternative Scenario Models

${alternativesList}

### Key Uncertainties

${uncertaintiesList}

${additionalNotes ? `
### Additional Notes

${additionalNotes}
` : ''}

---

*Report generated by Survival Analysis Agent*
`;

  return formatMarkdown(template);
}

/**
 * Generate complete synthesis report
 */
export function generateFullReport(
  endpoint: string,
  arm: string,
  models: ModelReportData[],
  synthesisContent: string,
  recommendations: {
    primary: { model: string; rationale: string };
    alternatives: Array<{ model: string; rationale: string }>;
    uncertainties: string[];
  }
): string {
  // Categorize models
  const baseCaseModels = models.filter(m => m.recommendation === 'Base Case').map(m => m.name);
  const scenarioModels = models.filter(m => m.recommendation === 'Scenario').map(m => m.name);
  const screenedOutModels = models.filter(m => m.recommendation === 'Screen Out').map(m => m.name);

  // Group by approach
  const byApproach = {
    'One-piece': models.filter(m => m.approach === 'One-piece'),
    'Piecewise': models.filter(m => m.approach === 'Piecewise'),
    'Spline': models.filter(m => m.approach === 'Spline')
  };

  let report = '';

  // Header
  report += generateSynthesisHeader(
    endpoint,
    arm,
    models.length,
    baseCaseModels,
    scenarioModels,
    screenedOutModels
  );

  // Summary table
  report += generateSummaryTable({
    models: models.map(m => ({
      name: m.name,
      aic: m.aic,
      bic: m.bic,
      fitScore: m.fitScore,
      extrapScore: m.extrapScore,
      recommendation: m.recommendation
    }))
  });

  // Synthesis content
  report += `\n## Detailed Analysis\n\n${synthesisContent}\n\n`;

  // Approach sections
  for (const [approach, approachModels] of Object.entries(byApproach)) {
    if (approachModels.length > 0) {
      report += generateApproachSection(
        approach as 'One-piece' | 'Piecewise' | 'Spline',
        approachModels,
        '' // Can add approach-specific synthesis here
      );
    }
  }

  // Recommendations
  report += generateRecommendations(
    recommendations.primary.model,
    recommendations.primary.rationale,
    recommendations.alternatives,
    recommendations.uncertainties
  );

  return report;
}

/**
 * Generate per-model detailed report (for individual model pages)
 */
export function generateDetailedModelReport(
  data: ModelReportData,
  ragContext?: string
): string {
  let report = generateModelReport(data);

  if (ragContext) {
    report += `
### Methodological Context

*From NICE Technical Support Documents:*

${ragContext}
`;
  }

  return formatMarkdown(report);
}


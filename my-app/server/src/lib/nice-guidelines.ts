/**
 * NICE DSU Technical Support Documents 14 & 21 Knowledge Base
 * 
 * This module contains key principles and requirements from:
 * - TSD 14: Undertaking survival analysis for economic evaluations alongside clinical trials
 * - TSD 21: Flexible parametric survival models for use in economic evaluations
 */

export const NICE_DSU_TSD_14_PRINCIPLES = `
NICE DSU Technical Support Document 14: Key Principles

1. SEPARATE ARM MODELING
   - When proportional hazards assumption is violated, separate models should be fitted for each treatment arm
   - This is critical for KEYNOTE-024 and similar trials where PH assumption does not hold
   - Pooled models should only be used when PH assumption is satisfied

2. MODEL SELECTION CRITERIA
   - Visual fit assessment is as important as statistical fit measures
   - AIC/BIC should only be compared WITHIN the same modeling approach (not across approaches)
   - External validation against population data (e.g., SEER) is essential
   - Clinical plausibility of long-term extrapolations must be assessed

3. EXTRAPOLATION REQUIREMENTS
   - Models must extrapolate beyond trial follow-up period
   - Extrapolations should be validated against external data sources
   - Survival milestones (1-year, 2-year, 5-year, 10-year, 20-year) should be reported
   - Uncertainty in extrapolations must be clearly communicated

4. TRANSPARENCY REQUIREMENTS
   - All fitted models must be reported, not just the selected base case
   - Rationale for model selection must be clearly documented
   - Sensitivity analyses using alternative models are mandatory
   - Model assumptions and limitations must be explicitly stated
`;

export const NICE_DSU_TSD_21_PRINCIPLES = `
NICE DSU Technical Support Document 21: Flexible Parametric Models

1. ROYSTON-PARMAR SPLINES
   - Flexible parametric models using restricted cubic splines
   - Three scales: hazard, odds, and normal
   - Knot placement at quantiles of log(time)
   - 1-3 internal knots typically sufficient

2. PIECEWISE MODELS
   - Useful when hazard function changes over time
   - Cutpoint detection via statistical tests (e.g., Chow test)
   - KM curve used directly up to cutpoint
   - Parametric model fitted only for post-cutpoint period
   - Continuity at cutpoint must be ensured

3. MODEL COMPARISON
   - Never compare AIC/BIC across different modeling approaches
   - AIC/BIC only meaningful within same approach
   - Piecewise AIC/BIC refers to post-cutpoint portion only
   - Visual assessment critical for model selection

4. EXTERNAL VALIDATION
   - Compare extrapolations with population registry data
   - SEER data commonly used for cancer survival validation
   - Stage-specific comparisons essential
   - Long-term survival estimates must be clinically plausible
`;

export const NICE_DSU_EVALUATION_PROMPT = `
You are evaluating a survival analysis model for an HTA submission following NICE DSU TSD 14 & 21 guidelines.

Key evaluation criteria:
1. Statistical fit quality (within-approach comparison only)
2. Visual fit to observed data
3. Clinical plausibility of extrapolations
4. External validation against SEER or similar data
5. Methodological transparency
6. Compliance with NICE DSU requirements

For each model, assess:
- Whether proportional hazards assumption was tested
- Whether separate arm modeling was used when PH violated
- Quality of short-term fit (0-30 months)
- Plausibility of long-term extrapolation (up to 20 years)
- Comparison with external benchmarks
- Strengths and limitations
- Scenarios where model excels
- Key uncertainties

Remember: AIC/BIC comparisons are only valid within the same modeling approach (one-piece vs piecewise vs spline).
`;

export function getNICEComplianceChecklist(): string[] {
  return [
    'Proportional hazards assumption tested',
    'Separate arm modeling used when PH violated',
    'Multiple modeling approaches evaluated (one-piece, piecewise, spline)',
    'Visual fit assessment performed',
    'External validation against SEER or similar data',
    'Survival milestones reported (1-yr, 2-yr, 5-yr, 10-yr, 20-yr)',
    'AIC/BIC comparisons limited to within-approach only',
    'All fitted models documented',
    'Rationale for base case selection provided',
    'Sensitivity analyses with alternative models included',
    'Model assumptions and limitations explicitly stated',
    'Long-term extrapolations clinically plausible',
  ];
}

export function formatNICEComplianceReport(compliance: Record<string, boolean>): string {
  const checklist = getNICEComplianceChecklist();
  const report = ['NICE DSU TSD 14 & 21 Compliance Assessment:\n'];
  
  checklist.forEach((item, index) => {
    const status = compliance[item] ? '✓' : '✗';
    report.push(`${status} ${item}`);
  });
  
  const compliantCount = Object.values(compliance).filter(Boolean).length;
  const totalCount = checklist.length;
  report.push(`\nCompliance: ${compliantCount}/${totalCount} requirements met`);
  
  return report.join('\n');
}


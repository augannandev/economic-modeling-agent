import { createVisionLLM, estimateCost } from '../lib/llm';
import { HumanMessage } from '@langchain/core/messages';

/**
 * Extended Vision Assessment Result with detailed structured output
 */
export interface VisionAssessmentResult {
  // Core scores
  short_term_score: number; // 0-10 (fit quality)
  long_term_score: number; // 0-10 (extrapolation plausibility)

  // Period-based observations
  observations: {
    early: { // 0-6 months
      fit_quality: string;
      deviation_pattern: string;
      score: number; // 0-10
    };
    mid: { // 6-18 months
      fit_quality: string;
      deviation_pattern: string;
      score: number;
    };
    late: { // 18-30 months / observed range
      fit_quality: string;
      deviation_pattern: string;
      score: number;
    };
    extrapolation: { // Beyond observed
      trajectory: string;
      plausibility: string;
      concerns: string[];
    };
  };

  // Extracted predictions from the extrapolation plot
  extracted_predictions: {
    year1?: number; // Survival proportion 0-1
    year2?: number;
    year5?: number;
    year10?: number;
    year20?: number;
    median_survival_months?: number;
  };

  // Benchmark comparison (if RAG context provided)
  benchmark_comparison: {
    year5_deviation_pct?: number; // % deviation from benchmark
    year10_deviation_pct?: number;
    plausibility_rating: 'plausible' | 'concern' | 'high_concern' | 'implausible';
    notes: string;
  };

  // Approach-specific assessment
  approach_assessment: {
    distribution_appropriateness?: string; // One-piece
    hazard_pattern_capture?: string;
    km_portion_accuracy?: string; // Piecewise
    cutpoint_transition?: string;
    parametric_tail_fit?: string;
    knot_placement?: string; // Spline
    overfitting_risk?: string;
    extrapolation_stability?: string;
  };

  // Red flags
  red_flags: string[];

  // Summary
  strengths: string[];
  weaknesses: string[];

  // Recommendation
  recommendation: 'Base Case' | 'Scenario' | 'Screen Out';
  recommendation_rationale: string;

  // Token usage
  token_usage: {
    input: number;
    output: number;
    cost: number;
  };
}

/**
 * Model metadata for vision analysis
 */
export interface ModelMetadata {
  arm: string;
  endpoint: string;
  approach: 'One-piece' | 'Piecewise' | 'Spline';
  distribution?: string;
  aic?: number;
  bic?: number;
  aicRank?: number;
  knots?: number[]; // For spline models
  scale?: string; // hazard, odds, normal
  cutpoint?: number; // For piecewise models (months)
}

/**
 * Build approach-specific prompt section
 */
function getApproachGuidance(approach: 'One-piece' | 'Piecewise' | 'Spline', metadata: ModelMetadata): string {
  switch (approach) {
    case 'One-piece':
      return `
### ONE-PIECE MODEL CRITERIA
You are evaluating a standard parametric model fit to the entire observed period.

Key Considerations:
1. **Distribution Shape**: Is ${metadata.distribution || 'this distribution'} appropriate for the underlying hazard pattern?
   - Exponential: Constant hazard - rarely appropriate for cancer
   - Weibull: Monotonic hazard (increasing or decreasing)
   - Log-normal: Unimodal hazard, long right tail
   - Log-logistic: Unimodal hazard, potentially heavier tails
   - Gompertz: Increasing hazard, biological aging
   - Generalized Gamma: Flexible, can mimic many shapes

2. **Hazard Evidence**: Does the observed KM suggest the chosen distribution's hazard pattern?
   - Look for early plateau (suggests changing hazard)
   - Look for late acceleration (suggests increasing hazard)

3. **Theoretical Tail**: The ${metadata.distribution || 'distribution'} has specific tail properties:
   - Log-normal/log-logistic: Very long tails (may overestimate long-term survival)
   - Weibull/Gompertz: Faster tail decay (may underestimate if hazard plateaus)
`;

    case 'Piecewise':
      return `
### PIECEWISE MODEL CRITERIA
You are evaluating a hybrid model: observed KM data to cutpoint, then parametric extrapolation.
${metadata.cutpoint ? `Cutpoint: ${metadata.cutpoint} months` : ''}

Key Considerations:
1. **KM Portion Accuracy**: The model should EXACTLY match the KM curve up to the cutpoint
   - Any deviation before cutpoint indicates implementation error
   - Check for perfect overlay in the observed period

2. **Cutpoint Transition**: Is the transition from KM to parametric smooth?
   - Look for discontinuities or "kinks" at the cutpoint
   - Parametric portion should naturally continue the KM trajectory

3. **Parametric Tail Fit**: Does the parametric portion plausibly extend the observed pattern?
   - Consider remaining patients at risk at cutpoint
   - Hazard pattern should align with late observed data
`;

    case 'Spline':
      return `
### SPLINE MODEL CRITERIA
You are evaluating a flexible spline-based model with ${metadata.knots?.length || 'multiple'} knots.
${metadata.knots ? `Knot positions: ${metadata.knots.join(', ')} months` : ''}
${metadata.scale ? `Scale: ${metadata.scale}` : ''}

Key Considerations:
1. **Non-monotonic Hazard Capture**: Splines can capture complex hazard patterns
   - Early treatment effects followed by late progression
   - Multiple phases of risk

2. **Overfitting Risk**: Watch for artifacts
   - Wiggliness that doesn't reflect true biology
   - Unusual curvature between knots
   - Erratic behavior at data edges

3. **Beyond-Knot Stability**: Extrapolation beyond the last knot is critical
   - Model reverts to linear extrapolation (on scale)
   - Check if this produces plausible long-term survival
   - More knots = more flexibility but less stable extrapolation
`;
  }
}

/**
 * Analyze dual plots using Vision LLM with enhanced prompt
 */
export async function assessWithVisionLLM(
  shortTermPlotBase64: string,
  longTermPlotBase64: string,
  modelMetadata: ModelMetadata,
  ragContext?: string // Benchmark data from RAG
): Promise<VisionAssessmentResult> {
  const llm = createVisionLLM();

  const benchmarkSection = ragContext ? `
## EXTERNAL BENCHMARK CONTEXT
The following benchmark data is available for comparison:

${ragContext}

Use these benchmarks to:
- Compare extracted survival predictions
- Calculate deviation percentages
- Assess plausibility of extrapolation

Deviation Thresholds (Relative):
- <20% deviation: Plausible
- 20-50% deviation: Concern
- 50-100% deviation: High Concern
- >100% deviation: Implausible (Significantly wrong)
` : '';

  const approachGuidance = getApproachGuidance(modelMetadata.approach, modelMetadata);

  const prompt = `You are a senior health economist and survival analysis expert evaluating parametric survival models for an HTA submission to NICE. Your assessment will inform model selection.

## MODEL INFORMATION
- Treatment Arm: ${modelMetadata.arm}
- Endpoint: ${modelMetadata.endpoint}
- Modeling Approach: ${modelMetadata.approach}
${modelMetadata.distribution ? `- Distribution: ${modelMetadata.distribution}` : ''}
${modelMetadata.aic ? `- AIC: ${modelMetadata.aic.toFixed(2)} (Rank #${modelMetadata.aicRank || 'N/A'})` : ''}
${modelMetadata.bic ? `- BIC: ${modelMetadata.bic.toFixed(2)}` : ''}
${modelMetadata.cutpoint ? `- Cutpoint: ${modelMetadata.cutpoint} months` : ''}
${modelMetadata.knots ? `- Knots: ${modelMetadata.knots.join(', ')} months` : ''}

${approachGuidance}

${benchmarkSection}

## PLOT ASSESSMENT INSTRUCTIONS

You will analyze TWO plots:

### PLOT 1: Short-term Fit (Observed Data Range)
Systematically assess fit quality by period:

**Early Period (0-6 months):**
- Treatment initiation effects
- Early deaths/events
- Separation between treatment arms
- Expected: Most instability here

**Mid Period (6-18 months):**
- Stabilization of treatment effects
- Sustained benefit or convergence
- This is often the best-fit region

**Late Period (18-30 months or end of observed):**
- Maturity of data
- Fewer patients at risk
- Wide confidence intervals expected
- Check for model divergence from KM

### PLOT 2: Long-term Extrapolation (0-240 months / 20 years)
Extract approximate survival proportions at key timepoints by reading from the Y-axis:
- 1 year (12 months)
- 2 years (24 months)
- 5 years (60 months)
- 10 years (120 months)
- 20 years (240 months) if visible

Assess extrapolation plausibility:
- Does the curve approach 0% at a reasonable timepoint?
- Is long-term survival consistent with the disease biology?
- Compare to any benchmark data provided

## REQUIRED OUTPUT FORMAT

Provide your assessment as JSON with this EXACT structure:

\`\`\`json
{
  "short_term_score": <0-10>,
  "long_term_score": <0-10>,
  "observations": {
    "early": {
      "fit_quality": "<description of 0-6 month fit>",
      "deviation_pattern": "<systematic bias or random variation>",
      "score": <0-10>
    },
    "mid": {
      "fit_quality": "<description of 6-18 month fit>",
      "deviation_pattern": "<systematic bias or random variation>",
      "score": <0-10>
    },
    "late": {
      "fit_quality": "<description of 18+ month fit>",
      "deviation_pattern": "<systematic bias or random variation>",
      "score": <0-10>
    },
    "extrapolation": {
      "trajectory": "<description of long-term curve behavior>",
      "plausibility": "<assessment of biological plausibility>",
      "concerns": ["<concern 1>", "<concern 2>"]
    }
  },
  "extracted_predictions": {
    "year1": <0-1 survival proportion>,
    "year2": <0-1>,
    "year5": <0-1>,
    "year10": <0-1>,
    "year20": <0-1 or null if not visible>,
    "median_survival_months": <number or null>
  },
  "benchmark_comparison": {
    "year5_deviation_pct": <percentage deviation from benchmark or null>,
    "year10_deviation_pct": <percentage deviation or null>,
    "plausibility_rating": "<plausible|concern|high_concern|implausible>",
    "notes": "<comparison notes>"
  },
  "approach_assessment": {
    ${modelMetadata.approach === 'One-piece' ? `
    "distribution_appropriateness": "<assessment of distribution choice>",
    "hazard_pattern_capture": "<how well hazard pattern is captured>"` : ''}
    ${modelMetadata.approach === 'Piecewise' ? `
    "km_portion_accuracy": "<exact match or deviations?>",
    "cutpoint_transition": "<smooth or discontinuous>",
    "parametric_tail_fit": "<tail plausibility>"` : ''}
    ${modelMetadata.approach === 'Spline' ? `
    "knot_placement": "<appropriateness of knot positions>",
    "overfitting_risk": "<low|medium|high>",
    "extrapolation_stability": "<stable or unstable beyond last knot>"` : ''}
  },
  "red_flags": ["<critical issue 1>", "<critical issue 2>"],
  "strengths": ["<strength 1>", "<strength 2>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>"],
  "recommendation": "<Base Case|Scenario|Screen Out>",
  "recommendation_rationale": "<one sentence justification>"
}
\`\`\`

SCORING GUIDANCE:
- 9-10: Excellent - minimal deviations, highly plausible
- 7-8: Good - minor issues, acceptable for base case
- 5-6: Moderate - notable concerns, consider as scenario
- 3-4: Poor - significant issues, borderline acceptable
- 0-2: Unacceptable - major problems, screen out

RECOMMENDATION CRITERIA:
- **Base Case**: AIC competitive (top 2-3), fit score ≥7, extrapolation score ≥6, no red flags
- **Scenario**: Reasonable fit (≥5), provides useful sensitivity analysis, minor concerns
- **Screen Out**: Poor fit (<5), implausible extrapolation, or critical red flags`;

  const messages = [
    new HumanMessage({
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${shortTermPlotBase64}`,
          },
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${longTermPlotBase64}`,
          },
        },
      ],
    }),
  ];

  const response = await llm.invoke(messages);
  const content = response.content as string;

  // Parse JSON response
  let assessment: Omit<VisionAssessmentResult, 'token_usage'>;
  try {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    const parsed = JSON.parse(jsonStr);

    // Ensure all required fields with defaults
    assessment = {
      short_term_score: parsed.short_term_score ?? 5,
      long_term_score: parsed.long_term_score ?? 5,
      observations: parsed.observations ?? {
        early: { fit_quality: '', deviation_pattern: '', score: 5 },
        mid: { fit_quality: '', deviation_pattern: '', score: 5 },
        late: { fit_quality: '', deviation_pattern: '', score: 5 },
        extrapolation: { trajectory: '', plausibility: '', concerns: [] }
      },
      extracted_predictions: parsed.extracted_predictions ?? {},
      benchmark_comparison: parsed.benchmark_comparison ?? {
        plausibility_rating: 'plausible',
        notes: 'No benchmark data available'
      },
      approach_assessment: parsed.approach_assessment ?? {},
      red_flags: parsed.red_flags ?? [],
      strengths: parsed.strengths ?? [],
      weaknesses: parsed.weaknesses ?? [],
      recommendation: parsed.recommendation ?? 'Scenario',
      recommendation_rationale: parsed.recommendation_rationale ?? ''
    };
  } catch (error) {
    console.error('[VisionAnalyzer] Failed to parse response:', content);
    throw new Error(`Failed to parse vision assessment: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Estimate token usage
  const inputTokens = Math.ceil(prompt.length / 4) +
    Math.ceil(shortTermPlotBase64.length / 1000) * 85 + // ~85 tokens per 1KB base64
    Math.ceil(longTermPlotBase64.length / 1000) * 85;
  const outputTokens = Math.ceil(content.length / 4);
  const cost = estimateCost('anthropic', inputTokens, outputTokens);

  return {
    ...assessment,
    token_usage: {
      input: inputTokens,
      output: outputTokens,
      cost,
    },
  };
}

/**
 * Legacy interface for backward compatibility
 */
export interface LegacyVisionResult {
  short_term_score: number;
  long_term_score: number;
  short_term_observations: string;
  long_term_observations: string;
  strengths: string;
  weaknesses: string;
  concerns: string;
  token_usage: { input: number; output: number; cost: number };
}

/**
 * Convert enhanced result to legacy format for backward compatibility
 */
export function toLegacyFormat(result: VisionAssessmentResult): LegacyVisionResult {
  return {
    short_term_score: result.short_term_score,
    long_term_score: result.long_term_score,
    short_term_observations: [
      result.observations.early.fit_quality,
      result.observations.mid.fit_quality,
      result.observations.late.fit_quality
    ].filter(Boolean).join(' '),
    long_term_observations: result.observations.extrapolation.trajectory + ' ' +
      result.observations.extrapolation.plausibility,
    strengths: result.strengths.join('; '),
    weaknesses: result.weaknesses.join('; '),
    concerns: result.red_flags.join('; '),
    token_usage: result.token_usage
  };
}

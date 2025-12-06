import { createReasoningLLM, estimateCost } from '../lib/llm';
import { HumanMessage } from '@langchain/core/messages';
import { NICE_DSU_EVALUATION_PROMPT, NICE_DSU_TSD_14_PRINCIPLES, NICE_DSU_TSD_21_PRINCIPLES } from '../lib/nice-guidelines';
import type { VisionAssessmentResult } from './vision-analyzer';
import type { ModelFitResult } from '../services/python-service';

export interface ReasoningAssessmentResult {
  full_text: string;
  sections: {
    ph_assumption: string;
    statistical_performance: string;
    visual_fit: string;
    extrapolation: string;
    strengths: string;
    weaknesses: string;
    clinical_plausibility: string;
    nice_compliance: string;
    scenarios: string;
    recommendation: string;
    uncertainties: string;
    // New concise sections
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
 * Comprehensive reasoning analysis using Reasoning LLM (Claude Sonnet 4.5)
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

  // Default MOA if not provided (for this specific agent context)
  if (!clinicalContext.mechanism_of_action && clinicalContext.indication?.includes('NSCLC')) {
    clinicalContext.mechanism_of_action = 'Immunotherapy (Checkpoints inhibitor) vs Chemotherapy. Expect delayed treatment effect (lag) and potential crossing of survival curves.';
  }

  const prompt = `${NICE_DSU_EVALUATION_PROMPT}

${NICE_DSU_TSD_14_PRINCIPLES}

${NICE_DSU_TSD_21_PRINCIPLES}

MODEL INFORMATION:
${JSON.stringify(modelResult, null, 2)}

VISION ASSESSMENT:
${JSON.stringify(visionAssessment, null, 2)}

CLINICAL CONTEXT:
${JSON.stringify(clinicalContext, null, 2)}

PH DIAGNOSTIC PLOTS (Base64):
${phPlots ? 'Provided (Log-Cumulative Hazard & Schoenfeld)' : 'Not provided'}

Provide a CONCISE clinical assessment (approx. 600-800 words) covering these 4 critical sections:

1. STATISTICAL & VISUAL FIT
   - Synthesize AIC/BIC (is it competitive?) and Visual Fit (does it hit the data?).
   - Be direct: "AIC=1200 is superior to Exponential (1250)..."
   - Does the curve follow the KM data well?

2. EXTRAPOLATION & CLINICAL PLAUSIBILITY
   - Is the tail behavior (5yr, 10yr) clinically realistic for this indication?
   - Does it align with the MOA (e.g. plateau for immunotherapy)?

3. STRENGTHS & WEAKNESSES
   - Bullet points of key pros/cons.

4. FINAL RECOMMENDATION
   - "Suitable for Base Case", "Consider for Sensitivity Analysis", or "Not Recommended".
   - Avoid "Reject" unless scientifically impossible. Prefer "Consider for Sensitivity Analysis" for plausible but suboptimal models.
   - Brief justification.

Format as structured text with clear headings.`;

  const messages = [new HumanMessage({ content: prompt })];
  const response = await llm.invoke(messages);
  const content = response.content as string;

  // Parse sections
  const sections = {
    statistical_visual_fit: extractSection(content, 'STATISTICAL & VISUAL FIT', 'EXTRAPOLATION & CLINICAL PLAUSIBILITY'),
    clinical_plausibility: extractSection(content, 'EXTRAPOLATION & CLINICAL PLAUSIBILITY', 'STRENGTHS & WEAKNESSES'),
    strengths_weaknesses: extractSection(content, 'STRENGTHS & WEAKNESSES', 'FINAL RECOMMENDATION'),
    recommendation: extractSection(content, 'FINAL RECOMMENDATION', ''),
    // Keep old fields empty or mapped for compatibility if needed, but we'll focus on these 4
    ph_assumption: '',
    statistical_performance: '',
    visual_fit: '',
    extrapolation: '',
    strengths: '',
    weaknesses: '',
    nice_compliance: '',
    scenarios: '',
    uncertainties: '',
  };

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

function extractSection(text: string, startMarker: string, endMarker: string): string {
  const startIdx = text.indexOf(startMarker);
  if (startIdx === -1) return '';

  const endIdx = endMarker ? text.indexOf(endMarker, startIdx) : text.length;
  if (endIdx === -1) return text.substring(startIdx);

  return text.substring(startIdx, endIdx).trim();
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
  // Use Reasoning LLM (Claude Sonnet 4.5) for vision analysis
  const llm = createReasoningLLM();

  console.log('🔍 Assessing PH Assumption with Claude Sonnet 4.5...');
  console.log('📊 Statistical Results:', JSON.stringify(statisticalResults, null, 2));
  console.log('📊 Log-Cumulative Hazard Plot Length:', phPlots.log_cumulative_hazard?.length || 0);
  console.log('📊 Schoenfeld Residuals Plot Length:', phPlots.schoenfeld_residuals?.length || 0);

  if (!phPlots.log_cumulative_hazard || phPlots.log_cumulative_hazard.length < 100) {
    throw new Error('❌ ERROR: Log-Cumulative Hazard plot data is missing or invalid!');
  }
  if (!phPlots.schoenfeld_residuals || phPlots.schoenfeld_residuals.length < 100) {
    throw new Error('❌ ERROR: Schoenfeld Residuals plot data is missing or invalid!');
  }

  const prompt = `You are a senior biostatistician analyzing proportional hazards (PH) assumption for a Health Technology Assessment.

CRITICAL: You MUST analyze the PLOTS FIRST. Do NOT rely on p-values alone.

CLINICAL CONTEXT:
- Indication: ${clinicalContext.indication || 'Unknown'}
- Mechanism: ${clinicalContext.mechanism_of_action || 'Unknown'}
- Note: Immunotherapies often show delayed effects → crossing curves

STATISTICAL RESULTS:
(HIDDEN TO FORCE VISUAL ANALYSIS - YOU MUST LOOK AT THE PLOTS)

COMPUTED CROSSING ANALYSIS (HARD FACT - DO NOT IGNORE):
- Crossing Detected in Data: ${statisticalResults.crossing_detected ? 'YES' : 'NO'}
${statisticalResults.crossing_detected ? `- Crossing Time: t ≈ ${statisticalResults.crossing_time?.toFixed(2)} months` : ''}
- Note: This is calculated directly from the Kaplan-Meier data. If YES, the curves DEFINITELY cross.

YOU WILL NOW SEE TWO PLOTS:
1. Log-Cumulative Hazard Plot
2. Schoenfeld Residuals Plot

IF YOU CANNOT SEE THE PLOTS, OUTPUT: {"decision": "separate", "rationale": "ERROR: Plots not visible. Defaulting to separate models due to immunotherapy context."}

MANDATORY VISUAL ANALYSIS STEPS (DO THESE IN ORDER):
STEP 1: EXAMINE LOG-CUMULATIVE HAZARD PLOT
- Identify which line is chemotherapy (usually blue) and which is pembrolizumab (usually orange/red)
- Scan from t=0 to t=5: Do the lines cross? Note the exact time if yes.
- Scan from t=5 to t=10: Do they cross here? Note it.
- After t=10: Are they parallel, diverging, or converging?

STEP 2: EXAMINE SCHOENFELD RESIDUALS PLOT
- Is the LOWESS trend line (smooth curve) flat around zero?
- Or does it show curvature/slope?

STEP 3: MAKE DECISION
- IF you see ANY crossing in Step 1 → PH VIOLATED → decision="separate"
- IF lines are parallel throughout AND Schoenfeld is flat → PH VALID → decision="pooled"
- IF uncertain but immunotherapy context → PH VIOLATED → decision="separate"

CRITICAL RULES:
1. Visual crossing ALWAYS overrides p-values
2. Early crossing (t<10) is VERY common with immunotherapy
3. P-values often miss early crossings due to low power
4. Your rationale MUST describe what you SEE in the plots, not just report p-values
5. IF "Crossing Detected" is YES in the Computed Analysis, you MUST state: "A crossing was detected at t=[insert exact time from computed analysis] months." DO NOT HALLUCINATE A DIFFERENT TIME.

OUTPUT FORMAT (JSON):
{
  "decision": "separate" | "pooled",
  "rationale": "2-3 sentences. MUST start with visual observation: 'The log-cumulative hazard plot shows [describe what you see]. A crossing is confirmed at t=[exact computed time] months.' [Conclusion]. DO NOT just report p-values."
}`;

  // Ensure base64 strings are clean
  const cleanLogCumHaz = phPlots.log_cumulative_hazard.replace(/^data:image\/\w+;base64,/, '').trim();
  const cleanSchoenfeld = phPlots.schoenfeld_residuals.replace(/^data:image\/\w+;base64,/, '').trim();

  const messages = [
    new HumanMessage({
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${cleanLogCumHaz}`,
          },
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${cleanSchoenfeld}`,
          },
        },
      ],
    }),
  ];

  const response = await llm.invoke(messages);
  const content = response.content as string;

  try {
    // Extract JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        decision: result.decision === 'separate' ? 'separate' : 'pooled',
        rationale: result.rationale
      };
    }
    throw new Error('No JSON found in response');
  } catch (e) {
    // Fallback
    return {
      decision: 'separate', // Fail safe to separate models if analysis fails
      rationale: 'Automated visual analysis failed; defaulting to separate models for flexibility.'
    };
  }
}

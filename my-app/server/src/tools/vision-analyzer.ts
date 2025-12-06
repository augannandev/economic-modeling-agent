import { createVisionLLM, estimateCost } from '../lib/llm';
import { HumanMessage } from '@langchain/core/messages';

export interface VisionAssessmentResult {
  short_term_score: number; // 0-10
  long_term_score: number; // 0-10
  short_term_observations: string;
  long_term_observations: string;
  strengths: string;
  weaknesses: string;
  concerns: string;
  token_usage: {
    input: number;
    output: number;
    cost: number;
  };
}

/**
 * Analyze dual plots using Vision LLM (Claude Sonnet 4.5)
 */
export async function assessWithVisionLLM(
  shortTermPlotBase64: string,
  longTermPlotBase64: string,
  modelMetadata: {
    arm: string;
    approach: string;
    distribution?: string;
    aic?: number;
    bic?: number;
  }
): Promise<VisionAssessmentResult> {
  const llm = createVisionLLM();

  const prompt = `You are a survival analysis expert evaluating survival model fits for an HTA submission.

Model Information:
- Treatment Arm: ${modelMetadata.arm}
- Modeling Approach: ${modelMetadata.approach}
${modelMetadata.distribution ? `- Distribution: ${modelMetadata.distribution}` : ''}
${modelMetadata.aic ? `- AIC: ${modelMetadata.aic.toFixed(2)}` : ''}
${modelMetadata.bic ? `- BIC: ${modelMetadata.bic.toFixed(2)}` : ''}

You will see TWO plots for this model:

PLOT 1 (Short-term fit, observed data range):
- Assess the quality of fit to observed Kaplan-Meier data
- Look for how well the fitted curve matches the observed KM curve
- Note any systematic deviations or biases
- Consider censoring patterns
- Score: 0-10 (10 = excellent fit, 0 = poor fit)

PLOT 2 (Long-term extrapolation, 0-240 months / 20 years):
- Assess the clinical plausibility of the extrapolation
- Compare with SEER benchmark data if shown
- Evaluate survival milestones (1-yr, 2-yr, 5-yr, 10-yr, 20-yr)
- Consider whether extrapolation is too optimistic or pessimistic
- Score: 0-10 (10 = highly plausible, 0 = implausible)

Provide your assessment in the following JSON format:
{
  "short_term_score": <number 0-10>,
  "long_term_score": <number 0-10>,
  "short_term_observations": "<detailed observations about short-term fit>",
  "long_term_observations": "<detailed observations about long-term extrapolation>",
  "strengths": "<key strengths of this model>",
  "weaknesses": "<key weaknesses of this model>",
  "concerns": "<any concerns about using this model>"
}`;

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
    assessment = JSON.parse(jsonStr);
  } catch (error) {
    // Fallback: try to extract structured data from text
    throw new Error(`Failed to parse vision assessment: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Estimate token usage (rough)
  const inputTokens = Math.ceil(prompt.length / 4) + Math.ceil(shortTermPlotBase64.length / 4) + Math.ceil(longTermPlotBase64.length / 4);
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


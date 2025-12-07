/**
 * Chat agent for interactive survival analysis assistance
 * Processes user messages and provides intelligent responses about the analysis
 */

import { createReasoningLLM, estimateCost } from '../lib/llm';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getDatabase } from '../lib/db';
import { getDatabaseUrl } from '../lib/env';
import { analyses, models, visionAssessments, reasoningAssessments, phTests, synthesisReports } from '../schema/analyses';
import { eq } from 'drizzle-orm';
import type { StreamController } from '../lib/streaming';

export interface AnalysisContext {
  analysis: any;
  models: any[];
  phTests: any | null;
  synthesis: any | null;
  modelDetails: Array<{
    model: any;
    vision?: any;
    reasoning?: any;
  }>;
}

/**
 * Load analysis context from database
 */
export async function loadAnalysisContext(analysisId: string): Promise<AnalysisContext> {
  const db = await getDatabase(getDatabaseUrl()!);

  // Get analysis
  const [analysis] = await db.select()
    .from(analyses)
    .where(eq(analyses.id, analysisId));

  if (!analysis) {
    throw new Error('Analysis not found');
  }

  // Get models
  const modelList = await db.select()
    .from(models)
    .where(eq(models.analysis_id, analysisId))
    .orderBy(models.model_order);

  // Get PH tests
  const [phTest] = await db.select()
    .from(phTests)
    .where(eq(phTests.analysis_id, analysisId));

  // Get synthesis
  const [synthesis] = await db.select()
    .from(synthesisReports)
    .where(eq(synthesisReports.analysis_id, analysisId));

  // Get detailed model information
  const modelDetails = await Promise.all(
    modelList.slice(0, 10).map(async (model) => {
      const [vision] = await db.select()
        .from(visionAssessments)
        .where(eq(visionAssessments.model_id, model.id));

      const [reasoning] = await db.select()
        .from(reasoningAssessments)
        .where(eq(reasoningAssessments.model_id, model.id));

      return {
        model,
        vision: vision || null,
        reasoning: reasoning || null,
      };
    })
  );

  return {
    analysis,
    models: modelList,
    phTests: phTest || null,
    synthesis: synthesis || null,
    modelDetails,
  };
}

/**
 * Format analysis context for LLM prompt
 */
function formatAnalysisContext(context: AnalysisContext): string {
  const { analysis, models, phTests, synthesis, modelDetails } = context;

  let contextText = `# Survival Analysis Context\n\n`;
  
  contextText += `## Analysis Status\n`;
  contextText += `- Status: ${analysis.status}\n`;
  contextText += `- Workflow State: ${analysis.workflow_state}\n`;
  contextText += `- Progress: ${analysis.progress}/${analysis.total_models} models\n`;
  contextText += `- Endpoint Type: ${analysis.parameters?.endpointType || 'OS'}\n`;
  contextText += `- Created: ${new Date(analysis.created_at).toLocaleString()}\n\n`;

  if (phTests) {
    contextText += `## Proportional Hazards Test Results\n`;
    contextText += `- Decision: ${phTests.decision}\n`;
    contextText += `- Schoenfeld P-value: ${phTests.schoenfeld_pvalue?.toFixed(4) || 'N/A'}\n`;
    contextText += `- Log-rank P-value: ${phTests.logrank_pvalue?.toFixed(4) || 'N/A'}\n`;
    if (phTests.rationale) {
      contextText += `- Rationale: ${phTests.rationale.substring(0, 200)}...\n`;
    }
    contextText += `\n`;
  }

  contextText += `## Models Summary\n`;
  contextText += `- Total Models: ${models.length}\n`;
  
  if (models.length > 0) {
    const byApproach = models.reduce((acc, m) => {
      acc[m.approach] = (acc[m.approach] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    contextText += `- By Approach: ${Object.entries(byApproach).map(([k, v]) => `${k}: ${v}`).join(', ')}\n`;
    
    // Show top models by AIC
    const topModels = models
      .filter(m => m.aic !== null)
      .sort((a, b) => (a.aic || Infinity) - (b.aic || Infinity))
      .slice(0, 5);
    
    if (topModels.length > 0) {
      contextText += `\n### Top 5 Models by AIC:\n`;
      topModels.forEach((m, i) => {
        contextText += `${i + 1}. ${m.approach} - ${m.distribution || m.scale || 'N/A'} (${m.arm}): AIC=${m.aic?.toFixed(2) || 'N/A'}\n`;
      });
    }
  }
  contextText += `\n`;

  if (synthesis) {
    contextText += `## Synthesis Report Available\n`;
    if (synthesis.primary_recommendation) {
      contextText += `- Primary Recommendation: ${synthesis.primary_recommendation.substring(0, 300)}...\n`;
    }
    contextText += `\n`;
  }

  if (modelDetails.length > 0) {
    contextText += `## Detailed Model Assessments (Sample)\n`;
    modelDetails.slice(0, 3).forEach(({ model, vision, reasoning }) => {
      contextText += `\n### Model: ${model.approach} - ${model.distribution || model.scale || 'N/A'} (${model.arm})\n`;
      contextText += `- AIC: ${model.aic?.toFixed(2) || 'N/A'}, BIC: ${model.bic?.toFixed(2) || 'N/A'}\n`;
      if (vision) {
        contextText += `- Vision Scores: Short-term: ${vision.short_term_score}/10, Long-term: ${vision.long_term_score}/10\n`;
      }
      if (reasoning?.full_text) {
        contextText += `- Reasoning Summary: ${reasoning.full_text.substring(0, 150)}...\n`;
      }
    });
  }

  return contextText;
}

/**
 * Process user message with chat agent
 */
export async function processChatMessage(
  analysisId: string,
  userMessage: string,
  chatHistory: Array<{ role: 'user' | 'agent'; content: string }>,
  streamController?: StreamController
): Promise<{
  response: string;
  tokenUsage: { input: number; output: number; cost: number };
}> {
  const llm = createReasoningLLM({ maxTokens: 4000, temperature: 0.7 });

  // Load analysis context
  if (streamController) {
    streamController.sendThinking('Loading analysis context...');
  }
  const context = await loadAnalysisContext(analysisId);
  const contextText = formatAnalysisContext(context);

  // Build conversation history
  const messages: Array<SystemMessage | HumanMessage> = [
    new SystemMessage({
      content: `You are an expert survival analysis assistant helping a researcher understand their survival analysis results.

Your role:
- Answer questions about the analysis status, models, and results
- Provide insights about model fits and extrapolation
- Explain statistical concepts in accessible terms
- Make recommendations based on the analysis data
- Help interpret PH test results and synthesis reports

Guidelines:
- Be concise but thorough
- Use the analysis context provided to give accurate answers
- If asked about specific models, reference their AIC/BIC scores and assessments
- If the analysis is still running, explain what's happening
- If synthesis is available, reference the primary recommendations
- Be helpful and professional

Current Analysis Context:
${contextText}

Previous conversation:
${chatHistory.slice(-5).map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n\n')}
`,
    }),
    new HumanMessage({
      content: userMessage,
    }),
  ];

  // Send thinking indicator
  if (streamController) {
    streamController.sendThinking('Analyzing your question and preparing response...');
  }

  // Get LLM response
  const response = await llm.invoke(messages);
  const content = response.content as string;

  // Estimate token usage (rough)
  const inputTokens = JSON.stringify(messages).length / 4; // Rough estimate
  const outputTokens = content.length / 4; // Rough estimate
  const cost = estimateCost('anthropic', inputTokens, outputTokens);

  return {
    response: content,
    tokenUsage: {
      input: Math.round(inputTokens),
      output: Math.round(outputTokens),
      cost,
    },
  };
}


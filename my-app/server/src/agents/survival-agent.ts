// LangGraph imports removed - using sequential workflow for now
import { loadPseudoIPD } from '../tools/data-loader';
import { testProportionalHazardsTool } from '../tools/ph-tester';
import { fitKMCurvesTool } from '../tools/km-fitter';
import { fitOnePieceModelTool } from '../tools/one-piece-fitter';
import { fitPiecewiseModelTool, detectCutpointTool } from '../tools/piecewise-fitter';
import { fitSplineModelTool } from '../tools/spline-fitter';
import { generateDualPlotsTool } from '../tools/dual-plot-generator';
import { assessWithVisionLLM } from '../tools/vision-analyzer';
import { assessWithReasoningLLM, assessPHAssumption } from '../tools/reasoning-analyzer';
import { synthesizeCrossModel } from '../tools/synthesis-generator';
import { getDatabase } from '../lib/db';
import { getDatabaseUrl } from '../lib/env';
import { analyses, models, visionAssessments, reasoningAssessments, plots, phTests, synthesisReports, tokenUsage } from '../schema/analyses';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { Distribution } from '../tools/one-piece-fitter';

export type WorkflowState =
  | 'DATA_LOADED'
  | 'PH_TESTING_COMPLETE'
  | 'ONE_PIECE_FITTING'
  | 'PIECEWISE_FITTING'
  | 'SPLINE_FITTING'
  | 'INDIVIDUAL_ASSESSMENT'
  | 'SYNTHESIS_COMPLETE'
  | 'REPORT_GENERATED';

export interface SurvivalAnalysisState {
  analysis_id: string;
  user_id: string;
  workflow_state: WorkflowState;
  progress: number;
  total_models: number;
  endpointType: 'OS' | 'PFS';
  data?: {
    chemo: any;
    pembro: any;
  };
  km_curves?: {
    chemo: any;
    pembro: any;
  };
  ph_tests?: any;
  fitted_models: Array<{
    model_id: string;
    model_result: any;
    vision_assessment?: any;
    reasoning_assessment?: any;
    plots?: {
      short_term: any;
      long_term: any;
    };
  }>;
  synthesis_report?: any;
}

const DISTRIBUTIONS: Distribution[] = ['exponential', 'weibull', 'log-normal', 'log-logistic', 'gompertz', 'generalized-gamma'];
const ARMS: Array<'chemo' | 'pembro'> = ['chemo', 'pembro'];
const SCALES: Array<'hazard' | 'odds' | 'normal'> = ['hazard', 'odds', 'normal'];
const KNOTS: Array<1 | 2 | 3> = [1, 2, 3];

/**
 * Helper to check if analysis is paused
 * If paused, it waits until resumed or cancelled
 */
async function checkPause(analysisId: string): Promise<void> {
  const db = await getDatabase(getDatabaseUrl()!);

  while (true) {
    const [analysis] = await db.select()
      .from(analyses)
      .where(eq(analyses.id, analysisId));

    if (!analysis) throw new Error('Analysis not found');

    if (analysis.status === 'running') {
      return; // Continue execution
    }

    if (analysis.status === 'paused') {
      console.log(`Analysis ${analysisId} is paused. Waiting...`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
      continue;
    }

    if (analysis.status === 'failed' || analysis.status === 'cancelled') {
      throw new Error(`Analysis stopped with status: ${analysis.status}`);
    }

    // Default: wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

/**
 * Load data step
 */
async function loadData(state: SurvivalAnalysisState): Promise<Partial<SurvivalAnalysisState>> {
  const data = await loadPseudoIPD(state.endpointType);
  return {
    data,
    workflow_state: 'DATA_LOADED',
    progress: 0,
  };
}

/**
 * Test proportional hazards step
 */
async function testPH(state: SurvivalAnalysisState): Promise<Partial<SurvivalAnalysisState>> {
  if (!state.data) throw new Error('Data not loaded');

  const phResult = await testProportionalHazardsTool(state.data);

  // Enhance decision with Visual/Reasoning LLM analysis
  let finalDecision = phResult.decision === 'separate_arms' ? 'separate' : 'pooled';
  let finalRationale = phResult.rationale;

  if (phResult.diagnostic_plots) {
    try {
      // Extract plots for the analyzer (diagnostic_plots is a Record<string, string>)
      const logHazardPlot = phResult.diagnostic_plots['log_cumulative_hazard'];
      const schoenfeldPlot = phResult.diagnostic_plots['schoenfeld_residuals'];

      if (logHazardPlot && schoenfeldPlot) {
        const llmAssessment = await assessPHAssumption(
          { log_cumulative_hazard: logHazardPlot, schoenfeld_residuals: schoenfeldPlot },
          {
            schoenfeld_p: phResult.schoenfeld_pvalue,
            chow_p: phResult.chow_test_pvalue,
            logrank_p: phResult.logrank_pvalue,
            crossing_detected: phResult.crossing_detected,
            crossing_time: phResult.crossing_time
          },
          {
            indication: 'NSCLC',
            mechanism_of_action: 'Immunotherapy (Checkpoints inhibitor)'
          }
        );

        finalDecision = llmAssessment.decision;
        finalRationale = llmAssessment.rationale;
      }
    } catch (error) {
      console.error('Failed to assess PH assumption with LLM:', error);
    }
  }

  // Save PH test results to database
  const db = await getDatabase(getDatabaseUrl()!);
  await db.insert(phTests).values({
    id: randomUUID(),
    analysis_id: state.analysis_id,
    chow_test_pvalue: phResult.chow_test_pvalue,
    schoenfeld_pvalue: phResult.schoenfeld_pvalue,
    logrank_pvalue: phResult.logrank_pvalue,
    decision: finalDecision as 'separate' | 'pooled',
    rationale: finalRationale,
    diagnostic_plots: phResult.diagnostic_plots,
  });

  return {
    ph_tests: phResult,
    workflow_state: 'PH_TESTING_COMPLETE',
    progress: 0,
  };
}

/**
 * Fit KM curves step
 */
async function fitKM(state: SurvivalAnalysisState): Promise<Partial<SurvivalAnalysisState>> {
  if (!state.data) throw new Error('Data not loaded');

  const kmCurves = await fitKMCurvesTool(state.data);
  return {
    km_curves: kmCurves,
  };
}

/**
 * Fit one-piece models step
 */
async function fitOnePieceModels(state: SurvivalAnalysisState): Promise<Partial<SurvivalAnalysisState>> {
  if (!state.data || !state.km_curves) throw new Error('Data or KM curves not loaded');

  const db = await getDatabase(getDatabaseUrl()!);
  const fittedModels = [...(state.fitted_models || [])];
  let modelOrder = fittedModels.length + 1;

  for (const arm of ARMS) {
    for (const distribution of DISTRIBUTIONS) {
      // Check for pause
      await checkPause(state.analysis_id);

      try {
        const modelResult = await fitOnePieceModelTool(state.data[arm], arm, distribution);
        const modelId = randomUUID();

        // Save model to database
        await db.insert(models).values({
          id: modelId,
          analysis_id: state.analysis_id,
          arm,
          approach: 'one-piece',
          distribution,
          parameters: modelResult.parameters,
          aic: modelResult.aic,
          bic: modelResult.bic,
          log_likelihood: modelResult.log_likelihood,
          model_order: modelOrder++,
        });

        // Generate plots with original data for actual model refitting
        const plotResults = await generateDualPlotsTool(
          modelId,
          modelResult,
          state.km_curves[arm],
          state.data[arm]  // Pass original data so plots use actual fitted model predictions
        );

        // Save plots
        await db.insert(plots).values([
          {
            id: randomUUID(),
            model_id: modelId,
            plot_type: 'short_term',
            file_path: plotResults.short_term.file_path,
            base64_data: plotResults.short_term.base64_data,
          },
          {
            id: randomUUID(),
            model_id: modelId,
            plot_type: 'long_term',
            file_path: plotResults.long_term.file_path,
            base64_data: plotResults.long_term.base64_data,
          },
        ]);

        // Vision assessment
        const visionAssessment = await assessWithVisionLLM(
          plotResults.short_term.base64_data,
          plotResults.long_term.base64_data,
          {
            arm,
            approach: 'one-piece',
            distribution,
            aic: modelResult.aic,
            bic: modelResult.bic,
          }
        );

        // Save vision assessment
        const visionId = randomUUID();
        await db.insert(visionAssessments).values({
          id: visionId,
          model_id: modelId,
          short_term_score: visionAssessment.short_term_score,
          long_term_score: visionAssessment.long_term_score,
          short_term_observations: visionAssessment.short_term_observations,
          long_term_observations: visionAssessment.long_term_observations,
          strengths: visionAssessment.strengths,
          weaknesses: visionAssessment.weaknesses,
          concerns: visionAssessment.concerns,
          token_usage: visionAssessment.token_usage.input + visionAssessment.token_usage.output,
        });

        // Track token usage
        await db.insert(tokenUsage).values({
          id: randomUUID(),
          analysis_id: state.analysis_id,
          model_id: modelId,
          model_type: 'vision',
          tokens_input: visionAssessment.token_usage.input,
          tokens_output: visionAssessment.token_usage.output,
          cost_estimate: visionAssessment.token_usage.cost,
        });

        // Reasoning assessment
        const reasoningAssessment = await assessWithReasoningLLM(
          modelResult,
          visionAssessment,
          {
            trial_name: 'KEYNOTE-024',
            indication: 'NSCLC',
            mechanism_of_action: 'Immunotherapy (Checkpoints inhibitor)'
          },
          state.ph_tests?.diagnostic_plots
        );

        // Save reasoning assessment
        await db.insert(reasoningAssessments).values({
          id: randomUUID(),
          model_id: modelId,
          full_text: reasoningAssessment.full_text,
          sections: reasoningAssessment.sections,
          token_usage: reasoningAssessment.token_usage.input + reasoningAssessment.token_usage.output,
        });

        // Track token usage
        await db.insert(tokenUsage).values({
          id: randomUUID(),
          analysis_id: state.analysis_id,
          model_id: modelId,
          model_type: 'reasoning',
          tokens_input: reasoningAssessment.token_usage.input,
          tokens_output: reasoningAssessment.token_usage.output,
          cost_estimate: reasoningAssessment.token_usage.cost,
        });

        fittedModels.push({
          model_id: modelId,
          model_result: modelResult,
          vision_assessment: visionAssessment,
          reasoning_assessment: reasoningAssessment,
          plots: {
            short_term: plotResults.short_term,
            long_term: plotResults.long_term,
          },
        });

        // Update progress
        await db.update(analyses)
          .set({
            progress: fittedModels.length,
            updated_at: new Date(),
          })
          .where(eq(analyses.id, state.analysis_id));
      } catch (error) {
        console.error(`Error fitting one-piece model ${distribution} for ${arm}:`, error);
        // Continue with next model
      }
    }
  }

  return {
    fitted_models: fittedModels,
    workflow_state: 'PIECEWISE_FITTING',
    progress: fittedModels.length,
  };
}

/**
 * Fit piecewise models step
 */
async function fitPiecewiseModels(state: SurvivalAnalysisState): Promise<Partial<SurvivalAnalysisState>> {
  if (!state.data || !state.km_curves) throw new Error('Data or KM curves not loaded');

  const db = await getDatabase(getDatabaseUrl()!);
  const fittedModels = [...(state.fitted_models || [])];
  let modelOrder = fittedModels.length + 1;

  for (const arm of ARMS) {
    // Detect cutpoint for this arm
    const cutpoint = await detectCutpointTool(state.data[arm], arm, 12, 52);

    for (const distribution of DISTRIBUTIONS) {
      // Check for pause
      await checkPause(state.analysis_id);

      try {
        const modelResult = await fitPiecewiseModelTool(state.data[arm], arm, distribution, cutpoint);
        const modelId = randomUUID();

        // Save model to database
        await db.insert(models).values({
          id: modelId,
          analysis_id: state.analysis_id,
          arm,
          approach: 'piecewise',
          distribution,
          cutpoint,
          parameters: modelResult.parameters,
          aic: modelResult.aic,
          bic: modelResult.bic,
          log_likelihood: modelResult.log_likelihood,
          model_order: modelOrder++,
        });

        // Generate plots with original data for actual model refitting
        const plotResults = await generateDualPlotsTool(
          modelId,
          modelResult,
          state.km_curves[arm],
          state.data[arm]  // Pass original data so plots use actual fitted model predictions
        );

        // Save plots
        await db.insert(plots).values([
          {
            id: randomUUID(),
            model_id: modelId,
            plot_type: 'short_term',
            file_path: plotResults.short_term.file_path,
            base64_data: plotResults.short_term.base64_data,
          },
          {
            id: randomUUID(),
            model_id: modelId,
            plot_type: 'long_term',
            file_path: plotResults.long_term.file_path,
            base64_data: plotResults.long_term.base64_data,
          },
        ]);

        // Vision assessment
        const visionAssessment = await assessWithVisionLLM(
          plotResults.short_term.base64_data,
          plotResults.long_term.base64_data,
          {
            arm,
            approach: 'piecewise',
            distribution,
            aic: modelResult.aic,
            bic: modelResult.bic,
          }
        );

        // Save vision assessment
        await db.insert(visionAssessments).values({
          id: randomUUID(),
          model_id: modelId,
          short_term_score: visionAssessment.short_term_score,
          long_term_score: visionAssessment.long_term_score,
          short_term_observations: visionAssessment.short_term_observations,
          long_term_observations: visionAssessment.long_term_observations,
          strengths: visionAssessment.strengths,
          weaknesses: visionAssessment.weaknesses,
          concerns: visionAssessment.concerns,
          token_usage: visionAssessment.token_usage.input + visionAssessment.token_usage.output,
        });

        // Track token usage
        await db.insert(tokenUsage).values({
          id: randomUUID(),
          analysis_id: state.analysis_id,
          model_id: modelId,
          model_type: 'vision',
          tokens_input: visionAssessment.token_usage.input,
          tokens_output: visionAssessment.token_usage.output,
          cost_estimate: visionAssessment.token_usage.cost,
        });

        // Reasoning assessment
        const reasoningAssessment = await assessWithReasoningLLM(
          modelResult,
          visionAssessment,
          {
            trial_name: 'KEYNOTE-024',
            indication: 'NSCLC',
            mechanism_of_action: 'Immunotherapy (Checkpoints inhibitor)'
          },
          state.ph_tests?.diagnostic_plots
        );

        // Save reasoning assessment
        await db.insert(reasoningAssessments).values({
          id: randomUUID(),
          model_id: modelId,
          full_text: reasoningAssessment.full_text,
          sections: reasoningAssessment.sections,
          token_usage: reasoningAssessment.token_usage.input + reasoningAssessment.token_usage.output,
        });

        // Track token usage
        await db.insert(tokenUsage).values({
          id: randomUUID(),
          analysis_id: state.analysis_id,
          model_id: modelId,
          model_type: 'reasoning',
          tokens_input: reasoningAssessment.token_usage.input,
          tokens_output: reasoningAssessment.token_usage.output,
          cost_estimate: reasoningAssessment.token_usage.cost,
        });

        fittedModels.push({
          model_id: modelId,
          model_result: modelResult,
          vision_assessment: visionAssessment,
          reasoning_assessment: reasoningAssessment,
          plots: {
            short_term: plotResults.short_term,
            long_term: plotResults.long_term,
          },
        });

        // Update progress
        await db.update(analyses)
          .set({
            progress: fittedModels.length,
            updated_at: new Date(),
          })
          .where(eq(analyses.id, state.analysis_id));
      } catch (error) {
        console.error(`Error fitting piecewise model ${distribution} for ${arm}:`, error);
        // Continue with next model
      }
    }
  }

  return {
    fitted_models: fittedModels,
    workflow_state: 'SPLINE_FITTING',
    progress: fittedModels.length,
  };
}

/**
 * Fit spline models step
 */
async function fitSplineModels(state: SurvivalAnalysisState): Promise<Partial<SurvivalAnalysisState>> {
  if (!state.data || !state.km_curves) throw new Error('Data or KM curves not loaded');

  const db = await getDatabase(getDatabaseUrl()!);
  const fittedModels = [...(state.fitted_models || [])];
  let modelOrder = fittedModels.length + 1;

  for (const arm of ARMS) {
    for (const scale of SCALES) {
      for (const knots of KNOTS) {
        // Check for pause
        await checkPause(state.analysis_id);

        try {
          // Check for pause
          await checkPause(state.analysis_id);
          const modelResult = await fitSplineModelTool(state.data[arm], arm, scale, knots);
          const modelId = randomUUID();

          // Save model to database
          await db.insert(models).values({
            id: modelId,
            analysis_id: state.analysis_id,
            arm,
            approach: 'spline',
            scale,
            knots,
            parameters: modelResult.parameters,
            aic: modelResult.aic,
            bic: modelResult.bic,
            log_likelihood: modelResult.log_likelihood,
            model_order: modelOrder++,
          });

          // Generate plots with original data for actual model refitting
          const plotResults = await generateDualPlotsTool(
            modelId,
            modelResult,
            state.km_curves[arm],
            state.data[arm]  // Pass original data so plots use actual fitted model predictions
          );

          // Save plots
          await db.insert(plots).values([
            {
              id: randomUUID(),
              model_id: modelId,
              plot_type: 'short_term',
              file_path: plotResults.short_term.file_path,
              base64_data: plotResults.short_term.base64_data,
            },
            {
              id: randomUUID(),
              model_id: modelId,
              plot_type: 'long_term',
              file_path: plotResults.long_term.file_path,
              base64_data: plotResults.long_term.base64_data,
            },
          ]);

          // Vision assessment
          const visionAssessment = await assessWithVisionLLM(
            plotResults.short_term.base64_data,
            plotResults.long_term.base64_data,
            {
              arm,
              approach: 'spline',
              distribution: `${scale}-scale`,
              aic: modelResult.aic,
              bic: modelResult.bic,
            }
          );

          // Save vision assessment
          await db.insert(visionAssessments).values({
            id: randomUUID(),
            model_id: modelId,
            short_term_score: visionAssessment.short_term_score,
            long_term_score: visionAssessment.long_term_score,
            short_term_observations: visionAssessment.short_term_observations,
            long_term_observations: visionAssessment.long_term_observations,
            strengths: visionAssessment.strengths,
            weaknesses: visionAssessment.weaknesses,
            concerns: visionAssessment.concerns,
            token_usage: visionAssessment.token_usage.input + visionAssessment.token_usage.output,
          });

          // Track token usage
          await db.insert(tokenUsage).values({
            id: randomUUID(),
            analysis_id: state.analysis_id,
            model_id: modelId,
            model_type: 'vision',
            tokens_input: visionAssessment.token_usage.input,
            tokens_output: visionAssessment.token_usage.output,
            cost_estimate: visionAssessment.token_usage.cost,
          });

          // Reasoning assessment
          const reasoningAssessment = await assessWithReasoningLLM(
            modelResult,
            visionAssessment,
            {
              trial_name: 'KEYNOTE-024',
              indication: 'NSCLC',
              mechanism_of_action: 'Immunotherapy (Checkpoints inhibitor)'
            },
            state.ph_tests?.diagnostic_plots
          );

          // Save reasoning assessment
          await db.insert(reasoningAssessments).values({
            id: randomUUID(),
            model_id: modelId,
            full_text: reasoningAssessment.full_text,
            sections: reasoningAssessment.sections,
            token_usage: reasoningAssessment.token_usage.input + reasoningAssessment.token_usage.output,
          });

          // Track token usage
          await db.insert(tokenUsage).values({
            id: randomUUID(),
            analysis_id: state.analysis_id,
            model_id: modelId,
            model_type: 'reasoning',
            tokens_input: reasoningAssessment.token_usage.input,
            tokens_output: reasoningAssessment.token_usage.output,
            cost_estimate: reasoningAssessment.token_usage.cost,
          });

          fittedModels.push({
            model_id: modelId,
            model_result: modelResult,
            vision_assessment: visionAssessment,
            reasoning_assessment: reasoningAssessment,
            plots: {
              short_term: plotResults.short_term,
              long_term: plotResults.long_term,
            },
          });

          // Update progress
          await db.update(analyses)
            .set({
              progress: fittedModels.length,
              updated_at: new Date(),
            })
            .where(eq(analyses.id, state.analysis_id));
        } catch (error) {
          console.error(`Error fitting spline model ${scale}-${knots} for ${arm}:`, error);
          // Continue with next model
        }
      }
    }
  }

  return {
    fitted_models: fittedModels,
    workflow_state: 'SYNTHESIS_COMPLETE',
    progress: fittedModels.length,
  };
}

/**
 * Generate synthesis report step
 */
async function generateSynthesis(state: SurvivalAnalysisState): Promise<Partial<SurvivalAnalysisState>> {
  if (!state.fitted_models || state.fitted_models.length === 0) {
    throw new Error('No models fitted');
  }

  // Prepare assessment data for synthesis
  const assessmentData = state.fitted_models.map(model => ({
    model_id: model.model_id,
    arm: model.model_result.arm,
    approach: model.model_result.approach,
    distribution: model.model_result.distribution,
    aic: model.model_result.aic,
    bic: model.model_result.bic,
    vision_scores: {
      short_term: model.vision_assessment?.short_term_score || 0,
      long_term: model.vision_assessment?.long_term_score || 0,
    },
    vision_observations: {
      short_term: model.vision_assessment?.short_term_observations || '',
      long_term: model.vision_assessment?.long_term_observations || '',
    },
    reasoning_summary: model.reasoning_assessment?.full_text.substring(0, 500) || '',
  }));

  const synthesis = await synthesizeCrossModel(assessmentData, state.ph_tests);

  // Save synthesis report to database
  const db = await getDatabase(getDatabaseUrl()!);
  await db.insert(synthesisReports).values({
    id: randomUUID(),
    analysis_id: state.analysis_id,
    within_approach_rankings: synthesis.within_approach_rankings,
    cross_approach_comparison: synthesis.cross_approach_comparison,
    primary_recommendation: synthesis.primary_recommendation,
    sensitivity_recommendations: synthesis.sensitivity_recommendations,
    key_uncertainties: synthesis.key_uncertainties,
    hta_strategy: synthesis.hta_strategy,
    full_text: synthesis.full_text,
    token_usage: synthesis.token_usage.input + synthesis.token_usage.output,
  });

  // Track token usage
  await db.insert(tokenUsage).values({
    id: randomUUID(),
    analysis_id: state.analysis_id,
    model_type: 'synthesis',
    tokens_input: synthesis.token_usage.input,
    tokens_output: synthesis.token_usage.output,
    cost_estimate: synthesis.token_usage.cost,
  });

  // Update analysis status
  await db.update(analyses)
    .set({
      status: 'completed',
      workflow_state: 'REPORT_GENERATED',
      completed_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(analyses.id, state.analysis_id));

  return {
    synthesis_report: synthesis,
    workflow_state: 'REPORT_GENERATED',
  };
}

/**
 * Run survival analysis workflow
 * This executes the workflow steps sequentially
 */
export async function runSurvivalAnalysisWorkflow(analysisId: string, userId: string, endpointType: 'OS' | 'PFS' = 'OS'): Promise<void> {
  let state: SurvivalAnalysisState = {
    analysis_id: analysisId,
    user_id: userId,
    endpointType,
    workflow_state: 'DATA_LOADED',
    progress: 0,
    total_models: 42,
    fitted_models: [],
  };

  try {
    // Step 1: Load data
    const dataUpdate = await loadData(state);
    state = { ...state, ...dataUpdate };

    // Step 2: Fit KM curves
    const kmUpdate = await fitKM(state);
    state = { ...state, ...kmUpdate };

    // Step 3: Test PH
    const phUpdate = await testPH(state);
    state = { ...state, ...phUpdate };

    // Step 4: Fit one-piece models
    const onePieceUpdate = await fitOnePieceModels(state);
    state = { ...state, ...onePieceUpdate };

    // Step 5: Fit piecewise models
    const piecewiseUpdate = await fitPiecewiseModels(state);
    state = { ...state, ...piecewiseUpdate };

    // Step 6: Fit spline models
    const splineUpdate = await fitSplineModels(state);
    state = { ...state, ...splineUpdate };

    // Step 7: Generate synthesis
    await generateSynthesis(state);
  } catch (error) {
    // Update analysis status to failed with error message
    const db = await getDatabase(getDatabaseUrl()!);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Workflow Error] Analysis ${analysisId}:`, errorMessage);
    console.error('Full error:', error);

    await db.update(analyses)
      .set({
        status: 'failed',
        error_message: errorMessage,
        updated_at: new Date(),
      })
      .where(eq(analyses.id, analysisId));

    // Don't re-throw - error is logged and stored
    return;
  }
}


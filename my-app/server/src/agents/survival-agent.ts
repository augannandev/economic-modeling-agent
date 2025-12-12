// LangGraph imports removed - using sequential workflow for now
import { loadPseudoIPD } from '../tools/data-loader';
import { EXTERNAL_BENCHMARKS } from '../lib/external-benchmarks';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
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
import { getDatabaseUrl, getDataDirectory } from '../lib/env';
import { analyses, models, visionAssessments, reasoningAssessments, plots, phTests, synthesisReports, tokenUsage } from '../schema/analyses';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { Distribution } from '../tools/one-piece-fitter';
import {
  isSupabaseConfigured,
  createAnalysis as createSupabaseAnalysis,
  updateAnalysis as updateSupabaseAnalysis,
  saveModel as saveSupabaseModel,
  savePHTest as saveSupabasePHTest,
  saveSynthesisReport as saveSupabaseSynthesis
} from '../lib/supabase';

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
  project_id?: string;  // Optional: for saving to Supabase
  supabase_analysis_id?: string;  // Supabase analysis UUID
  workflow_state: WorkflowState;
  progress: number;
  total_models: number;
  endpointType: 'OS' | 'PFS';
  data?: {
    chemo: any;
    pembro: any;
  };
  data_source?: 'project' | 'demo' | 'local';  // Track where data came from
  km_curves?: {
    chemo: any;
    pembro: any;
  };
  ph_tests?: any;
  cutpoint_results?: {
    chemo: any;  // ChowTestResult
    pembro: any; // ChowTestResult
  };
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
 * Helper to map VisionAssessmentResult to database format
 * The interface was updated but database schema uses older field names
 */
function mapVisionToDbFormat(vision: any): {
  short_term_observations: string;
  long_term_observations: string;
  strengths: string;
  weaknesses: string;
  concerns: string;
} {
  // Build short-term observations from early/mid/late periods
  const shortTermObs = [
    vision.observations?.early?.fit_quality,
    vision.observations?.mid?.fit_quality,
    vision.observations?.late?.fit_quality,
  ].filter(Boolean).join('; ') || '';

  // Build long-term observations from extrapolation
  const longTermObs = [
    vision.observations?.extrapolation?.trajectory,
    vision.observations?.extrapolation?.plausibility,
  ].filter(Boolean).join('; ') || '';

  // Concerns from red_flags and extrapolation concerns
  const concerns = [
    ...(vision.red_flags || []),
    ...(vision.observations?.extrapolation?.concerns || []),
  ].join('; ') || '';

  return {
    short_term_observations: shortTermObs,
    long_term_observations: longTermObs,
    strengths: Array.isArray(vision.strengths) ? vision.strengths.join('; ') : (vision.strengths || ''),
    weaknesses: Array.isArray(vision.weaknesses) ? vision.weaknesses.join('; ') : (vision.weaknesses || ''),
    concerns,
  };
}

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
 * Loads IPD from Supabase if project_id is set, otherwise from local/demo data
 */
async function loadData(state: SurvivalAnalysisState): Promise<Partial<SurvivalAnalysisState>> {
  const dataResult = await loadPseudoIPD(state.endpointType, state.project_id);
  const { data_source, ...data } = dataResult;
  return {
    data,
    data_source,
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
            endpoint: state.endpointType,
            approach: 'One-piece',
            distribution,
            aic: modelResult.aic,
            bic: modelResult.bic,
          }
        );

        // Map vision assessment to database format
        const visionDbData = mapVisionToDbFormat(visionAssessment);

        // Save vision assessment
        const visionId = randomUUID();
        await db.insert(visionAssessments).values({
          id: visionId,
          model_id: modelId,
          short_term_score: visionAssessment.short_term_score,
          long_term_score: visionAssessment.long_term_score,
          short_term_observations: visionDbData.short_term_observations,
          long_term_observations: visionDbData.long_term_observations,
          strengths: visionDbData.strengths,
          weaknesses: visionDbData.weaknesses,
          concerns: visionDbData.concerns,
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

  // Store cutpoint results for synthesis
  const cutpointResults: { chemo?: any; pembro?: any } = {};

  for (const arm of ARMS) {
    // Detect cutpoint for this arm (returns full Chow test statistics)
    const cutpointResult = await detectCutpointTool(state.data[arm], arm, 12, 52);
    cutpointResults[arm] = cutpointResult;
    const cutpoint = cutpointResult.cutpoint; // Extract numeric cutpoint for model fitting

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
            endpoint: state.endpointType,
            approach: 'Piecewise',
            distribution,
            aic: modelResult.aic,
            bic: modelResult.bic,
            cutpoint,
          },
          // Format benchmark context for Vision LLM
          EXTERNAL_BENCHMARKS[arm as keyof typeof EXTERNAL_BENCHMARKS] ?
            JSON.stringify(EXTERNAL_BENCHMARKS[arm as keyof typeof EXTERNAL_BENCHMARKS], null, 2) :
            undefined
        );

        // Map vision assessment to database format
        const visionDbData = mapVisionToDbFormat(visionAssessment);

        // Save vision assessment
        await db.insert(visionAssessments).values({
          id: randomUUID(),
          model_id: modelId,
          short_term_score: visionAssessment.short_term_score,
          long_term_score: visionAssessment.long_term_score,
          short_term_observations: visionDbData.short_term_observations,
          long_term_observations: visionDbData.long_term_observations,
          strengths: visionDbData.strengths,
          weaknesses: visionDbData.weaknesses,
          concerns: visionDbData.concerns,
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Piecewise Fit Error] Model: ${distribution}, Arm: ${arm}, Cutpoint: ${cutpoint.toFixed(1)}m. Error details:`, errorMessage);
        if (distribution === 'generalized-gamma' && arm === 'chemo') {
          console.error(`[CRITICAL DEBUG] Failed to fit generalised-gamma for chemo. This distribution is known to be unstable with certain cutpoints.`);
        }
        // Continue with next model
      }
    }
  }

  return {
    fitted_models: fittedModels,
    cutpoint_results: cutpointResults as { chemo: any; pembro: any },
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
              endpoint: state.endpointType,
              approach: 'Spline',
              distribution: `${scale}-scale (${knots} knots)`,
              aic: modelResult.aic,
              bic: modelResult.bic,
              scale,
            },
            // Format benchmark context for Vision LLM
            EXTERNAL_BENCHMARKS[arm as keyof typeof EXTERNAL_BENCHMARKS] ?
              JSON.stringify(EXTERNAL_BENCHMARKS[arm as keyof typeof EXTERNAL_BENCHMARKS], null, 2) :
              undefined
          );

          // Map vision assessment to database format
          const visionDbData = mapVisionToDbFormat(visionAssessment);

          // Save vision assessment
          await db.insert(visionAssessments).values({
            id: randomUUID(),
            model_id: modelId,
            short_term_score: visionAssessment.short_term_score,
            long_term_score: visionAssessment.long_term_score,
            short_term_observations: visionDbData.short_term_observations,
            long_term_observations: visionDbData.long_term_observations,
            strengths: visionDbData.strengths,
            weaknesses: visionDbData.weaknesses,
            concerns: visionDbData.concerns,
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

  // Generate IPD KM plots if using demo data
  let ipdKmPlot: string | undefined = undefined;
  if (state.data_source === 'demo' && state.data) {
    try {
      const { getPythonServiceUrl } = await import('../lib/env');
      const pythonServiceUrl = getPythonServiceUrl();
      const response = await fetch(`${pythonServiceUrl}/plot-km-from-ipd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chemo_time: state.data.chemo.time,
          chemo_event: state.data.chemo.event,
          pembro_time: state.data.pembro.time,
          pembro_event: state.data.pembro.event,
          endpoint_type: state.endpointType
        }),
      });

      if (response.ok) {
        const plotResult = await response.json() as { plot_base64?: string; p_value?: number };
        if (plotResult.plot_base64) {
          ipdKmPlot = plotResult.plot_base64;
          console.log(`[Synthesis] Generated IPD KM plot for demo data`);
        }
      } else {
        console.warn(`[Synthesis] Failed to generate IPD KM plot: ${response.statusText}`);
      }
    } catch (error) {
      console.warn(`[Synthesis] Error generating IPD KM plot: ${error}`);
      // Don't fail synthesis if plot generation fails
    }

    // Check for R-generated IPD plot (reconstructed_km_plot.png)
    if (!ipdKmPlot) {
      try {
        const dataDir = getDataDirectory();
        // Resolve absolute path (handle relative paths from cwd)
        const absDataDir = dataDir.startsWith('/') ? dataDir : resolve(process.cwd(), dataDir);
        const rPlotPath = join(absDataDir, 'reconstructed_km_plot.png');

        // If plot doesn't exist, try to generate it using the R script
        if (!existsSync(rPlotPath)) {
          console.log('[Synthesis] R IPD plot not found, attempting to generate...');
          try {
            // Assume R script is in r-service sibling directory
            // workspace/my-app/server -> workspace/my-app/r-service
            const rScriptPath = resolve(process.cwd(), '../r-service/plot_reconstructed_km.R');

            if (existsSync(rScriptPath)) {
              await execAsync(`Rscript "${rScriptPath}"`);
              console.log('[Synthesis] Executed R plot script');
            } else {
              console.warn(`[Synthesis] R plot script not found at ${rScriptPath}`);
            }
          } catch (execErr) {
            console.warn('[Synthesis] Failed to run R plot script:', execErr);
          }
        }

        if (existsSync(rPlotPath)) {
          ipdKmPlot = readFileSync(rPlotPath, 'base64');
          console.log('[Synthesis] Loaded R-generated IPD KM plot');
        }
      } catch (err) {
        console.warn('[Synthesis] Error loading R-generated IPD plot:', err);
      }
    }
  }

  // Prepare assessment data for synthesis
  const assessmentData = state.fitted_models.map(model => ({
    model_id: model.model_id,
    arm: model.model_result.arm,
    approach: model.model_result.approach,
    // Fix for Spline models having undefined distribution
    distribution: model.model_result.distribution || (
      model.model_result.approach === 'Spline'
        ? `${model.model_result.scale}-scale (${model.model_result.knots} knots)`
        : model.model_result.distribution
    ),
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
    // Include recommendation for categorization
    recommendation: model.vision_assessment?.recommendation || undefined,
    extracted_predictions: model.vision_assessment?.extracted_predictions || undefined,
    red_flags: model.vision_assessment?.red_flags || undefined,
    // Include plots for base case models (will be filtered in synthesis)
    plots: model.plots ? {
      short_term_base64: model.plots.short_term?.base64_data,
      long_term_base64: model.plots.long_term?.base64_data,
    } : undefined,
    computed_predictions: model.model_result.predictions ? {
      "60": model.model_result.predictions["60"],
      "120": model.model_result.predictions["120"]
    } : undefined,
  }));

  // Process diagnostic plots - load from file if needed
  let phTestsForSynthesis = state.ph_tests ? { ...state.ph_tests } : undefined;

  if (phTestsForSynthesis) {
    const processedPlots: Record<string, string> = {
      ...(phTestsForSynthesis.diagnostic_plots || {})
    };

    // Add IPD KM plot if available
    if (ipdKmPlot) {
      processedPlots['ipd_km_plot'] = ipdKmPlot;
    }

    // Check for file paths and load them as base64
    for (const [key, value] of Object.entries(processedPlots)) {
      if (typeof value === 'string' && (value.startsWith('/') || value.startsWith('./') || value.startsWith('../'))) {
        try {
          if (existsSync(value)) {
            const fileData = readFileSync(value, 'base64');
            processedPlots[key] = fileData;
            console.log(`[Synthesis] Loaded diagnostic plot ${key} from file`);
          } else {
            console.warn(`[Synthesis] Diagnostic plot file not found: ${value}`);
          }
        } catch (err) {
          console.warn(`[Synthesis] Error reading diagnostic plot ${key}: ${err}`);
        }
      }
    }

    phTestsForSynthesis.diagnostic_plots = processedPlots;
  } else if (ipdKmPlot) {
    // Create new PH tests object just for the plot if missing
    phTestsForSynthesis = {
      chow_test_pvalue: 0,
      schoenfeld_pvalue: 0,
      logrank_pvalue: 0,
      decision: 'pooled',
      rationale: 'Generated for IPD plot',
      diagnostic_plots: { ipd_km_plot: ipdKmPlot }
    };
  }

  const synthesis = await synthesizeCrossModel(assessmentData, phTestsForSynthesis, state.cutpoint_results);

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
 * 
 * @param analysisId - Local database analysis ID
 * @param userId - User ID
 * @param endpointType - 'OS' or 'PFS'
 * @param projectId - Optional Supabase project ID for persistent storage
 */
export async function runSurvivalAnalysisWorkflow(
  analysisId: string,
  userId: string,
  endpointType: 'OS' | 'PFS' = 'OS',
  projectId?: string
): Promise<void> {
  let state: SurvivalAnalysisState = {
    analysis_id: analysisId,
    user_id: userId,
    project_id: projectId,
    endpointType,
    workflow_state: 'DATA_LOADED',
    progress: 0,
    total_models: 42,
    fitted_models: [],
  };

  // Create Supabase analysis record if projectId provided
  if (projectId && isSupabaseConfigured()) {
    try {
      const supabaseResult = await createSupabaseAnalysis({
        project_id: projectId,
        endpoint_type: endpointType,
        status: 'running',
        workflow_state: 'DATA_LOADED',
        progress: 0,
        total_steps: 42,
        parameters: { localAnalysisId: analysisId },
      });

      if (supabaseResult.data && supabaseResult.data.length > 0) {
        state.supabase_analysis_id = supabaseResult.data[0].id;
        console.log(`[Supabase] Created analysis record: ${state.supabase_analysis_id}`);
      } else if (supabaseResult.error) {
        console.warn(`[Supabase] Failed to create analysis: ${supabaseResult.error}`);
      }
    } catch (err) {
      console.warn('[Supabase] Could not create analysis record:', err);
    }
  }

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

    // Save PH test to Supabase
    if (state.supabase_analysis_id && state.ph_tests) {
      await saveSupabasePHTest({
        analysis_id: state.supabase_analysis_id,
        chow_test_pvalue: state.ph_tests.chow_test_pvalue,
        schoenfeld_pvalue: state.ph_tests.schoenfeld_pvalue,
        logrank_pvalue: state.ph_tests.logrank_pvalue,
        decision: state.ph_tests.decision,
        rationale: state.ph_tests.rationale,
        diagnostic_plots: state.ph_tests.diagnostic_plots,
      }).catch(err => console.warn('[Supabase] PH test save error:', err));
    }

    // Step 4: Fit one-piece models
    const onePieceUpdate = await fitOnePieceModels(state);
    state = { ...state, ...onePieceUpdate };

    // Step 5: Fit piecewise models
    const piecewiseUpdate = await fitPiecewiseModels(state);
    state = { ...state, ...piecewiseUpdate };

    // Step 6: Fit spline models
    const splineUpdate = await fitSplineModels(state);
    state = { ...state, ...splineUpdate };

    // Save all models to Supabase
    if (state.supabase_analysis_id) {
      for (const model of state.fitted_models) {
        await saveSupabaseModel({
          analysis_id: state.supabase_analysis_id,
          arm: model.model_result.arm,
          approach: model.model_result.approach,
          distribution: model.model_result.distribution,
          scale: model.model_result.scale,
          knots: model.model_result.knots,
          cutpoint: model.model_result.cutpoint,
          parameters: model.model_result.parameters || {},
          aic: model.model_result.aic,
          bic: model.model_result.bic,
          log_likelihood: model.model_result.log_likelihood,
          model_order: state.fitted_models.indexOf(model) + 1,
        }).catch(err => console.warn(`[Supabase] Model save error:`, err));
      }
      console.log(`[Supabase] Saved ${state.fitted_models.length} models`);
    }

    // Step 7: Generate synthesis
    await generateSynthesis(state);

    // Save synthesis to Supabase
    if (state.supabase_analysis_id && state.synthesis_report) {
      await saveSupabaseSynthesis({
        analysis_id: state.supabase_analysis_id,
        primary_recommendation: state.synthesis_report.primary_recommendation,
        key_uncertainties: state.synthesis_report.key_uncertainties,
        hta_strategy: state.synthesis_report.hta_strategy,
        full_text: state.synthesis_report.full_text || JSON.stringify(state.synthesis_report),
      }).catch(err => console.warn('[Supabase] Synthesis save error:', err));

      // Update analysis as completed
      await updateSupabaseAnalysis(state.supabase_analysis_id, {
        status: 'completed',
        workflow_state: 'SYNTHESIS_COMPLETE',
        progress: state.total_models,
      }).catch(err => console.warn('[Supabase] Analysis update error:', err));

      console.log(`[Supabase] Analysis complete and saved`);
    }
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

    // Also update Supabase if we have an analysis record
    if (state.supabase_analysis_id) {
      await updateSupabaseAnalysis(state.supabase_analysis_id, {
        status: 'failed',
        error_message: errorMessage,
      }).catch(err => console.warn('[Supabase] Failed to update error status:', err));
    }

    // Don't re-throw - error is logged and stored
    return;
  }
}


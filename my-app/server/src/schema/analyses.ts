import { pgTable, text, timestamp, jsonb, integer, real, boolean } from 'drizzle-orm/pg-core';
import { appSchema } from './users';

export const analyses = appSchema.table('analyses', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  status: text('status').notNull(), // 'pending', 'running', 'completed', 'failed'
  workflow_state: text('workflow_state'), // DATA_LOADED, PH_TESTING_COMPLETE, etc.
  progress: integer('progress').default(0), // Current model number (0-42)
  total_models: integer('total_models').default(42),
  parameters: jsonb('parameters'), // Analysis parameters
  error_message: text('error_message'), // Error message if status is 'failed'
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
  completed_at: timestamp('completed_at'),
});

export const phTests = appSchema.table('ph_tests', {
  id: text('id').primaryKey(),
  analysis_id: text('analysis_id').notNull().references(() => analyses.id, { onDelete: 'cascade' }),
  chow_test_pvalue: real('chow_test_pvalue'),
  schoenfeld_pvalue: real('schoenfeld_pvalue'),
  logrank_pvalue: real('logrank_pvalue'),
  decision: text('decision').notNull(), // 'separate' or 'pooled'
  rationale: text('rationale'),
  diagnostic_plots: jsonb('diagnostic_plots'), // Plot metadata
  vision_assessment: jsonb('vision_assessment'),
  reasoning_assessment: jsonb('reasoning_assessment'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const models = appSchema.table('models', {
  id: text('id').primaryKey(),
  analysis_id: text('analysis_id').notNull().references(() => analyses.id, { onDelete: 'cascade' }),
  arm: text('arm').notNull(), // 'chemo' or 'pembro'
  approach: text('approach').notNull(), // 'one-piece', 'piecewise', 'spline'
  distribution: text('distribution'), // 'exponential', 'weibull', etc.
  scale: text('scale'), // For splines: 'hazard', 'odds', 'normal'
  knots: integer('knots'), // For splines: 1, 2, or 3
  cutpoint: real('cutpoint'), // For piecewise models
  parameters: jsonb('parameters').notNull(),
  aic: real('aic'),
  bic: real('bic'),
  log_likelihood: real('log_likelihood'),
  model_order: integer('model_order').notNull(), // Order in which model was fitted (1-42)
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const modelAssessments = appSchema.table('model_assessments', {
  id: text('id').primaryKey(),
  model_id: text('model_id').notNull().references(() => models.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const visionAssessments = appSchema.table('vision_assessments', {
  id: text('id').primaryKey(),
  model_id: text('model_id').notNull().references(() => models.id, { onDelete: 'cascade' }),
  short_term_score: real('short_term_score'), // 0-10
  long_term_score: real('long_term_score'), // 0-10
  short_term_observations: text('short_term_observations'),
  long_term_observations: text('long_term_observations'),
  strengths: text('strengths'),
  weaknesses: text('weaknesses'),
  concerns: text('concerns'),
  token_usage: integer('token_usage'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const reasoningAssessments = appSchema.table('reasoning_assessments', {
  id: text('id').primaryKey(),
  model_id: text('model_id').notNull().references(() => models.id, { onDelete: 'cascade' }),
  full_text: text('full_text').notNull(), // 3200-4100 words
  sections: jsonb('sections'), // Structured sections
  token_usage: integer('token_usage'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const plots = appSchema.table('plots', {
  id: text('id').primaryKey(),
  model_id: text('model_id').notNull().references(() => models.id, { onDelete: 'cascade' }),
  plot_type: text('plot_type').notNull(), // 'short_term' or 'long_term'
  file_path: text('file_path').notNull(),
  base64_data: text('base64_data'), // For Vision LLM
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const synthesisReports = appSchema.table('synthesis_reports', {
  id: text('id').primaryKey(),
  analysis_id: text('analysis_id').notNull().references(() => analyses.id, { onDelete: 'cascade' }),
  within_approach_rankings: jsonb('within_approach_rankings'),
  cross_approach_comparison: jsonb('cross_approach_comparison'),
  primary_recommendation: text('primary_recommendation'),
  sensitivity_recommendations: jsonb('sensitivity_recommendations'),
  key_uncertainties: text('key_uncertainties'),
  hta_strategy: text('hta_strategy'),
  full_text: text('full_text').notNull(), // 6000-8000 words
  token_usage: integer('token_usage'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const tokenUsage = appSchema.table('token_usage', {
  id: text('id').primaryKey(),
  analysis_id: text('analysis_id').references(() => analyses.id, { onDelete: 'cascade' }),
  model_id: text('model_id').references(() => models.id, { onDelete: 'cascade' }),
  model_type: text('model_type').notNull(), // 'vision', 'reasoning', 'synthesis'
  tokens_input: integer('tokens_input').notNull(),
  tokens_output: integer('tokens_output').notNull(),
  cost_estimate: real('cost_estimate'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

export type Analysis = typeof analyses.$inferSelect;
export type NewAnalysis = typeof analyses.$inferInsert;
export type Model = typeof models.$inferSelect;
export type NewModel = typeof models.$inferInsert;
export type VisionAssessment = typeof visionAssessments.$inferSelect;
export type ReasoningAssessment = typeof reasoningAssessments.$inferSelect;
export type SynthesisReport = typeof synthesisReports.$inferSelect;


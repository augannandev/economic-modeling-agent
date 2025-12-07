import { pgTable, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';
import { analyses } from './analyses';
import { users } from './users';

/**
 * User decisions table - tracks HITL decisions on agent recommendations
 */
export const userDecisions = pgTable('user_decisions', {
  id: text('id').primaryKey(),
  analysis_id: text('analysis_id').notNull().references(() => analyses.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull().references(() => users.id),
  
  // Decision type
  decision_type: text('decision_type').notNull(), // 'model_selection', 'extrapolation_approval', etc.
  
  // What the agent recommended
  agent_recommendation: jsonb('agent_recommendation').$type<{
    arm: string;
    recommended_model: string;
    recommended_approach: string;
    confidence: number;
    reasoning: string;
  }>(),
  
  // What the user decided
  user_decision: jsonb('user_decision').$type<{
    approved: boolean;
    selected_model?: string;
    selected_approach?: string;
    rationale: string;
  }>(),
  
  // Whether user approved agent's recommendation
  approved_recommendation: boolean('approved_recommendation').notNull().default(false),
  
  // User's rationale for their decision
  rationale: text('rationale'),
  
  // Timestamps
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Model rankings table - stores user's final model rankings after review
 */
export const modelRankings = pgTable('model_rankings', {
  id: text('id').primaryKey(),
  analysis_id: text('analysis_id').notNull().references(() => analyses.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull().references(() => users.id),
  
  // Arm (treatment or control)
  arm: text('arm').notNull(),
  
  // Ranked models (ordered by preference)
  ranked_models: jsonb('ranked_models').$type<Array<{
    rank: number;
    model_id: string;
    model_name: string;
    approach: string;
    rationale: string;
  }>>(),
  
  // Primary model selection
  primary_model_id: text('primary_model_id'),
  primary_model_rationale: text('primary_model_rationale'),
  
  // Sensitivity analysis models
  sensitivity_model_ids: jsonb('sensitivity_model_ids').$type<string[]>(),
  
  // Timestamps
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export type UserDecision = typeof userDecisions.$inferSelect;
export type NewUserDecision = typeof userDecisions.$inferInsert;
export type ModelRanking = typeof modelRankings.$inferSelect;
export type NewModelRanking = typeof modelRankings.$inferInsert;


import { pgTable, text, timestamp, jsonb, integer, real } from 'drizzle-orm/pg-core';
import { projects } from './projects';

/**
 * Endpoint types for survival analysis
 */
export type EndpointType = 'OS' | 'PFS' | 'DFS' | 'EFS' | 'TTP' | 'ORR' | 'CR' | 'PR' | 'OTHER';

/**
 * Endpoints table - defines clinical endpoints for analysis
 */
export const endpoints = pgTable('endpoints', {
  id: text('id').primaryKey(),
  
  // Parent project
  project_id: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  
  // Endpoint type
  endpoint_type: text('endpoint_type').notNull().$type<EndpointType>(), // OS, PFS, DFS, etc.
  
  // Custom name if endpoint_type is OTHER
  custom_name: text('custom_name'),
  
  // Full description
  description: text('description'),
  
  // Time horizon for extrapolation (in months)
  time_horizon: integer('time_horizon').default(240), // 20 years default
  
  // Observed follow-up duration (in months)
  observed_followup: real('observed_followup'),
  
  // Median survival (if available)
  median_survival: jsonb('median_survival').$type<{
    treatment?: number;
    comparator?: number;
    unit?: string; // months, weeks
  }>(),
  
  // Status
  status: text('status').notNull().default('pending'), // pending, data_ready, analyzed, reviewed
  
  // Analysis configuration
  analysis_config: jsonb('analysis_config').$type<{
    modelApproaches?: string[]; // one-piece, piecewise, spline
    distributionsToFit?: string[];
    useSeerValidation?: boolean;
    seerStage?: string;
  }>(),
  
  // Order for display
  display_order: integer('display_order').notNull().default(0),
  
  // Timestamps
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export type Endpoint = typeof endpoints.$inferSelect;
export type NewEndpoint = typeof endpoints.$inferInsert;


import { pgTable, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Projects table - main container for economic modeling analyses
 */
export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  
  // Owner
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Basic info
  name: text('name').notNull(),
  description: text('description'),
  
  // Therapeutic area (e.g., Oncology, Cardiology)
  therapeutic_area: text('therapeutic_area'),
  
  // Disease/condition (e.g., NSCLC, Melanoma)
  disease_condition: text('disease_condition'),
  
  // Patient population (e.g., PD-L1 TPS ≥50%, ECOG PS 0-1)
  population: text('population'),
  
  // ClinicalTrials.gov identifier (e.g., NCT02142738)
  nct_id: text('nct_id'),
  
  // Drug/intervention being evaluated
  intervention: text('intervention'),
  
  // Comparator (e.g., Standard of Care, Placebo)
  comparator: text('comparator'),
  
  // Project status
  status: text('status').notNull().default('draft'), // draft, active, completed, archived
  
  // Project settings
  settings: jsonb('settings').$type<{
    defaultTimeHorizon?: number; // in months
    currency?: string;
    discountRate?: number;
  }>(),
  
  // Timestamps
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;


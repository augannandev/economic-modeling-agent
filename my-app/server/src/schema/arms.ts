import { pgTable, text, timestamp, jsonb, boolean, integer } from 'drizzle-orm/pg-core';
import { projects } from './projects';

/**
 * Treatment arms table - defines treatment arms within a project
 */
export const arms = pgTable('arms', {
  id: text('id').primaryKey(),
  
  // Parent project
  project_id: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  
  // Arm info
  name: text('name').notNull(), // e.g., "Pembrolizumab", "Chemotherapy"
  
  // Arm type
  arm_type: text('arm_type').notNull().default('treatment'), // treatment, comparator, control
  
  // Short label for plots/tables
  label: text('label'), // e.g., "Pembro", "Chemo"
  
  // Color for visualizations (hex code)
  color: text('color'),
  
  // Drug details
  drug_name: text('drug_name'),
  dosage: text('dosage'),
  regimen: text('regimen'), // e.g., "200mg Q3W"
  
  // Sample size (if known)
  sample_size: integer('sample_size'),
  
  // Order for display
  display_order: integer('display_order').notNull().default(0),
  
  // Additional metadata
  metadata: jsonb('metadata').$type<{
    trialPhase?: string;
    studyArm?: string;
    notes?: string;
  }>(),
  
  // Timestamps
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export type Arm = typeof arms.$inferSelect;
export type NewArm = typeof arms.$inferInsert;


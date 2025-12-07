import { pgTable, text, timestamp, jsonb, integer, boolean } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { arms } from './arms';
import { endpoints } from './endpoints';

/**
 * Data source types
 */
export type DataSourceType = 'ipd_parquet' | 'ipd_csv' | 'digitized' | 'published_km' | 'external_api';

/**
 * Data sources table - tracks all data inputs for a project
 */
export const dataSources = pgTable('data_sources', {
  id: text('id').primaryKey(),
  
  // Parent project
  project_id: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  
  // Associated arm (optional - some data sources span multiple arms)
  arm_id: text('arm_id').references(() => arms.id, { onDelete: 'set null' }),
  
  // Associated endpoint (optional)
  endpoint_id: text('endpoint_id').references(() => endpoints.id, { onDelete: 'set null' }),
  
  // Source type
  source_type: text('source_type').notNull().$type<DataSourceType>(),
  
  // Name/label
  name: text('name').notNull(),
  
  // File path (for uploaded files)
  file_path: text('file_path'),
  
  // Original filename
  original_filename: text('original_filename'),
  
  // File size in bytes
  file_size: integer('file_size'),
  
  // MIME type
  mime_type: text('mime_type'),
  
  // Is this the primary data source for the endpoint/arm?
  is_primary: boolean('is_primary').default(false),
  
  // Data summary (computed after processing)
  data_summary: jsonb('data_summary').$type<{
    recordCount?: number;
    eventCount?: number;
    censoredCount?: number;
    medianFollowUp?: number;
    columns?: string[];
  }>(),
  
  // Digitization metadata (if source_type is 'digitized')
  digitization_info: jsonb('digitization_info').$type<{
    km_image_path?: string;
    risk_table_image_path?: string;
    extraction_confidence?: number;
    points_extracted?: number;
    was_manually_corrected?: boolean;
  }>(),
  
  // Publication reference (if from published source)
  publication_ref: jsonb('publication_ref').$type<{
    title?: string;
    authors?: string;
    journal?: string;
    year?: number;
    doi?: string;
    figure_number?: string;
  }>(),
  
  // Processing status
  processing_status: text('processing_status').default('pending'), // pending, processing, ready, error
  processing_error: text('processing_error'),
  
  // Timestamps
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
  processed_at: timestamp('processed_at'),
});

export type DataSource = typeof dataSources.$inferSelect;
export type NewDataSource = typeof dataSources.$inferInsert;


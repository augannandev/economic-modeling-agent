-- Migration: Add clinical trial fields to projects table
-- Run this in Supabase SQL Editor

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS therapeutic_area TEXT,
ADD COLUMN IF NOT EXISTS disease TEXT,
ADD COLUMN IF NOT EXISTS population TEXT,
ADD COLUMN IF NOT EXISTS nct_id TEXT;

-- Add index for NCT lookups
CREATE INDEX IF NOT EXISTS idx_projects_nct ON projects(nct_id) WHERE nct_id IS NOT NULL;

-- Optional: Add comment for documentation
COMMENT ON COLUMN projects.therapeutic_area IS 'Therapeutic area (e.g., Oncology, Cardiology)';
COMMENT ON COLUMN projects.disease IS 'Disease/indication (e.g., NSCLC, Heart Failure)';
COMMENT ON COLUMN projects.population IS 'Patient population criteria';
COMMENT ON COLUMN projects.nct_id IS 'ClinicalTrials.gov identifier (e.g., NCT02142738)';

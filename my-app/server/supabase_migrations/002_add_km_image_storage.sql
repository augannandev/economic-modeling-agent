-- Migration: Add image storage and project link to km_extraction_cache
-- Run this in Supabase SQL Editor

-- Add new columns
ALTER TABLE km_extraction_cache 
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS image_data TEXT,           -- Base64 encoded image
ADD COLUMN IF NOT EXISTS image_filename TEXT;       -- Original filename

-- Create index for project lookup
CREATE INDEX IF NOT EXISTS idx_km_cache_project ON km_extraction_cache(project_id);

-- Update the unique constraint to allow same image in different projects
-- First drop the old constraint if it exists
ALTER TABLE km_extraction_cache DROP CONSTRAINT IF EXISTS km_extraction_cache_image_hash_key;

-- Create a new unique constraint on (project_id, image_hash)
-- This allows the same image to be used in multiple projects
CREATE UNIQUE INDEX IF NOT EXISTS idx_km_cache_project_hash 
ON km_extraction_cache(project_id, image_hash) 
WHERE project_id IS NOT NULL;

-- Keep the old index for backward compatibility (images without projects)
CREATE UNIQUE INDEX IF NOT EXISTS idx_km_cache_hash_no_project 
ON km_extraction_cache(image_hash) 
WHERE project_id IS NULL;

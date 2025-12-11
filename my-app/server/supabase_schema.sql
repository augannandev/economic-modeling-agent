-- ============================================
-- SurvivalAgent Database Schema
-- Run this in your Supabase Dashboard SQL Editor
-- https://supabase.com/dashboard/project/wmuweqhuwsrpwliunsqn/sql
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Table: projects
-- Main container for analyses
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT,  -- Optional: for multi-user support
    
    -- Basic info
    name TEXT NOT NULL,
    description TEXT,
    
    -- Study details
    therapeutic_area TEXT,        -- e.g., 'Oncology'
    disease_condition TEXT,       -- e.g., 'NSCLC'
    intervention TEXT,            -- e.g., 'Pembrolizumab'
    comparator TEXT,              -- e.g., 'Chemotherapy'
    
    -- Status
    status TEXT NOT NULL DEFAULT 'draft',  -- draft, active, completed, archived
    
    -- Settings (JSONB for flexibility)
    settings JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- ============================================
-- Table: ipd_data
-- Stores reconstructed IPD for each project/endpoint/arm
-- ============================================
CREATE TABLE IF NOT EXISTS ipd_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    endpoint_type TEXT NOT NULL,  -- 'OS', 'PFS', 'DFS', 'EFS', 'TTP'
    arm TEXT NOT NULL,            -- 'Chemotherapy', 'Pembrolizumab', etc.
    
    -- IPD data stored as JSONB array
    ipd_data JSONB NOT NULL,      -- [{patient_id, time, event, arm}, ...]
    
    -- Summary statistics
    n_patients INTEGER NOT NULL,
    n_events INTEGER NOT NULL,
    median_followup REAL,
    
    -- Validation metrics (HR calculated between arms)
    validation_hr REAL,
    validation_hr_lower REAL,
    validation_hr_upper REAL,
    validation_pvalue REAL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint: one record per project/endpoint/arm
    CONSTRAINT unique_project_endpoint_arm UNIQUE (project_id, endpoint_type, arm)
);

CREATE INDEX IF NOT EXISTS idx_ipd_project ON ipd_data(project_id);
CREATE INDEX IF NOT EXISTS idx_ipd_endpoint ON ipd_data(endpoint_type);

-- ============================================
-- Table: analyses
-- Stores survival analysis runs linked to projects
-- ============================================
CREATE TABLE IF NOT EXISTS analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    endpoint_type TEXT NOT NULL,  -- Which endpoint this analysis is for
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed
    workflow_state TEXT,          -- DATA_LOADED, PH_TESTING, FITTING, SYNTHESIS, etc.
    progress INTEGER DEFAULT 0,   -- Current step number
    total_steps INTEGER DEFAULT 42,
    
    -- Analysis parameters
    parameters JSONB DEFAULT '{}',  -- {timeHorizon, modelApproaches, etc.}
    
    -- Error handling
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_analyses_project ON analyses(project_id);
CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);

-- ============================================
-- Table: ph_tests
-- Proportional hazards test results
-- ============================================
CREATE TABLE IF NOT EXISTS ph_tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    
    -- Test results
    chow_test_pvalue REAL,
    schoenfeld_pvalue REAL,
    logrank_pvalue REAL,
    
    -- Decision
    decision TEXT NOT NULL,       -- 'separate_arms' or 'pooled_model'
    rationale TEXT,
    
    -- Diagnostic plots (base64 or URLs)
    diagnostic_plots JSONB,
    
    -- LLM assessments
    vision_assessment JSONB,
    reasoning_assessment JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ph_tests_analysis ON ph_tests(analysis_id);

-- ============================================
-- Table: models
-- Fitted survival models
-- ============================================
CREATE TABLE IF NOT EXISTS models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    
    -- Model specification
    arm TEXT NOT NULL,            -- 'Chemotherapy', 'Pembrolizumab'
    approach TEXT NOT NULL,       -- 'one-piece', 'piecewise', 'spline'
    distribution TEXT,            -- 'exponential', 'weibull', 'log-normal', etc.
    scale TEXT,                   -- For splines: 'hazard', 'odds', 'normal'
    knots INTEGER,                -- For splines: 1, 2, or 3
    cutpoint REAL,                -- For piecewise models (in months)
    
    -- Model results
    parameters JSONB NOT NULL,    -- Model parameters
    aic REAL,
    bic REAL,
    log_likelihood REAL,
    
    -- Extrapolation results
    survival_predictions JSONB,   -- [{time, survival}, ...] for 0-240 months
    milestone_survival JSONB,     -- {1yr, 2yr, 5yr, 10yr survival rates}
    
    -- Fitting order
    model_order INTEGER NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_models_analysis ON models(analysis_id);
CREATE INDEX IF NOT EXISTS idx_models_arm ON models(arm);
CREATE INDEX IF NOT EXISTS idx_models_approach ON models(approach);

-- ============================================
-- Table: model_plots
-- Stores plot images for models
-- ============================================
CREATE TABLE IF NOT EXISTS model_plots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    
    plot_type TEXT NOT NULL,      -- 'short_term', 'long_term', 'hazard', 'cumhaz'
    base64_data TEXT,             -- Base64 encoded image
    file_path TEXT,               -- Or file path if stored externally
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plots_model ON model_plots(model_id);

-- ============================================
-- Table: model_assessments
-- LLM assessments of models
-- ============================================
CREATE TABLE IF NOT EXISTS model_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    
    -- Vision assessment
    short_term_score REAL,        -- 0-10
    long_term_score REAL,         -- 0-10
    visual_fit_notes TEXT,
    
    -- Reasoning assessment
    clinical_plausibility TEXT,
    statistical_quality TEXT,
    extrapolation_concerns TEXT,
    
    -- Overall
    recommendation TEXT,          -- 'recommended', 'acceptable', 'not_recommended'
    full_assessment TEXT,         -- Full text assessment
    
    token_usage INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessments_model ON model_assessments(model_id);

-- ============================================
-- Table: synthesis_reports
-- Final synthesis and recommendations
-- ============================================
CREATE TABLE IF NOT EXISTS synthesis_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    
    -- Rankings and comparisons
    within_approach_rankings JSONB,   -- Rankings within each approach
    cross_approach_comparison JSONB,  -- Comparison across approaches
    
    -- Recommendations
    primary_recommendation TEXT,
    sensitivity_recommendations JSONB,
    key_uncertainties TEXT,
    
    -- HTA strategy
    hta_strategy TEXT,
    
    -- Full report
    full_text TEXT NOT NULL,
    
    token_usage INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_synthesis_analysis ON synthesis_reports(analysis_id);

-- ============================================
-- Table: km_extraction_cache
-- Caches extracted KM curves to avoid re-digitization
-- ============================================
CREATE TABLE IF NOT EXISTS km_extraction_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    image_hash TEXT NOT NULL UNIQUE,  -- SHA-256 of the uploaded image
    endpoint_type TEXT,
    arm TEXT,
    
    -- Extracted curve data
    points JSONB NOT NULL,            -- [{time, survival}, ...]
    risk_table JSONB,                 -- [{time, atRisk, events}, ...]
    axis_ranges JSONB,                -- {xMin, xMax, yMin, yMax}
    
    -- Extraction metadata
    metadata JSONB,                   -- {numCurves, curveColors, studyInfo, etc.}
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_km_cache_hash ON km_extraction_cache(image_hash);

-- ============================================
-- Row Level Security (RLS)
-- Enable for all tables - allows anon access for now
-- ============================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipd_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ph_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_plots ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE synthesis_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE km_extraction_cache ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon (for development)
-- In production, you'd want more restrictive policies
CREATE POLICY "Allow all for anon" ON projects FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON ipd_data FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON analyses FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON ph_tests FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON models FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON model_plots FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON model_assessments FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON synthesis_reports FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON km_extraction_cache FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================
-- Useful views
-- ============================================

-- View: Project summary with IPD and analysis status
CREATE OR REPLACE VIEW project_summary AS
SELECT 
    p.id,
    p.name,
    p.intervention,
    p.comparator,
    p.status,
    p.created_at,
    COUNT(DISTINCT i.id) as n_ipd_records,
    COUNT(DISTINCT a.id) as n_analyses,
    MAX(a.updated_at) as last_analysis,
    COALESCE(
        (SELECT status FROM analyses WHERE project_id = p.id ORDER BY created_at DESC LIMIT 1),
        'no_analysis'
    ) as latest_analysis_status
FROM projects p
LEFT JOIN ipd_data i ON i.project_id = p.id
LEFT JOIN analyses a ON a.project_id = p.id
GROUP BY p.id;

-- View: Analysis summary with model counts
CREATE OR REPLACE VIEW analysis_summary AS
SELECT 
    a.id,
    a.project_id,
    a.endpoint_type,
    a.status,
    a.workflow_state,
    a.progress,
    a.total_steps,
    COUNT(DISTINCT m.id) as n_models,
    COUNT(DISTINCT CASE WHEN m.approach = 'one-piece' THEN m.id END) as n_one_piece,
    COUNT(DISTINCT CASE WHEN m.approach = 'piecewise' THEN m.id END) as n_piecewise,
    COUNT(DISTINCT CASE WHEN m.approach = 'spline' THEN m.id END) as n_spline,
    EXISTS(SELECT 1 FROM synthesis_reports WHERE analysis_id = a.id) as has_synthesis,
    a.created_at,
    a.completed_at
FROM analyses a
LEFT JOIN models m ON m.analysis_id = a.id
GROUP BY a.id;

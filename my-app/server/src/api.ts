import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authMiddleware } from './middleware/auth';
import { getDatabase, testDatabaseConnection } from './lib/db';
import { setEnvContext, clearEnvContext, getDatabaseUrl } from './lib/env';
import * as schema from './schema/users';
import { analyses, models, visionAssessments, reasoningAssessments, plots, phTests, synthesisReports, tokenUsage } from './schema/analyses';
import { projects } from './schema/projects';
import { arms } from './schema/arms';
import { endpoints } from './schema/endpoints';
import { dataSources } from './schema/data-sources';
import { runSurvivalAnalysisWorkflow } from './agents/survival-agent';
import { isSupabaseConfigured, supabaseRequest } from './lib/supabase';
import { eq, desc, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { streamSSE } from 'hono/streaming';
import { 
  createChatSession, 
  getChatSession, 
  addMessageToSession, 
  ChatMessage 
} from './lib/streaming';
import { processChatMessage } from './tools/chat-agent';

type Env = {
  RUNTIME?: string;
  [key: string]: any;
};

const app = new Hono<{ Bindings: Env }>();

// In Node.js environment, set environment context from process.env
if (typeof process !== 'undefined' && process.env) {
  setEnvContext(process.env);
}

// Environment context middleware - detect runtime using RUNTIME env var
app.use('*', async (c, next) => {
  if (c.env?.RUNTIME === 'cloudflare') {
    setEnvContext(c.env);
  }

  await next();
  // No need to clear context - env vars are the same for all requests
  // In fact, clearing the context would cause the env vars to potentially be unset for parallel requests
});

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*',  // Allow all origins for demo
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Health check route - public
app.get('/', (c) => c.json({ status: 'ok', message: 'API is running' }));

// API routes
const api = new Hono();

// Public routes go here (if any)
api.get('/hello', (c) => {
  return c.json({
    message: 'Hello from Hono!',
  });
});

// Database test route - public for testing
api.get('/db-test', async (c) => {
  try {
    // Use external DB URL if available, otherwise use local PostgreSQL database server
    // Note: In development, the port is dynamically allocated by port-manager.js
    const defaultLocalConnection = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5502/postgres';
    const dbUrl = getDatabaseUrl() || defaultLocalConnection;

    const db = await getDatabase(dbUrl);
    const isHealthy = await testDatabaseConnection();

    if (!isHealthy) {
      return c.json({
        error: 'Database connection is not healthy',
        timestamp: new Date().toISOString(),
      }, 500);
    }

    const result = await db.select().from(schema.users).limit(5);

    return c.json({
      message: 'Database connection successful!',
      users: result,
      connectionHealthy: isHealthy,
      usingLocalDatabase: !getDatabaseUrl(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Database test error:', error);
    return c.json({
      error: 'Database connection failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Protected routes - require authentication
const protectedRoutes = new Hono();

protectedRoutes.use('*', authMiddleware);

protectedRoutes.get('/me', (c) => {
  const user = c.get('user');
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      photo_url: user.photo_url,
      created_at: user.created_at,
      updated_at: user.updated_at,
    },
    message: 'You are authenticated!',
  });
});

// Mount the protected routes under /protected
api.route('/protected', protectedRoutes);

// Survival analysis routes
const survivalRoutes = new Hono();
survivalRoutes.use('*', authMiddleware);

// Start analysis workflow
survivalRoutes.post('/analyze', async (c) => {
  try {
    const user = c.get('user');
    const { endpointType = 'OS', projectId } = await c.req.json().catch(() => ({}));
    const analysisId = randomUUID();
    const db = await getDatabase(getDatabaseUrl()!);

    // Create analysis record
    await db.insert(analyses).values({
      id: analysisId,
      user_id: user.id,
      status: 'running',
      workflow_state: 'DATA_LOADED',
      progress: 0,
      total_models: 42,
      parameters: { endpointType, projectId },
    });

    // Run workflow asynchronously
    // If projectId is provided, results will also be saved to Supabase
    runSurvivalAnalysisWorkflow(
      analysisId, 
      user.id, 
      endpointType as 'OS' | 'PFS',
      projectId  // Pass projectId for Supabase storage
    ).catch((error) => {
      console.error('Workflow error:', error);
    });

    return c.json({
      analysis_id: analysisId,
      status: 'running',
      message: 'Analysis workflow started',
      projectId: projectId || null,
    });
  } catch (error) {
    console.error('Error starting analysis:', error);
    return c.json({
      error: 'Failed to start analysis',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// List Supabase projects (for project-specific IPD)
survivalRoutes.get('/supabase-projects', async (c) => {
  try {
    if (!isSupabaseConfigured()) {
      return c.json({ 
        projects: [], 
        supabaseConfigured: false,
        message: 'Supabase not configured. Using demo data.' 
      });
    }

    // Fetch projects from Supabase
    const result = await supabaseRequest<Array<{
      id: string;
      name: string;
      description?: string;
      created_at: string;
    }>>('projects', {
      method: 'GET',
      order: 'created_at.desc',
    });

    if (result.error) {
      console.warn('[API] Supabase projects fetch error:', result.error);
      return c.json({ 
        projects: [], 
        supabaseConfigured: true,
        error: result.error 
      });
    }

    // Also check which projects have IPD data
    const projectsWithIPD = await Promise.all(
      (result.data || []).map(async (project) => {
        const ipdResult = await supabaseRequest<Array<{ id: string }>>('ipd_data', {
          method: 'GET',
          filters: { project_id: `eq.${project.id}` },
          select: 'id',
        });
        
        return {
          ...project,
          hasIPD: (ipdResult.data?.length || 0) > 0,
          ipdCount: ipdResult.data?.length || 0,
        };
      })
    );

    return c.json({ 
      projects: projectsWithIPD,
      supabaseConfigured: true,
    });
  } catch (error) {
    console.error('Error fetching Supabase projects:', error);
    return c.json({
      projects: [],
      supabaseConfigured: true,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Create a new Supabase project
survivalRoutes.post('/supabase-projects', async (c) => {
  try {
    if (!isSupabaseConfigured()) {
      return c.json({ error: 'Supabase not configured' }, 400);
    }

    const { 
      name, 
      description, 
      therapeutic_area,
      disease,
      population,
      nct_id,
      intervention, 
      comparator 
    } = await c.req.json();

    if (!name) {
      return c.json({ error: 'Project name is required' }, 400);
    }

    const { createProject } = await import('./lib/supabase');
    const result = await createProject({
      name,
      description,
      therapeutic_area,
      disease,
      population,
      nct_id,
      intervention,
      comparator,
      status: 'active',
    });

    if (result.error) {
      return c.json({ error: result.error }, 500);
    }

    const project = result.data?.[0];
    return c.json({
      project: {
        ...project,
        hasIPD: false,
        ipdCount: 0,
      },
    });
  } catch (error) {
    console.error('Error creating Supabase project:', error);
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// List analyses
survivalRoutes.get('/analyses', async (c) => {
  try {
    const user = c.get('user');
    const db = await getDatabase(getDatabaseUrl()!);

    const results = await db.select()
      .from(analyses)
      .where(eq(analyses.user_id, user.id))
      .orderBy(desc(analyses.created_at));

    return c.json({ analyses: results });
  } catch (error) {
    return c.json({
      error: 'Failed to fetch analyses',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get analysis details
survivalRoutes.get('/analyses/:id', async (c) => {
  try {
    const user = c.get('user');
    const analysisId = c.req.param('id');
    const db = await getDatabase(getDatabaseUrl()!);

    const [analysis] = await db.select()
      .from(analyses)
      .where(eq(analyses.id, analysisId));

    if (!analysis || analysis.user_id !== user.id) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    return c.json({ analysis });
  } catch (error) {
    return c.json({
      error: 'Failed to fetch analysis',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get analysis status
survivalRoutes.get('/analyses/:id/status', async (c) => {
  try {
    const user = c.get('user');
    const analysisId = c.req.param('id');
    const db = await getDatabase(getDatabaseUrl()!);

    const [analysis] = await db.select()
      .from(analyses)
      .where(eq(analyses.id, analysisId));

    if (!analysis || analysis.user_id !== user.id) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    return c.json({
      status: analysis.status,
      workflow_state: analysis.workflow_state,
      progress: analysis.progress,
      total_models: analysis.total_models,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to fetch status',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// List models for an analysis
survivalRoutes.get('/analyses/:id/models', async (c) => {
  try {
    const user = c.get('user');
    const analysisId = c.req.param('id');
    const db = await getDatabase(getDatabaseUrl()!);

    // Verify analysis belongs to user
    const [analysis] = await db.select()
      .from(analyses)
      .where(eq(analyses.id, analysisId));

    if (!analysis || analysis.user_id !== user.id) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    const modelList = await db.select()
      .from(models)
      .where(eq(models.analysis_id, analysisId))
      .orderBy(models.model_order);

    return c.json({ models: modelList });
  } catch (error) {
    return c.json({
      error: 'Failed to fetch models',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get model details with assessments
survivalRoutes.get('/analyses/:id/models/:modelId', async (c) => {
  try {
    const user = c.get('user');
    const analysisId = c.req.param('id');
    const modelId = c.req.param('modelId');
    const db = await getDatabase(getDatabaseUrl()!);

    // Verify analysis belongs to user
    const [analysis] = await db.select()
      .from(analyses)
      .where(eq(analyses.id, analysisId));

    if (!analysis || analysis.user_id !== user.id) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    // Get model
    const [model] = await db.select()
      .from(models)
      .where(eq(models.id, modelId));

    if (!model || model.analysis_id !== analysisId) {
      return c.json({ error: 'Model not found' }, 404);
    }

    // Get vision assessment
    const [vision] = await db.select()
      .from(visionAssessments)
      .where(eq(visionAssessments.model_id, modelId));

    // Get reasoning assessment
    const [reasoning] = await db.select()
      .from(reasoningAssessments)
      .where(eq(reasoningAssessments.model_id, modelId));

    // Get plots
    const plotList = await db.select()
      .from(plots)
      .where(eq(plots.model_id, modelId));

    return c.json({
      model,
      vision_assessment: vision || null,
      reasoning_assessment: reasoning || null,
      plots: plotList,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to fetch model details',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get PH test results
survivalRoutes.get('/analyses/:id/ph-tests', async (c) => {
  try {
    const user = c.get('user');
    const analysisId = c.req.param('id');
    const db = await getDatabase(getDatabaseUrl()!);

    // Verify analysis belongs to user
    const [analysis] = await db.select()
      .from(analyses)
      .where(eq(analyses.id, analysisId));

    if (!analysis || analysis.user_id !== user.id) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    const [phTest] = await db.select()
      .from(phTests)
      .where(eq(phTests.analysis_id, analysisId));

    return c.json({ ph_tests: phTest || null });
  } catch (error) {
    return c.json({
      error: 'Failed to fetch PH tests',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get synthesis report
survivalRoutes.get('/analyses/:id/synthesis', async (c) => {
  try {
    const user = c.get('user');
    const analysisId = c.req.param('id');
    const db = await getDatabase(getDatabaseUrl()!);

    // Verify analysis belongs to user
    const [analysis] = await db.select()
      .from(analyses)
      .where(eq(analyses.id, analysisId));

    if (!analysis || analysis.user_id !== user.id) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    const [synthesis] = await db.select()
      .from(synthesisReports)
      .where(eq(synthesisReports.analysis_id, analysisId));

    return c.json({ synthesis: synthesis || null });
  } catch (error) {
    return c.json({
      error: 'Failed to fetch synthesis',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get reproducibility code package
survivalRoutes.get('/analyses/:id/code-package', async (c) => {
  try {
    const user = c.get('user');
    const analysisId = c.req.param('id');
    const db = await getDatabase(getDatabaseUrl()!);

    // Verify analysis belongs to user
    const [analysis] = await db.select()
      .from(analyses)
      .where(eq(analyses.id, analysisId));

    if (!analysis || analysis.user_id !== user.id) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    // Get all models for this analysis
    const modelList = await db.select()
      .from(models)
      .where(eq(models.analysis_id, analysisId));

    // Generate R code
    const distributions = [...new Set(modelList.map(m => m.distribution))];
    const timestamp = new Date().toISOString();

    const rCode = `# ===================================
# Survival Analysis Reproducibility Code
# Analysis ID: ${analysisId}
# Generated: ${timestamp}
# ===================================

# Required packages
# install.packages(c("IPDfromKM", "flexsurv", "survival", "ggplot2"))

library(IPDfromKM)
library(flexsurv)
library(survival)
library(ggplot2)

# ===================
# 1. IPD RECONSTRUCTION
# ===================

# Load digitized KM data
# pembro_km <- read.csv("pembrolizumab_km_digitized.csv")
# chemo_km <- read.csv("chemotherapy_km_digitized.csv")

# Risk tables (update with actual values from publication)
pembro_risk <- data.frame(
  time = c(0, 3, 6, 9, 12, 15, 18),
  nrisk = c(154, 140, 128, 115, 98, 72, 45)
)

chemo_risk <- data.frame(
  time = c(0, 3, 6, 9, 12, 15, 18),
  nrisk = c(151, 125, 98, 75, 55, 38, 22)
)

# Reconstruct IPD
# pembro_ipd <- getIPD(surv_inp = pembro_km, nrisk_inp = pembro_risk, tot_events = 45)
# chemo_ipd <- getIPD(surv_inp = chemo_km, nrisk_inp = chemo_risk, tot_events = 59)

# ===================
# 2. MODEL FITTING
# ===================

# Load your IPD data
# ipd <- read.csv("reconstructed_ipd.csv")
# pembro_data <- subset(ipd, arm == "Pembrolizumab")
# chemo_data <- subset(ipd, arm == "Chemotherapy")

# Distributions fitted in this analysis
distributions <- c(${distributions.map(d => `"${d}"`).join(', ')})

# Fit all distributions
fit_all <- function(data, arm_name) {
  results <- data.frame()
  for (dist in distributions) {
    tryCatch({
      fit <- flexsurvreg(Surv(time, event) ~ 1, data = data, dist = dist)
      results <- rbind(results, data.frame(
        Distribution = dist,
        AIC = AIC(fit),
        BIC = BIC(fit)
      ))
    }, error = function(e) {
      message(paste("Could not fit", dist))
    })
  }
  return(results[order(results$AIC), ])
}

# Run fitting
# pembro_results <- fit_all(pembro_data, "Pembrolizumab")
# chemo_results <- fit_all(chemo_data, "Chemotherapy")

# ===================
# 3. EXTRAPOLATION
# ===================

# Get survival predictions at key timepoints
timepoints <- c(12, 24, 60, 120)  # 1yr, 2yr, 5yr, 10yr

# Example with best model:
# best_fit <- flexsurvreg(Surv(time, event) ~ 1, data = pembro_data, dist = "exp")
# summary(best_fit, t = timepoints, type = "survival")

# ===================
# Citation
# ===================
# Guyot P, et al. BMC Med Res Methodol. 2012;12:9.
# Jackson C. flexsurv: A Platform for Parametric Survival Modelling in R. JSS 2016;70(8).
`;

    // Return as downloadable file
    c.header('Content-Type', 'text/plain');
    c.header('Content-Disposition', `attachment; filename="survival_code_${analysisId}.R"`);
    return c.body(rCode);
  } catch (error) {
    return c.json({
      error: 'Failed to generate code package',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get plot image
survivalRoutes.get('/analyses/:id/plots/:modelId/:plotType', async (c) => {
  try {
    const user = c.get('user');
    const analysisId = c.req.param('id');
    const modelId = c.req.param('modelId');
    const plotType = c.req.param('plotType') as 'short_term' | 'long_term';
    const db = await getDatabase(getDatabaseUrl()!);

    // Verify analysis belongs to user
    const [analysis] = await db.select()
      .from(analyses)
      .where(eq(analyses.id, analysisId));

    if (!analysis || analysis.user_id !== user.id) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    // Get plot
    const [plot] = await db.select()
      .from(plots)
      .where(and(eq(plots.model_id, modelId), eq(plots.plot_type, plotType)));

    if (!plot) {
      return c.json({ error: 'Plot not found' }, 404);
    }

    // Read plot file
    try {
      const plotData = readFileSync(plot.file_path);
      return c.body(plotData, 200, {
        'Content-Type': 'image/png',
      });
    } catch {
      return c.json({ error: 'Plot file not found' }, 404);
    }
  } catch (error) {
    return c.json({
      error: 'Failed to fetch plot',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get token usage
// Delete analysis
survivalRoutes.delete('/analyses/:id', async (c) => {
  try {
    const user = c.get('user');
    const analysisId = c.req.param('id');
    const db = await getDatabase(getDatabaseUrl()!);

    // Verify analysis belongs to user
    const [analysis] = await db.select()
      .from(analyses)
      .where(eq(analyses.id, analysisId));

    if (!analysis || analysis.user_id !== user.id) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    // Delete analysis (cascade will delete related records)
    await db.delete(analyses)
      .where(eq(analyses.id, analysisId));

    return c.json({
      success: true,
      message: 'Analysis deleted successfully'
    });
  } catch (error) {
    return c.json({
      error: 'Failed to delete analysis',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Pause analysis
survivalRoutes.post('/analyses/:id/pause', async (c) => {
  try {
    const user = c.get('user');
    const analysisId = c.req.param('id');
    const db = await getDatabase(getDatabaseUrl()!);

    // Verify analysis belongs to user
    const [analysis] = await db.select()
      .from(analyses)
      .where(eq(analyses.id, analysisId));

    if (!analysis || analysis.user_id !== user.id) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    // Only running analyses can be paused
    if (analysis.status !== 'running') {
      return c.json({ error: 'Analysis is not running' }, 400);
    }

    await db.update(analyses)
      .set({
        status: 'paused',
        updated_at: new Date(),
      })
      .where(eq(analyses.id, analysisId));

    return c.json({
      success: true,
      status: 'paused',
      message: 'Analysis paused'
    });
  } catch (error) {
    return c.json({
      error: 'Failed to pause analysis',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Resume analysis
survivalRoutes.post('/analyses/:id/resume', async (c) => {
  try {
    const user = c.get('user');
    const analysisId = c.req.param('id');
    const db = await getDatabase(getDatabaseUrl()!);

    // Verify analysis belongs to user
    const [analysis] = await db.select()
      .from(analyses)
      .where(eq(analyses.id, analysisId));

    if (!analysis || analysis.user_id !== user.id) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    // Only paused analyses can be resumed
    if (analysis.status !== 'paused') {
      return c.json({ error: 'Analysis is not paused' }, 400);
    }

    await db.update(analyses)
      .set({
        status: 'running',
        updated_at: new Date(),
      })
      .where(eq(analyses.id, analysisId));

    return c.json({
      success: true,
      status: 'running',
      message: 'Analysis resumed'
    });
  } catch (error) {
    return c.json({
      error: 'Failed to resume analysis',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

survivalRoutes.get('/token-usage/:analysisId', async (c) => {
  try {
    const user = c.get('user');
    const analysisId = c.req.param('analysisId');
    const db = await getDatabase(getDatabaseUrl()!);

    // Verify analysis belongs to user
    const [analysis] = await db.select()
      .from(analyses)
      .where(eq(analyses.id, analysisId));

    if (!analysis || analysis.user_id !== user.id) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    const usage = await db.select()
      .from(tokenUsage)
      .where(eq(tokenUsage.analysis_id, analysisId));

    const total = usage.reduce((acc, u) => ({
      input: acc.input + u.tokens_input,
      output: acc.output + u.tokens_output,
      cost: acc.cost + (u.cost_estimate || 0),
    }), { input: 0, output: 0, cost: 0 });

    return c.json({
      usage,
      total,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to fetch token usage',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Chat endpoints for real-time agent collaboration

// Get chat history for an analysis
survivalRoutes.get('/analyses/:id/chat/history', async (c) => {
  try {
    const user = c.get('user');
    const analysisId = c.req.param('id');
    const db = await getDatabase(getDatabaseUrl()!);

    // Verify analysis belongs to user
    const [analysis] = await db.select()
      .from(analyses)
      .where(eq(analyses.id, analysisId));

    if (!analysis || analysis.user_id !== user.id) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    // Get or create chat session
    let session = getChatSession(analysisId);
    if (!session) {
      session = createChatSession(analysisId, user.id);
    }

    return c.json({ messages: session.messages });
  } catch (error) {
    return c.json({
      error: 'Failed to fetch chat history',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Send a message to the agent
survivalRoutes.post('/analyses/:id/chat/message', async (c) => {
  try {
    const user = c.get('user');
    const analysisId = c.req.param('id');
    const { message } = await c.req.json();
    const db = await getDatabase(getDatabaseUrl()!);

    // Verify analysis belongs to user
    const [analysis] = await db.select()
      .from(analyses)
      .where(eq(analyses.id, analysisId));

    if (!analysis || analysis.user_id !== user.id) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    // Get or create chat session
    let session = getChatSession(analysisId);
    if (!session) {
      session = createChatSession(analysisId, user.id);
    }

    // Add user message to session
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'user_message',
      content: message,
      timestamp: new Date().toISOString(),
    };
    addMessageToSession(analysisId, userMessage);

    // Process message with agent
    try {
      // Build chat history from session
      const chatHistory = session.messages
        .filter(msg => msg.type === 'user_message' || msg.type === 'agent_message')
        .map(msg => ({
          role: msg.type === 'user_message' ? 'user' as const : 'agent' as const,
          content: msg.content,
        }));

      // Process with agent (non-streaming for now, can be enhanced later)
      const result = await processChatMessage(analysisId, message, chatHistory);

      // Add agent response to session
    const agentMessage: ChatMessage = {
      id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'agent_message',
        content: result.response,
      timestamp: new Date().toISOString(),
        // Note: token usage tracked separately, not in metadata
    };
    addMessageToSession(analysisId, agentMessage);

    return c.json({ 
      success: true, 
      message: 'Message sent',
      response: agentMessage 
    });
    } catch (agentError) {
      console.error('Chat agent error:', agentError);
      
      // Fallback response
      const fallbackMessage: ChatMessage = {
        id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'agent_message',
        content: `I encountered an error processing your message. Please try again or rephrase your question. If the problem persists, the analysis may still be loading data.`,
        timestamp: new Date().toISOString(),
      };
      addMessageToSession(analysisId, fallbackMessage);

      return c.json({ 
        success: true, 
        message: 'Message sent (with fallback response)',
        response: fallbackMessage 
      });
    }
  } catch (error) {
    console.error('Error in chat message endpoint:', error);
    return c.json({
      error: 'Failed to send message',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// SSE stream for real-time chat updates
survivalRoutes.get('/analyses/:id/chat/stream', async (c) => {
  const analysisId = c.req.param('id');
  
  // Note: SSE endpoints need special handling for auth
  // For now, we'll rely on the session being valid
  
  return streamSSE(c, async (stream) => {
    // Send initial connection message
    await stream.writeSSE({
      data: JSON.stringify({
        id: `system_${Date.now()}`,
        type: 'status_update',
        content: 'Connected to chat stream',
        timestamp: new Date().toISOString(),
      }),
      event: 'status_update',
    });

    // Get existing messages
    const session = getChatSession(analysisId);
    if (session) {
      for (const msg of session.messages) {
        await stream.writeSSE({
          data: JSON.stringify(msg),
          event: msg.type,
          id: msg.id,
        });
      }
    }

    // Keep connection alive with heartbeat
    const heartbeatInterval = setInterval(async () => {
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() }),
          event: 'heartbeat',
        });
      } catch {
        clearInterval(heartbeatInterval);
      }
    }, 30000);

    // Clean up on disconnect
    stream.onAbort(() => {
      clearInterval(heartbeatInterval);
    });

    // Keep stream open
    await new Promise(() => {});
  });
});

// Get IPD preview data (for when no analysis has been run)
survivalRoutes.get('/ipd-preview', async (c) => {
  try {
    const endpoint = c.req.query('endpoint') || 'OS';
    
    // Get Python service URL
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
    
    console.log(`[IPD Preview] Requesting ${endpoint} preview from Python service`);
    
    // Call Python service for IPD preview
    const response = await fetch(`${pythonServiceUrl}/ipd-preview?endpoint=${endpoint}`);
    
    if (!response.ok) {
      console.log(`[IPD Preview] Python service returned ${response.status}`);
      return c.json({
        source: 'demo',
        endpoint,
        plot_base64: '',
        statistics: {
          pembro: { n: 0, events: 0, median: 0, ci_lower: 0, ci_upper: 0, follow_up_range: 'N/A' },
          chemo: { n: 0, events: 0, median: 0, ci_lower: 0, ci_upper: 0, follow_up_range: 'N/A' }
        },
        available: false
      });
    }
    
    const data = await response.json() as Record<string, unknown>;
    return c.json({
      ...data,
      available: true
    });
  } catch (error) {
    console.error('[IPD Preview] Error:', error);
    return c.json({
      source: 'demo',
      endpoint: c.req.query('endpoint') || 'OS',
      plot_base64: '',
      statistics: {
        pembro: { n: 0, events: 0, median: 0, ci_lower: 0, ci_upper: 0, follow_up_range: 'N/A' },
        chemo: { n: 0, events: 0, median: 0, ci_lower: 0, ci_upper: 0, follow_up_range: 'N/A' }
      },
      available: false
    });
  }
});

// Mount survival routes
api.route('/survival', survivalRoutes);

// Project routes
const projectRoutes = new Hono();
projectRoutes.use('*', authMiddleware);

// List projects
projectRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    const db = await getDatabase(getDatabaseUrl()!);

    const results = await db.select()
      .from(projects)
      .where(eq(projects.user_id, user.id))
      .orderBy(desc(projects.created_at));

    return c.json({ projects: results });
  } catch (error) {
    return c.json({
      error: 'Failed to fetch projects',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get single project
projectRoutes.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const db = await getDatabase(getDatabaseUrl()!);

    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.user_id !== user.id) {
      return c.json({ error: 'Project not found' }, 404);
    }

    return c.json({ project });
  } catch (error) {
    return c.json({
      error: 'Failed to fetch project',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Create project
projectRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const db = await getDatabase(getDatabaseUrl()!);

    const projectId = randomUUID();
    await db.insert(projects).values({
      id: projectId,
      user_id: user.id,
      name: body.name,
      description: body.description,
      therapeutic_area: body.therapeutic_area,
      disease_condition: body.disease_condition,
      population: body.population,
      nct_id: body.nct_id,
      intervention: body.intervention,
      comparator: body.comparator,
      status: 'draft',
    });

    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    return c.json({ project });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to create project:', errorMessage);
    return c.json({
      error: `Failed to create project: ${errorMessage}`,
      details: errorMessage,
    }, 500);
  }
});

// Update project
projectRoutes.patch('/:id', async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const body = await c.req.json();
    const db = await getDatabase(getDatabaseUrl()!);

    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.user_id !== user.id) {
      return c.json({ error: 'Project not found' }, 404);
    }

    await db.update(projects)
      .set({
        ...body,
        updated_at: new Date(),
      })
      .where(eq(projects.id, projectId));

    const [updated] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    return c.json({ project: updated });
  } catch (error) {
    return c.json({
      error: 'Failed to update project',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Delete project
projectRoutes.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const db = await getDatabase(getDatabaseUrl()!);

    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.user_id !== user.id) {
      return c.json({ error: 'Project not found' }, 404);
    }

    await db.delete(projects).where(eq(projects.id, projectId));

    return c.json({ success: true });
  } catch (error) {
    return c.json({
      error: 'Failed to delete project',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// List arms for a project
projectRoutes.get('/:id/arms', async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const db = await getDatabase(getDatabaseUrl()!);

    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.user_id !== user.id) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const armsList = await db.select()
      .from(arms)
      .where(eq(arms.project_id, projectId))
      .orderBy(arms.display_order);

    return c.json({ arms: armsList });
  } catch (error) {
    return c.json({
      error: 'Failed to fetch arms',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Create arm
projectRoutes.post('/:id/arms', async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const body = await c.req.json();
    const db = await getDatabase(getDatabaseUrl()!);

    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.user_id !== user.id) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const armId = randomUUID();
    await db.insert(arms).values({
      id: armId,
      project_id: projectId,
      name: body.name,
      arm_type: body.arm_type || 'treatment',
      label: body.label,
      color: body.color,
      drug_name: body.drug_name,
      dosage: body.dosage,
      regimen: body.regimen,
      sample_size: body.sample_size,
    });

    const [arm] = await db.select()
      .from(arms)
      .where(eq(arms.id, armId));

    return c.json({ arm });
  } catch (error) {
    return c.json({
      error: 'Failed to create arm',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Delete arm
projectRoutes.delete('/:id/arms/:armId', async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const armId = c.req.param('armId');
    const db = await getDatabase(getDatabaseUrl()!);

    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.user_id !== user.id) {
      return c.json({ error: 'Project not found' }, 404);
    }

    await db.delete(arms).where(eq(arms.id, armId));

    return c.json({ success: true });
  } catch (error) {
    return c.json({
      error: 'Failed to delete arm',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// List endpoints for a project
projectRoutes.get('/:id/endpoints', async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const db = await getDatabase(getDatabaseUrl()!);

    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.user_id !== user.id) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const endpointsList = await db.select()
      .from(endpoints)
      .where(eq(endpoints.project_id, projectId))
      .orderBy(endpoints.display_order);

    return c.json({ endpoints: endpointsList });
  } catch (error) {
    return c.json({
      error: 'Failed to fetch endpoints',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Create endpoint
projectRoutes.post('/:id/endpoints', async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const body = await c.req.json();
    const db = await getDatabase(getDatabaseUrl()!);

    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.user_id !== user.id) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const endpointId = randomUUID();
    await db.insert(endpoints).values({
      id: endpointId,
      project_id: projectId,
      endpoint_type: body.endpoint_type,
      custom_name: body.custom_name,
      description: body.description,
      time_horizon: body.time_horizon || 240,
    });

    const [endpoint] = await db.select()
      .from(endpoints)
      .where(eq(endpoints.id, endpointId));

    return c.json({ endpoint });
  } catch (error) {
    return c.json({
      error: 'Failed to create endpoint',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Delete endpoint
projectRoutes.delete('/:id/endpoints/:endpointId', async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const endpointId = c.req.param('endpointId');
    const db = await getDatabase(getDatabaseUrl()!);

    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.user_id !== user.id) {
      return c.json({ error: 'Project not found' }, 404);
    }

    await db.delete(endpoints).where(eq(endpoints.id, endpointId));

    return c.json({ success: true });
  } catch (error) {
    return c.json({
      error: 'Failed to delete endpoint',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// List data sources for a project
projectRoutes.get('/:id/data-sources', async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const db = await getDatabase(getDatabaseUrl()!);

    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.user_id !== user.id) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const dataSourcesList = await db.select()
      .from(dataSources)
      .where(eq(dataSources.project_id, projectId));

    return c.json({ data_sources: dataSourcesList });
  } catch (error) {
    return c.json({
      error: 'Failed to fetch data sources',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Delete data source
projectRoutes.delete('/:id/data-sources/:dataSourceId', async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const dataSourceId = c.req.param('dataSourceId');
    const db = await getDatabase(getDatabaseUrl()!);

    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.user_id !== user.id) {
      return c.json({ error: 'Project not found' }, 404);
    }

    await db.delete(dataSources).where(eq(dataSources.id, dataSourceId));

    return c.json({ success: true });
  } catch (error) {
    return c.json({
      error: 'Failed to delete data source',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Mount project routes
api.route('/projects', projectRoutes);

// Mount the protected routes under /protected
api.route('/protected', protectedRoutes);

// ============================================================================
// DIGITIZER ROUTES - KM Curve Extraction and IPD Generation
// ============================================================================

import { 
  extractKMCurve, 
  generatePseudoIPD, 
  validateKMData,
  type IPDGenerationRequest 
} from './services/digitizer-service';

const digitizerRoutes = new Hono();

// Apply auth middleware to all digitizer routes
digitizerRoutes.use('*', authMiddleware);

// Extract KM curve from image
digitizerRoutes.post('/extract', async (c) => {
  try {
    const body = await c.req.json();
    const { 
      imageBase64, 
      riskTableImageBase64, 
      endpointType, 
      arm, 
      granularity, 
      apiProvider,
      projectId,       // Optional: save to Supabase for this project
      imageFilename    // Optional: original filename
    } = body;

    if (!imageBase64) {
      return c.json({ error: 'Image data is required' }, 400);
    }

    console.log(`[Digitizer API] Extraction request for ${endpointType} - ${arm}, granularity: ${granularity || 0.25}, projectId: ${projectId || 'none'}`);

    const result = await extractKMCurve(
      imageBase64,
      riskTableImageBase64,
      endpointType,
      arm,
      granularity,
      apiProvider,
      projectId,
      imageFilename
    );

    if (!result.success) {
      return c.json({ error: result.error || 'Extraction failed' }, 500);
    }

    return c.json(result);
  } catch (error) {
    console.error('Extraction error:', error);
    return c.json({
      error: 'Failed to extract KM curve',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Validate KM data
digitizerRoutes.post('/validate', async (c) => {
  try {
    const body = await c.req.json();
    const { points, riskTable } = body;

    if (!points || !riskTable) {
      return c.json({ error: 'Points and risk table are required' }, 400);
    }

    const validation = validateKMData(points, riskTable);
    return c.json(validation);
  } catch (error) {
    console.error('Validation error:', error);
    return c.json({
      error: 'Failed to validate data',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Generate Pseudo-IPD from KM data
digitizerRoutes.post('/generate-ipd', async (c) => {
  try {
    const body = await c.req.json();
    const { endpoints, projectId } = body as { endpoints: IPDGenerationRequest[]; projectId?: string };

    if (!endpoints || endpoints.length === 0) {
      return c.json({ error: 'At least one endpoint is required' }, 400);
    }

    // Validate each endpoint's data
    for (const endpoint of endpoints) {
      const validation = validateKMData(endpoint.points, endpoint.riskTable);
      if (!validation.valid) {
        return c.json({
          error: `Validation failed for ${endpoint.endpointType} - ${endpoint.arm}`,
          details: validation.errors,
        }, 400);
      }
    }

    // Pass projectId to save IPD to Supabase if provided
    const result = await generatePseudoIPD(endpoints, projectId);

    if (!result.success) {
      return c.json({ error: result.error || 'IPD generation failed' }, 500);
    }

    return c.json(result);
  } catch (error) {
    console.error('IPD generation error:', error);
    return c.json({
      error: 'Failed to generate Pseudo-IPD',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Mount digitizer routes
api.route('/digitizer', digitizerRoutes);

// ============================================================================
// RAG Management Routes
// ============================================================================
import { getRAGService } from './lib/rag-service';
import path from 'path';

// RAG status endpoint
api.get('/rag/status', async (c) => {
  try {
    const ragService = getRAGService();
    const stats = await ragService.getStats();
    return c.json({
      status: 'ok',
      chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
      collection: 'survival_analysis_docs',
      documentCount: stats.count,
      sources: stats.sources,
    });
  } catch (error) {
    return c.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'ChromaDB connection failed',
      chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
    }, 500);
  }
});

// RAG ingestion endpoint (POST to trigger ingestion)
api.post('/rag/ingest', async (c) => {
  try {
    const ragService = getRAGService();
    const fs = await import('fs/promises');
    
    // Determine rag_data path - check multiple locations
    let ragDir = process.env.RAG_DATA_DIR;
    const checkedPaths: string[] = [];
    
    if (ragDir) {
      // Validate the env-provided path exists
      try {
        await fs.access(ragDir);
      } catch {
        console.log(`[RAG] RAG_DATA_DIR path not found: ${ragDir}`);
        checkedPaths.push(`${ragDir} (from RAG_DATA_DIR - NOT FOUND)`);
        ragDir = undefined;
      }
    }
    
    if (!ragDir) {
      // Try relative paths from server directory
      const possiblePaths = [
        '/app/data/rag_docs',  // Railway Docker: /app is WORKDIR
        path.join(process.cwd(), 'data', 'rag_docs'),
        path.join(process.cwd(), 'rag_data'),
        path.join(__dirname, '..', 'data', 'rag_docs'),
        path.join(__dirname, 'data', 'rag_docs'),
      ];
      
      for (const p of possiblePaths) {
        try {
          await fs.access(p);
          const files = await fs.readdir(p);
          if (files.length > 0) {
            ragDir = p;
            checkedPaths.push(`${p} (FOUND - ${files.length} files)`);
            break;
          } else {
            checkedPaths.push(`${p} (exists but empty)`);
          }
        } catch {
          checkedPaths.push(`${p} (not found)`);
        }
      }
    }
    
    if (!ragDir) {
      return c.json({
        success: false,
        error: 'RAG data directory not found',
        checkedPaths,
        cwd: process.cwd(),
        dirname: __dirname,
      }, 400);
    }
    
    console.log(`[RAG] Ingesting documents from: ${ragDir}`);
    
    // List files in directory for debugging
    const dirFiles = await fs.readdir(ragDir);
    console.log(`[RAG] Files found: ${dirFiles.join(', ')}`);
    
    const result = await ragService.ingestDocuments(ragDir);
    
    return c.json({
      success: result.success,
      ragDir,
      filesInDir: dirFiles,
      documentsProcessed: result.documentsProcessed,
      chunksCreated: result.chunksCreated,
      error: (result as any).error,
      checkedPaths,
    });
  } catch (error) {
    console.error('[RAG] Ingestion error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Ingestion failed',
    }, 500);
  }
});

// RAG query test endpoint
api.post('/rag/query', async (c) => {
  try {
    const { query, nResults = 3 } = await c.req.json();
    
    if (!query) {
      return c.json({ error: 'Query is required' }, 400);
    }
    
    const ragService = getRAGService();
    const results = await ragService.query(query, nResults);
    
    return c.json({
      query,
      results,
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Query failed',
    }, 500);
  }
});

// Mount the API router
app.route('/api/v1', api);

export default app; 
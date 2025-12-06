import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authMiddleware } from './middleware/auth';
import { getDatabase, testDatabaseConnection } from './lib/db';
import { setEnvContext, clearEnvContext, getDatabaseUrl } from './lib/env';
import * as schema from './schema/users';
import { analyses, models, visionAssessments, reasoningAssessments, plots, phTests, synthesisReports, tokenUsage } from './schema/analyses';
import { runSurvivalAnalysisWorkflow } from './agents/survival-agent';
import { eq, desc, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

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
app.use('*', cors());

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
    const { endpointType = 'OS' } = await c.req.json().catch(() => ({}));
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
      parameters: { endpointType },
    });

    // Run workflow asynchronously
    runSurvivalAnalysisWorkflow(analysisId, user.id, endpointType as 'OS' | 'PFS').catch((error) => {
      console.error('Workflow error:', error);
    });

    return c.json({
      analysis_id: analysisId,
      status: 'running',
      message: 'Analysis workflow started',
    });
  } catch (error) {
    console.error('Error starting analysis:', error);
    return c.json({
      error: 'Failed to start analysis',
      details: error instanceof Error ? error.message : 'Unknown error',
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

// Mount survival routes
api.route('/survival', survivalRoutes);

// Mount the protected routes under /protected
api.route('/protected', protectedRoutes);

// Mount the API router
app.route('/api/v1', api);

export default app; 
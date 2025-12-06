import 'dotenv/config';
import { runSurvivalAnalysisWorkflow } from '../agents/survival-agent';
import { getDatabase } from '../lib/db';
import { getDatabaseUrl } from '../lib/env';
import { analyses, synthesisReports } from '../schema/analyses';
import { users } from '../schema/users';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

async function runAnalysis() {
    console.log('🚀 Starting Full Survival Analysis Workflow...');

    const dbUrl = getDatabaseUrl();
    if (!dbUrl) {
        console.error('❌ DATABASE_URL is missing in .env');
        process.exit(1);
    }

    const db = await getDatabase(dbUrl);

    // 1. Create/Get Dummy User
    const userId = 'test-user-123';
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (user.length === 0) {
        console.log('Creating test user...');
        await db.insert(users).values({
            id: userId,
            email: 'test@example.com',
            display_name: 'Test User',
            created_at: new Date(),
            updated_at: new Date(),
        });
    }

    // 2. Create Analysis Record
    const analysisId = randomUUID();
    console.log(`Creating analysis record: ${analysisId}`);

    await db.insert(analyses).values({
        id: analysisId,
        user_id: userId,
        status: 'running',
        workflow_state: 'DATA_LOADED',
        progress: 0,
        total_models: 42,
        parameters: {},
    });

    // 3. Run Workflow
    console.log('Running workflow (this may take a few minutes)...');
    try {
        await runSurvivalAnalysisWorkflow(analysisId, userId);
        console.log('Workflow execution finished (function returned).');
    } catch (error) {
        console.error('Workflow failed:', error);
        process.exit(1);
    }

    // 4. Check Result
    const [analysis] = await db.select().from(analyses).where(eq(analyses.id, analysisId));

    if (analysis.status === 'completed') {
        console.log('✅ Analysis Completed Successfully!');

        const [report] = await db.select().from(synthesisReports).where(eq(synthesisReports.analysis_id, analysisId));

        if (report) {
            console.log('\n--- FINAL SYNTHESIS REPORT ---\n');
            console.log(report.full_text);
            console.log('\n------------------------------\n');
            console.log(`Token Usage: ${report.token_usage}`);
        } else {
            console.error('❌ Report not found despite completion.');
        }
    } else {
        console.error(`❌ Analysis failed or incomplete. Status: ${analysis.status}`);
        if (analysis.error_message) {
            console.error(`Error: ${analysis.error_message}`);
        }
    }

    process.exit(0);
}

runAnalysis().catch(console.error);

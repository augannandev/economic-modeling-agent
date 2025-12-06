
import {
    loadParquetData,
    testProportionalHazards,
    detectPiecewiseCutpoint,
    fitPiecewiseModel
} from '../services/python-service';
import path from 'path';

// Hardcode paths for this environment
const BASE_PATH = '/Users/ansberthafreiku/dev/SurvivalAgent/my-app/PseuodoIPD';
const CHEMO_PATH = path.join(BASE_PATH, 'ipd_EndpointType.OS_Chemotherapy.parquet');
const PEMBRO_PATH = path.join(BASE_PATH, 'ipd_EndpointType.OS_Pembrolizumab.parquet');

async function main() {
    console.log('--- Starting Mock Agent Run ---');
    console.log(`Python Service URL: ${process.env.PYTHON_SERVICE_URL || 'default'}`);

    try {
        // 1. Load Data
        console.log('\n1. Loading Data...');
        const data = await loadParquetData(CHEMO_PATH, PEMBRO_PATH);
        console.log(`   Loaded Chemo: ${data.chemo.time.length} records`);
        console.log(`   Loaded Pembro: ${data.pembro.time.length} records`);

        // 2. Test PH
        console.log('\n2. Testing Proportional Hazards...');
        const phResult = await testProportionalHazards(data);
        console.log('   PH Test Results:');
        console.log(`   - Schoenfeld p-value: ${phResult.schoenfeld_pvalue.toFixed(4)}`);
        console.log(`   - Log-rank p-value: ${phResult.logrank_pvalue.toFixed(4)}`);
        console.log(`   - Time-Dependent Cox p-value: ${phResult.chow_test_pvalue.toFixed(4)}`); // Mapped to chow_test_pvalue in interface

        // 3. Detect Cutpoints (The new feature!)
        console.log('\n3. Detecting Cutpoints (Likelihood Ratio Test)...');

        console.log('   > For Pembrolizumab:');
        const cutpointPembro = await detectPiecewiseCutpoint(data.pembro, 'pembro');
        console.log(`     Detected Cutpoint: ${cutpointPembro.toFixed(2)} months`);

        console.log('   > For Chemotherapy:');
        const cutpointChemo = await detectPiecewiseCutpoint(data.chemo, 'chemo');
        console.log(`     Detected Cutpoint: ${cutpointChemo.toFixed(2)} months`);

        // 4. Fit Piecewise Model (Example)
        console.log('\n4. Fitting Piecewise Exponential Model (Pembro)...');
        const modelResult = await fitPiecewiseModel(
            data.pembro,
            'pembro',
            'exponential',
            cutpointPembro
        );
        console.log('   Model Fitted Successfully!');
        console.log(`   - AIC: ${modelResult.aic?.toFixed(2)}`);
        console.log(`   - Log-Likelihood: ${modelResult.log_likelihood.toFixed(2)}`);
        console.log(`   - Parameters: ${JSON.stringify(modelResult.parameters)}`);

        // 5. Verify LLM Instantiation (Testing the fix)
        console.log('\n5. Verifying LLM Configuration...');
        const { createSynthesisLLM, createReasoningLLM } = await import('../lib/llm');

        console.log('   > Initializing Reasoning LLM (Claude)...');
        const reasoningLLM = createReasoningLLM();
        console.log('     Success!');

        console.log('   > Initializing Synthesis LLM (GPT-5.1)...');
        const synthesisLLM = createSynthesisLLM();
        console.log('     Success! (Model: GPT-5.1)');

        console.log('\n--- Mock Run Complete: SUCCESS ---');

    } catch (error) {
        console.error('\n!!! Mock Run Failed !!!');
        console.error(error);
        process.exit(1);
    }
}

main();

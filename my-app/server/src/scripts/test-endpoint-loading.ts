import { loadPseudoIPD } from '../tools/data-loader';
import { getDatabase } from '../lib/db';
import { getDatabaseUrl } from '../lib/env';
import { analyses } from '../schema/analyses';
import { eq } from 'drizzle-orm';

async function testEndpointLoading() {
    console.log('Testing OS data loading...');
    try {
        const osData = await loadPseudoIPD('OS');
        console.log(`✅ OS Data loaded: Chemo N=${osData.chemo.time.length}, Pembro N=${osData.pembro.time.length}`);
    } catch (error) {
        console.error('❌ OS Data loading failed:', error);
    }

    console.log('\nTesting PFS data loading...');
    try {
        const pfsData = await loadPseudoIPD('PFS');
        console.log(`✅ PFS Data loaded: Chemo N=${pfsData.chemo.time.length}, Pembro N=${pfsData.pembro.time.length}`);
    } catch (error) {
        console.error('❌ PFS Data loading failed:', error);
    }
}

testEndpointLoading().catch(console.error);

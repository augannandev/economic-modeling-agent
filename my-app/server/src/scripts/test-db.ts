
import { testDatabaseConnection, getDatabase } from '../lib/db';
import { getDatabaseUrl } from '../lib/env';

async function main() {
    console.log('Testing database connection...');
    try {
        const dbUrl = getDatabaseUrl();
        console.log(`Using DB URL: ${dbUrl || 'default'}`);

        // Initialize connection
        await getDatabase(dbUrl);

        const isConnected = await testDatabaseConnection();
        if (isConnected) {
            console.log('SUCCESS: Database connection established.');
        } else {
            console.error('FAILURE: Could not connect to database.');
            process.exit(1);
        }
    } catch (error) {
        console.error('ERROR:', error);
        process.exit(1);
    }
}

main();

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from parent directory (project root)
dotenv.config({ path: path.join(__dirname, '../.env') });

const key = process.env.OPENAI_API_KEY;

if (key) {
    console.log('✅ OPENAI_API_KEY is set!');
    console.log('Key length:', key.length);
    console.log('First 10 chars:', key.substring(0, 10));

    if (key.startsWith("'") || key.endsWith("'")) {
        console.warn('⚠️  WARNING: The key appears to be surrounded by single quotes. This might be the issue!');
    } else {
        console.log('✅ Key format looks correct (no surrounding quotes detected).');
    }
} else {
    console.error('❌ OPENAI_API_KEY is NOT set.');
    console.log('Current directory:', process.cwd());
    console.log('Looking for .env at:', path.join(__dirname, '../.env'));
}

import { loadRagDocuments } from '../lib/document-loader';
import path from 'path';
import fs from 'fs/promises';

async function testRag() {
    const ragDir = path.join(process.cwd(), 'data', 'rag_docs');

    // Create dummy files
    await fs.writeFile(path.join(ragDir, 'TSD_14_test.txt'), 'Content of TSD 14');
    await fs.writeFile(path.join(ragDir, 'TSD_99_ignore.txt'), 'Content of TSD 99');

    console.log('Testing RAG document loading with filter...');
    const coreDocs = ['TSD_14', 'TSD 14'];
    const context = await loadRagDocuments(ragDir, coreDocs);

    console.log('Context loaded:');
    console.log(context);

    if (context.includes('Content of TSD 14') && !context.includes('Content of TSD 99')) {
        console.log('SUCCESS: Filtered correctly (Loaded TSD 14, Ignored TSD 99).');
    } else {
        console.error('FAILURE: Filtering failed.');
    }

    // Cleanup
    await fs.unlink(path.join(ragDir, 'TSD_14_test.txt'));
    await fs.unlink(path.join(ragDir, 'TSD_99_ignore.txt'));
}

testRag().catch(console.error);

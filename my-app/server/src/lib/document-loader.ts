import fs from 'fs/promises';
import path from 'path';

/**
 * Load documents from the RAG directory
 * Supports .txt and .md files directly.
 * @param ragDir Directory containing RAG documents
 * @param allowedFiles Optional list of filenames to include. If empty, loads all.
 */
export async function loadRagDocuments(ragDir: string, allowedFiles?: string[]): Promise<string> {
    try {
        const files = await fs.readdir(ragDir);
        let combinedContext = '';

        for (const file of files) {
            // If allowedFiles is provided, skip files not in the list
            if (allowedFiles && allowedFiles.length > 0 && !allowedFiles.some(f => file.includes(f))) {
                continue;
            }

            const filePath = path.join(ragDir, file);
            const stats = await fs.stat(filePath);

            if (stats.isFile()) {
                // Simple text loading for now
                if (file.endsWith('.txt') || file.endsWith('.md')) {
                    const content = await fs.readFile(filePath, 'utf-8');
                    combinedContext += `\n\n--- DOCUMENT: ${file} ---\n${content}`;
                }
                // Add PDF handling logic here if libraries are available
                // else if (file.endsWith('.pdf')) { ... }
            }
        }

        if (!combinedContext) {
            return "No external RAG documents found.";
        }

        return combinedContext;
    } catch (error) {
        console.error('Error loading RAG documents:', error);
        return "Error loading RAG documents.";
    }
}

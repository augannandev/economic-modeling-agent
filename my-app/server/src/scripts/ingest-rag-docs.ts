#!/usr/bin/env tsx
/**
 * RAG Document Ingestion Script
 * 
 * Processes documents from the rag_data/ folder and ingests them into ChromaDB.
 * 
 * Usage: 
 *   npx tsx src/scripts/ingest-rag-docs.ts
 *   OR
 *   pnpm exec tsx src/scripts/ingest-rag-docs.ts
 */

import 'dotenv/config';
import path from 'path';
import { getRAGService } from '../lib/rag-service';

async function main() {
  console.log('=== RAG Document Ingestion ===\n');
  
  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }
  
  const ragService = getRAGService();
  
  // Determine rag_data path
  const ragDir = process.env.RAG_DATA_DIR || path.resolve(__dirname, '../../../rag_data');
  
  console.log(`RAG Data Directory: ${ragDir}`);
  console.log(`ChromaDB URL: ${process.env.CHROMA_URL || 'http://localhost:8000'}\n`);
  
  try {
    // Ingest documents
    console.log('Starting document ingestion...\n');
    const result = await ragService.ingestDocuments(ragDir);
    
    if (result.success) {
      console.log('\n=== Ingestion Complete ===');
      console.log(`Documents processed: ${result.documentsProcessed}`);
      console.log(`Chunks created: ${result.chunksCreated}`);
      
      // Get stats
      const stats = await ragService.getStats();
      console.log(`\nCollection stats:`);
      console.log(`  Total chunks: ${stats.count}`);
      console.log(`  Sources: ${stats.sources.join(', ')}`);
      
      // Test query
      console.log('\n=== Testing Query ===');
      const testResults = await ragService.query('5-year survival rate NSCLC pembrolizumab', 3);
      console.log(`Query results: ${testResults.length} chunks found`);
      if (testResults.length > 0) {
        console.log(`\nTop result (score: ${testResults[0].score.toFixed(3)}):`);
        console.log(`Source: ${testResults[0].source}`);
        console.log(`Content: ${testResults[0].content.substring(0, 200)}...`);
      }
    } else {
      console.error('\nIngestion failed - check ChromaDB connection');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error during ingestion:', error);
    process.exit(1);
  }
}

main().catch(console.error);


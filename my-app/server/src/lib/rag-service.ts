import { ChromaClient, Collection, OpenAIEmbeddingFunction } from 'chromadb';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';

// PDF parsing - dynamic import to handle optional dependency
let pdfParse: ((buffer: Buffer) => Promise<{ text: string }>) | null = null;

async function loadPdfParser() {
  if (!pdfParse) {
    try {
      const module = await import('pdf-parse');
      pdfParse = module.default;
    } catch (error) {
      console.warn('pdf-parse not available, PDF files will be skipped');
    }
  }
  return pdfParse;
}

/**
 * Document chunk for RAG
 */
export interface DocumentChunk {
  id: string;
  content: string;
  metadata: {
    source: string;
    chunkIndex: number;
    documentType: 'pdf' | 'markdown' | 'text';
    title?: string;
  };
}

/**
 * RAG query result
 */
export interface RAGResult {
  content: string;
  source: string;
  score: number;
}

/**
 * RAG Service using ChromaDB for vector storage and OpenAI for embeddings
 */
export class RAGService {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private openai: OpenAI;
  private embeddingFunction: OpenAIEmbeddingFunction;
  private collectionName = 'survival_analysis_docs';
  private initialized = false;

  constructor() {
    this.client = new ChromaClient({
      path: process.env.CHROMA_URL || 'http://localhost:8000'
    });
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.embeddingFunction = new OpenAIEmbeddingFunction({
      openai_api_key: process.env.OPENAI_API_KEY || '',
      openai_model: 'text-embedding-3-small'
    });
  }

  /**
   * Initialize the RAG service - create or get collection
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Try to get existing collection
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        embeddingFunction: this.embeddingFunction,
        metadata: { 
          description: 'Survival analysis methodology and benchmark documents'
        }
      });
      this.initialized = true;
      console.log('[RAG] Initialized ChromaDB collection:', this.collectionName);
    } catch (error) {
      console.error('[RAG] Failed to initialize ChromaDB:', error);
      // Continue without RAG - graceful degradation
      this.initialized = false;
    }
  }

  /**
   * Split text into chunks with overlap
   */
  private chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    
    let currentChunk = '';
    let previousChunk = '';
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        previousChunk = currentChunk;
        // Start new chunk with overlap from previous
        const overlapText = previousChunk.slice(-overlap);
        currentChunk = overlapText + ' ' + sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  /**
   * Extract text from PDF file
   */
  private async extractPdfText(filePath: string): Promise<string> {
    const parser = await loadPdfParser();
    if (!parser) {
      console.warn(`[RAG] PDF parser not available, skipping: ${filePath}`);
      return '';
    }
    
    try {
      const buffer = await fs.readFile(filePath);
      const data = await parser(buffer);
      return data.text;
    } catch (error) {
      console.error(`[RAG] Error parsing PDF ${filePath}:`, error);
      return '';
    }
  }

  /**
   * Ingest documents from a directory
   */
  async ingestDocuments(ragDir: string): Promise<{ success: boolean; documentsProcessed: number; chunksCreated: number }> {
    await this.initialize();
    
    if (!this.collection) {
      console.warn('[RAG] Collection not available, skipping ingestion');
      return { success: false, documentsProcessed: 0, chunksCreated: 0 };
    }

    let documentsProcessed = 0;
    let chunksCreated = 0;

    try {
      const files = await fs.readdir(ragDir);
      
      for (const file of files) {
        const filePath = path.join(ragDir, file);
        const stats = await fs.stat(filePath);
        
        if (!stats.isFile()) continue;
        
        let content = '';
        let documentType: 'pdf' | 'markdown' | 'text' = 'text';
        
        if (file.endsWith('.pdf')) {
          content = await this.extractPdfText(filePath);
          documentType = 'pdf';
        } else if (file.endsWith('.md')) {
          content = await fs.readFile(filePath, 'utf-8');
          documentType = 'markdown';
        } else if (file.endsWith('.txt')) {
          content = await fs.readFile(filePath, 'utf-8');
          documentType = 'text';
        }
        
        if (!content) continue;
        
        // Chunk the content
        const chunks = this.chunkText(content);
        
        // Prepare for ChromaDB
        const ids: string[] = [];
        const documents: string[] = [];
        const metadatas: Array<{ source: string; chunkIndex: number; documentType: string }> = [];
        
        for (let i = 0; i < chunks.length; i++) {
          const id = `${file.replace(/[^a-zA-Z0-9]/g, '_')}_chunk_${i}`;
          ids.push(id);
          documents.push(chunks[i]);
          metadatas.push({
            source: file,
            chunkIndex: i,
            documentType
          });
        }
        
        // Add to collection (upsert to handle re-ingestion)
        if (ids.length > 0) {
          await this.collection.upsert({
            ids,
            documents,
            metadatas
          });
          
          documentsProcessed++;
          chunksCreated += chunks.length;
          console.log(`[RAG] Ingested ${file}: ${chunks.length} chunks`);
        }
      }
      
      return { success: true, documentsProcessed, chunksCreated };
    } catch (error) {
      console.error('[RAG] Error ingesting documents:', error);
      return { success: false, documentsProcessed, chunksCreated };
    }
  }

  /**
   * Query the RAG system for relevant context
   */
  async query(queryText: string, nResults = 5): Promise<RAGResult[]> {
    await this.initialize();
    
    if (!this.collection) {
      console.warn('[RAG] Collection not available, returning empty results');
      return [];
    }

    try {
      const results = await this.collection.query({
        queryTexts: [queryText],
        nResults
      });
      
      const ragResults: RAGResult[] = [];
      
      if (results.documents && results.documents[0]) {
        for (let i = 0; i < results.documents[0].length; i++) {
          const doc = results.documents[0][i];
          const metadata = results.metadatas?.[0]?.[i] as { source?: string } | undefined;
          const distance = results.distances?.[0]?.[i];
          
          if (doc) {
            ragResults.push({
              content: doc,
              source: metadata?.source || 'unknown',
              score: distance ? 1 - distance : 0 // Convert distance to similarity score
            });
          }
        }
      }
      
      return ragResults;
    } catch (error) {
      console.error('[RAG] Query error:', error);
      return [];
    }
  }

  /**
   * Query specifically for benchmark data
   */
  async queryBenchmarks(indication: string, treatmentArm: string): Promise<string> {
    const query = `${indication} ${treatmentArm} survival benchmark external data 5-year survival rate median survival`;
    const results = await this.query(query, 3);
    
    if (results.length === 0) {
      return '';
    }
    
    return results.map(r => r.content).join('\n\n');
  }

  /**
   * Query for methodology guidance (TSD14/TSD16)
   */
  async queryMethodology(modelType: string, topic: string): Promise<string> {
    const query = `${modelType} model ${topic} survival analysis extrapolation NICE TSD`;
    const results = await this.query(query, 3);
    
    if (results.length === 0) {
      return '';
    }
    
    return results.map(r => `[${r.source}]\n${r.content}`).join('\n\n---\n\n');
  }

  /**
   * Get collection stats
   */
  async getStats(): Promise<{ count: number; sources: string[] }> {
    await this.initialize();
    
    if (!this.collection) {
      return { count: 0, sources: [] };
    }

    try {
      const count = await this.collection.count();
      
      // Get unique sources
      const peek = await this.collection.peek({ limit: 100 });
      const sources = new Set<string>();
      
      if (peek.metadatas) {
        for (const meta of peek.metadatas) {
          const source = (meta as { source?: string })?.source;
          if (source) sources.add(source);
        }
      }
      
      return { count, sources: Array.from(sources) };
    } catch (error) {
      console.error('[RAG] Error getting stats:', error);
      return { count: 0, sources: [] };
    }
  }
}

// Singleton instance
let ragServiceInstance: RAGService | null = null;

/**
 * Get the RAG service singleton
 */
export function getRAGService(): RAGService {
  if (!ragServiceInstance) {
    ragServiceInstance = new RAGService();
  }
  return ragServiceInstance;
}

/**
 * Simple fallback for when ChromaDB is not available
 * Returns context by directly reading and filtering documents
 */
export async function getSimpleRAGContext(ragDir: string, query: string): Promise<string> {
  try {
    const files = await fs.readdir(ragDir);
    let context = '';
    
    // Prioritize external_benchmarks.md for benchmark queries
    const queryLower = query.toLowerCase();
    const isBenchmarkQuery = queryLower.includes('benchmark') || 
                             queryLower.includes('survival') || 
                             queryLower.includes('rate');
    
    for (const file of files) {
      // Only process text files for simple fallback
      if (!file.endsWith('.md') && !file.endsWith('.txt')) continue;
      
      // Prioritize benchmarks file for benchmark queries
      if (isBenchmarkQuery && !file.includes('benchmark')) continue;
      
      const filePath = path.join(ragDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      
      context += `\n\n--- ${file} ---\n${content}`;
    }
    
    return context || 'No relevant context found.';
  } catch (error) {
    console.error('[RAG Simple] Error:', error);
    return '';
  }
}


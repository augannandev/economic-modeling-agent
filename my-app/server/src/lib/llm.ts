import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { getEnv } from './env';

export type LLMProvider = 'anthropic' | 'openai';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface VisionLLMConfig extends LLMConfig {
  maxTokens: number; // Required for vision
}

export interface ReasoningLLMConfig extends LLMConfig {
  maxTokens: number; // Required for reasoning
}

/**
 * Get Anthropic API key from environment
 */
export function getAnthropicApiKey(): string {
  const key = getEnv('ANTHROPIC_API_KEY');
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
  }
  return key;
}

/**
 * Get OpenAI API key from environment
 */
export function getOpenAIApiKey(): string {
  const key = getEnv('OPENAI_API_KEY');
  if (!key) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }
  return key;
}

/**
 * Get Google API key from environment
 */
export function getGoogleApiKey(): string {
  const key = getEnv('GEMINI_API_KEY');
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }
  return key;
}

/**
 * Create Claude Sonnet 4.5 client for vision analysis
 */
export function createVisionLLM(config?: Partial<VisionLLMConfig>): ChatAnthropic {
  const apiKey = getAnthropicApiKey();
  const maxTokens = config?.maxTokens || parseInt(getEnv('MAX_OUTPUT_TOKENS_VISION', '2000') as string);

  return new ChatAnthropic({
    model: config?.model || 'claude-sonnet-4-20250514',
    anthropicApiKey: apiKey,
    maxTokens,
    temperature: config?.temperature || 0.3,
  });
}

/**
 * Create Claude Sonnet 4.5 client for reasoning analysis
 */
export function createReasoningLLM(config?: Partial<ReasoningLLMConfig>): ChatAnthropic {
  const apiKey = getAnthropicApiKey();
  const maxTokens = config?.maxTokens || parseInt(getEnv('MAX_OUTPUT_TOKENS_REASONING', '16000') as string);

  return new ChatAnthropic({
    model: config?.model || 'claude-sonnet-4-20250514',
    anthropicApiKey: apiKey,
    maxTokens,
    temperature: config?.temperature || 0.4,
  });
}

/**
 * Create Gemini 2.5 Pro client for vision analysis (PH plots)
 * Gemini has superior vision capabilities for chart/plot analysis
 */
export function createGeminiVisionLLM(config?: Partial<VisionLLMConfig>): ChatGoogleGenerativeAI {
  const apiKey = getGoogleApiKey();
  const maxTokens = config?.maxTokens || parseInt(getEnv('MAX_OUTPUT_TOKENS_VISION', '2000') as string);

  return new ChatGoogleGenerativeAI({
    model: config?.model || 'gemini-1.5-pro',
    apiKey,
    maxOutputTokens: maxTokens,
    temperature: config?.temperature || 0.2,
  });
}

/**
 * Create OpenAI GPT-5.1 client for synthesis
 */
export function createSynthesisLLM(config?: Partial<LLMConfig>): ChatOpenAI {
  const apiKey = getOpenAIApiKey();
  const maxTokens = config?.maxTokens || parseInt(getEnv('MAX_OUTPUT_TOKENS_SYNTHESIS', '8000') as string);

  return new ChatOpenAI({
    modelName: config?.model || 'gpt-5.1',
    openAIApiKey: apiKey,
    maxTokens,
    temperature: config?.temperature || 0.5,
  });
}

/**
 * Create OpenAI GPT-4 client as fallback
 */
export function createOpenAILLM(config?: Partial<LLMConfig>): ChatOpenAI {
  const apiKey = getOpenAIApiKey();
  const maxTokens = config?.maxTokens || parseInt(getEnv('MAX_OUTPUT_TOKENS_REASONING', '16000') as string);

  return new ChatOpenAI({
    modelName: config?.model || 'gpt-4-turbo-preview',
    openAIApiKey: apiKey,
    maxTokens,
    temperature: config?.temperature || 0.4,
  });
}

/**
 * Estimate token usage cost (rough estimates)
 */
export function estimateCost(provider: LLMProvider, tokensInput: number, tokensOutput: number): number {
  if (provider === 'anthropic') {
    // Claude Sonnet 4.5 pricing (as of 2024, approximate)
    const inputCostPer1M = 3.0; // $3 per 1M input tokens
    const outputCostPer1M = 15.0; // $15 per 1M output tokens
    return (tokensInput / 1_000_000) * inputCostPer1M + (tokensOutput / 1_000_000) * outputCostPer1M;
  } else {
    // OpenAI GPT-4 pricing (as of 2024, approximate)
    const inputCostPer1M = 10.0; // $10 per 1M input tokens
    const outputCostPer1M = 30.0; // $30 per 1M output tokens
    return (tokensInput / 1_000_000) * inputCostPer1M + (tokensOutput / 1_000_000) * outputCostPer1M;
  }
}


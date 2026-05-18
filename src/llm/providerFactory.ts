import { ClaudeProvider } from './claudeProvider';
import { GeminiProvider } from './geminiProvider';
import { MockLLMProvider } from './mockProvider';
import { OpenAIProvider } from './openaiProvider';
import type { LLMProvider, LLMProviderConfig } from './types';

export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  const apiKey =
    config.apiKey ||
    process.env.LLM_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY;

  switch (config.provider) {
    case 'openai':
      if (!apiKey) return new MockLLMProvider('mock-openai-fallback');
      return new OpenAIProvider(apiKey, config.model || 'gpt-4o-mini', config.baseUrl);
    case 'claude':
      if (!apiKey) return new MockLLMProvider('mock-claude-fallback');
      return new ClaudeProvider(apiKey, config.model || 'claude-3-5-haiku-latest', config.baseUrl);
    case 'gemini':
      if (!apiKey) return new MockLLMProvider('mock-gemini-fallback');
      return new GeminiProvider(apiKey, config.model || process.env.GEMINI_MODEL || 'gemini-2.0-flash', config.baseUrl);
    case 'mock':
    default:
      return new MockLLMProvider(config.model || 'mock-reasoning-v1');
  }
}

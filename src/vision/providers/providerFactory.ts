import { ClaudeVisionProvider } from './claudeVisionProvider';
import { MockVisionProvider } from './mockVisionProvider';
import { OmniParserProvider } from './omniParserProvider';
import { OpenAIVisionProvider } from './openaiVisionProvider';
import type { VisionProvider, VisionProviderConfig } from './types';

export function createVisionProvider(config: VisionProviderConfig): VisionProvider {
  const apiKey =
    config.apiKey ||
    process.env.VISION_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY;

  switch (config.provider) {
    case 'openai':
      return apiKey ? new OpenAIVisionProvider(apiKey, config.model) : new MockVisionProvider('mock-openai-vision');
    case 'claude':
      return apiKey ? new ClaudeVisionProvider(apiKey, config.model) : new MockVisionProvider('mock-claude-vision');
    case 'omniparser':
      return new OmniParserProvider(config.baseUrl, config.model);
    case 'mock':
    default:
      return new MockVisionProvider(config.model);
  }
}

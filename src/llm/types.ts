export type LLMProviderId = 'mock' | 'openai' | 'claude' | 'gemini';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'text' | 'json';
}

export interface LLMResponse {
  content: string;
  provider: LLMProviderId;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

export interface LLMProviderConfig {
  provider: LLMProviderId;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
}

export interface LLMProvider {
  readonly id: LLMProviderId;
  readonly model: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

import type { LLMProvider, LLMRequest, LLMResponse } from './types';

export class ClaudeProvider implements LLMProvider {
  readonly id = 'claude' as const;

  constructor(
    private readonly apiKey: string,
    readonly model = 'claude-3-5-haiku-latest',
    private readonly baseUrl = 'https://api.anthropic.com/v1',
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const system = request.messages.find((message) => message.role === 'system')?.content;
    const messages = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({ role: message.role, content: message.content }));

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: request.maxTokens ?? 800,
        temperature: request.temperature ?? 0.2,
        system,
        messages,
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude request failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const content = payload.content?.find((block) => block.type === 'text')?.text || '{}';
    return {
      provider: this.id,
      model: this.model,
      content,
      usage: {
        promptTokens: payload.usage?.input_tokens,
        completionTokens: payload.usage?.output_tokens,
      },
    };
  }
}

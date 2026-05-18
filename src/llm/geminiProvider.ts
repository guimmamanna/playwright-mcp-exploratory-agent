import type { LLMProvider, LLMRequest, LLMResponse } from './types';

export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini' as const;

  constructor(
    private readonly apiKey: string,
    readonly model = 'gemini-2.0-flash',
    private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const prompt = request.messages.map((message) => `${message.role}: ${message.content}`).join('\n\n');
    const response = await fetch(
      `${this.baseUrl}/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: request.temperature ?? 0.2,
            maxOutputTokens: request.maxTokens ?? 800,
            responseMimeType: request.responseFormat === 'json' ? 'application/json' : 'text/plain',
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini request failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}';
    return {
      provider: this.id,
      model: this.model,
      content,
      usage: {
        promptTokens: payload.usageMetadata?.promptTokenCount,
        completionTokens: payload.usageMetadata?.candidatesTokenCount,
      },
    };
  }
}

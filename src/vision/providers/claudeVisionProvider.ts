import { readFile } from 'node:fs/promises';
import type { VisionAnalysisResult } from '../models/types';
import type { VisionAnalysisRequest, VisionProvider } from './types';

export class ClaudeVisionProvider implements VisionProvider {
  readonly id = 'claude' as const;

  constructor(
    private readonly apiKey: string,
    readonly model = 'claude-3-5-haiku-latest',
    private readonly baseUrl = 'https://api.anthropic.com/v1',
  ) {}

  async analyze(request: VisionAnalysisRequest): Promise<VisionAnalysisResult> {
    const imageBase64 = (await readFile(request.screenshotPath)).toString('base64');
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 900,
        system: 'Return strict JSON with regions, anomalies, reasoning, ocrLines for UI screenshot analysis.',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: imageBase64 },
              },
              {
                type: 'text',
                text: `Analyze ${request.url}. OCR hints: ${request.ocrLines.slice(0, 15).join(' | ')}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude vision failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as { content?: Array<{ text?: string }> };
    const text = payload.content?.map((block) => block.text || '').join('') || '{}';
    return JSON.parse(text) as VisionAnalysisResult;
  }
}

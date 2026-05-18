import { readFile } from 'node:fs/promises';
import type { VisionAnalysisResult } from '../models/types';
import type { VisionAnalysisRequest, VisionProvider } from './types';

export class OpenAIVisionProvider implements VisionProvider {
  readonly id = 'openai' as const;

  constructor(
    private readonly apiKey: string,
    readonly model = 'gpt-4o-mini',
    private readonly baseUrl = 'https://api.openai.com/v1',
  ) {}

  async analyze(request: VisionAnalysisRequest): Promise<VisionAnalysisResult> {
    const imageBase64 = (await readFile(request.screenshotPath)).toString('base64');
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Analyze UI screenshots. Return JSON: regions[], anomalies[], reasoning{}, ocrLines[]. Regions need kind, label, bounds{x,y,width,height}, confidence.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Analyze UI at ${request.url}. OCR: ${request.ocrLines.slice(0, 20).join(' | ')}` },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
            ],
          },
        ],
        max_tokens: 900,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI vision failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return JSON.parse(payload.choices?.[0]?.message?.content || '{}') as VisionAnalysisResult;
  }
}

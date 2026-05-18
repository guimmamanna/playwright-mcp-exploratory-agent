import { MockVisionProvider } from './mockVisionProvider';
import type { VisionAnalysisRequest, VisionProvider } from './types';
import type { VisionAnalysisResult } from '../models/types';

/**
 * OmniParser integration stub. Uses a local HTTP endpoint when configured,
 * otherwise falls back to mock heuristics for offline tests.
 */
export class OmniParserProvider implements VisionProvider {
  readonly id = 'omniparser' as const;
  readonly model: string;
  private readonly fallback = new MockVisionProvider('omniparser-fallback');

  constructor(
    private readonly endpoint?: string,
    model = 'omniparser-v1',
  ) {
    this.model = model;
  }

  async analyze(request: VisionAnalysisRequest): Promise<VisionAnalysisResult> {
    if (!this.endpoint) {
      return this.fallback.analyze(request);
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imagePath: request.screenshotPath,
        url: request.url,
        ocrLines: request.ocrLines,
      }),
    });

    if (!response.ok) {
      return this.fallback.analyze(request);
    }

    return (await response.json()) as VisionAnalysisResult;
  }
}

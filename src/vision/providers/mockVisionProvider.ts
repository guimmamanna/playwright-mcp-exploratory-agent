import type { VisionAnalysisResult } from '../models/types';
import type { VisionAnalysisRequest, VisionProvider } from './types';

function inferReasoning(request: VisionAnalysisRequest): VisionAnalysisResult['reasoning'] {
  const text = [request.observation.visibleTextSummary, ...request.ocrLines].join(' ').toLowerCase();
  const buttons = request.domRegions.filter((region) => region.kind === 'button' || region.kind === 'primary-cta');
  const forms = request.domRegions.filter((region) => region.kind === 'form');
  const nav = request.domRegions.filter((region) => region.kind === 'navigation');

  return {
    primaryArea: forms.length ? 'form area' : nav.length ? 'navigation/header' : buttons.length ? 'action controls' : 'content',
    pageUsable: text.length > 15 || buttons.length > 0,
    navigationAppearsBroken: nav.length === 0 && request.observation.links.length > 0 && buttons.length === 0,
    formsAppearIncomplete: forms.length > 0 && request.observation.forms.some((form) => form.labelsMissing > 0),
    importantCtasVisible: buttons.some((button) => /submit|sign in|continue|search/i.test(button.label || '')),
    summary: 'Mock vision analysis fused DOM bounds with OCR text to estimate usable UI regions.',
  };
}

export class MockVisionProvider implements VisionProvider {
  readonly id = 'mock' as const;
  readonly model: string;

  constructor(model = 'mock-vision-v1') {
    this.model = model;
  }

  async analyze(request: VisionAnalysisRequest): Promise<VisionAnalysisResult> {
    const visionRegions = request.domRegions.map((region) => ({
      ...region,
      confidence: Math.min(0.95, region.confidence + 0.05),
      source: 'vision' as const,
    }));

    const anomalies = [];
    if (request.observation.url === 'about:blank') {
      anomalies.push({
        id: 'unexpected-state:about-blank',
        anomalyType: 'unexpected-state' as const,
        severity: 'medium' as const,
        title: 'Unexpected blank document state',
        description: 'The screenshot appears to be an empty browser document.',
        recommendation: 'Navigate to the configured base URL before exploring.',
      });
    }

    return {
      regions: visionRegions,
      anomalies,
      reasoning: inferReasoning(request),
      ocrLines: request.ocrLines,
      providerNotes: `Analyzed ${request.screenshotPath} with mock multimodal heuristics.`,
    };
  }
}

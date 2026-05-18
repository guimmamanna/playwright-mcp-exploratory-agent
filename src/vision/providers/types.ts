import type { VisionAnalysisResult } from '../models/types';
import type { Observation } from '../../types';

export type VisionProviderId = 'mock' | 'openai' | 'claude' | 'omniparser';

export interface VisionAnalysisRequest {
  screenshotPath: string;
  url: string;
  viewport: { width: number; height: number };
  observation: Observation;
  ocrLines: string[];
  domRegions: VisionAnalysisResult['regions'];
}

export interface VisionProviderConfig {
  provider: VisionProviderId;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface VisionProvider {
  readonly id: VisionProviderId;
  readonly model: string;
  analyze(request: VisionAnalysisRequest): Promise<VisionAnalysisResult>;
}

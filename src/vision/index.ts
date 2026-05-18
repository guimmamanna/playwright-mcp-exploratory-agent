export { VisionEngine, defaultVisionEngine } from './visionEngine';
export { extractOcrFromPage } from './ocr';
export { collectDomRegions, fuseUnderstanding } from './domFusion';
export { detectVisionAnomalies } from './anomalyDetection';
export { annotateScreenshot } from './screenshotAnnotator';
export { findVisionRegion, clickVisionRegion, visionLocatorStrategy, shouldUseVisionFallback } from './visualFallback';
export { visionSignalsToFindings } from './findingFactory';
export { createVisionProvider } from './providers/providerFactory';
export type {
  VisionSignals,
  VisionUIRegion,
  VisionAnomaly,
  VisionAnomalyType,
  VisionReasoning,
  UnifiedUIUnderstanding,
} from './models/types';

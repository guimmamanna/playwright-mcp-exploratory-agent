export type VisionUIRegionKind =
  | 'button'
  | 'form'
  | 'modal'
  | 'alert'
  | 'navigation'
  | 'overlay'
  | 'primary-cta'
  | 'section'
  | 'other';

export type VisionAnomalyType =
  | 'blank-page'
  | 'partial-render'
  | 'hidden-dialog'
  | 'overlay-collision'
  | 'stuck-spinner'
  | 'missing-section'
  | 'broken-layout'
  | 'unexpected-state'
  | 'duplicate-dialog'
  | 'disabled-cta-confusion'
  | 'ghost-element';

export interface VisionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisionUIRegion {
  id: string;
  kind: VisionUIRegionKind;
  label?: string;
  bounds: VisionBounds;
  confidence: number;
  source: 'dom' | 'vision' | 'ocr' | 'fused';
  selectorHint?: string;
}

export interface VisionAnomaly {
  id: string;
  anomalyType: VisionAnomalyType;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  recommendation: string;
  regionId?: string;
  bounds?: VisionBounds;
}

export interface VisionReasoning {
  primaryArea?: string;
  pageUsable: boolean;
  navigationAppearsBroken: boolean;
  formsAppearIncomplete: boolean;
  importantCtasVisible: boolean;
  summary: string;
}

export interface VisionAnalysisResult {
  regions: VisionUIRegion[];
  anomalies: VisionAnomaly[];
  reasoning: VisionReasoning;
  ocrLines: string[];
  providerNotes?: string;
}

export interface UnifiedUIUnderstanding {
  regions: VisionUIRegion[];
  fusedText: string;
  domElementCount: number;
  visionConfidence: number;
  weakDomStructure: boolean;
  hasShadowDomHints: boolean;
  hasCanvasRendering: boolean;
  poorAccessibilityMetadata: boolean;
}

export interface VisionSignals {
  provider: string;
  screenshotPath?: string;
  annotatedScreenshotPath?: string;
  heatmapPath?: string;
  ocrTextSummary: string;
  ocrLines: string[];
  regions: VisionUIRegion[];
  anomalies: VisionAnomaly[];
  reasoning: VisionReasoning;
  understanding: UnifiedUIUnderstanding;
  domVisionConfidence: number;
  cacheHit?: boolean;
  summary: string;
}

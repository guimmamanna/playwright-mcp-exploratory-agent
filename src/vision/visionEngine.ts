import type { Page } from '@playwright/test';
import type { ExplorationConfig, ExplorationSession, Observation } from '../types';
import { detectVisionAnomalies } from './anomalyDetection';
import { getCachedVision, setCachedVision, visionCacheKey } from './cache';
import { collectDomRegions, fuseUnderstanding } from './domFusion';
import { extractOcrFromPage } from './ocr';
import { annotateScreenshot } from './screenshotAnnotator';
import type { VisionSignals } from './models/types';
import { createVisionProvider } from './providers/providerFactory';
import type { VisionProvider } from './providers/types';

export interface VisionEngineOptions {
  provider?: VisionProvider;
  visionProvider?: ExplorationConfig['visionProvider'];
  model?: string;
  apiKey?: string;
  endpoint?: string;
}

export class VisionEngine {
  private readonly provider: VisionProvider;
  private analyzedCount = 0;

  constructor(options: VisionEngineOptions = {}) {
    this.provider =
      options.provider ||
      createVisionProvider({
        provider: options.visionProvider || 'mock',
        model: options.model,
        apiKey: options.apiKey,
        baseUrl: options.endpoint,
      });
  }

  shouldAnalyze(session: ExplorationSession, config: ExplorationConfig, phase?: Observation['phase']) {
    if (config.visionMultimodalEnabled === false) return false;
    const mode = config.visionMode || 'batched';
    if (mode === 'off') return false;
    if (mode === 'every-step') return true;
    if (mode === 'on-failure') return phase === 'after';
    const batchSize = config.visionBatchSize || 2;
    return session.steps.length % batchSize === 0 || phase === 'before';
  }

  async analyzePage(
    page: Page,
    session: ExplorationSession,
    observation: Observation,
    config: ExplorationConfig,
  ): Promise<VisionSignals | undefined> {
    if (!this.shouldAnalyze(session, config, observation.phase)) {
      return undefined;
    }

    const maxPerSession = config.visionMaxScreenshotsPerSession || 12;
    if (this.analyzedCount >= maxPerSession) {
      return session.memory.observations.at(-1)?.visionSignals;
    }

    const screenshotPath = observation.screenshotPath || observation.visualSignals?.captures[0]?.screenshotPath;
    if (!screenshotPath) {
      return undefined;
    }

    const cacheKey = visionCacheKey(observation.url, screenshotPath);
    if (config.visionCacheEnabled !== false) {
      const cached = getCachedVision(cacheKey);
      if (cached) return cached;
    }

    const viewport = page.viewportSize() || config.viewport;
    const ocr = await extractOcrFromPage(page);
    const dom = await collectDomRegions(page);

    let providerResult;
    try {
      providerResult = await this.provider.analyze({
        screenshotPath,
        url: observation.url,
        viewport,
        observation,
        ocrLines: ocr.lines,
        domRegions: dom.regions,
      });
    } catch {
      providerResult = {
        regions: dom.regions,
        anomalies: [],
        reasoning: {
          pageUsable: true,
          navigationAppearsBroken: false,
          formsAppearIncomplete: false,
          importantCtasVisible: true,
          summary: 'Vision provider failed; DOM fusion used as fallback.',
        },
        ocrLines: ocr.lines,
      };
    }

    const fusedRegions = [...dom.regions, ...providerResult.regions];
    const heuristics = detectVisionAnomalies({
      observation,
      regions: fusedRegions,
      ocrLines: ocr.lines,
      viewport,
    });

    const anomalies = [...providerResult.anomalies, ...heuristics];
    const understanding = fuseUnderstanding({
      observation,
      domRegions: dom.regions,
      visionRegions: providerResult.regions,
      ocrLines: ocr.lines,
      hasShadowDom: dom.hasShadowDom,
      hasCanvas: dom.hasCanvas,
      poorAccessibility: dom.poorAccessibility,
    });

    let annotatedScreenshotPath: string | undefined;
    let heatmapPath: string | undefined;
    if (config.visionAnnotateScreenshots !== false) {
      const annotated = await annotateScreenshot({
        screenshotPath,
        evidenceDirectory: config.evidenceDirectory,
        url: observation.url,
        regions: understanding.regions,
        anomalies,
      });
      annotatedScreenshotPath = annotated.annotatedScreenshotPath;
      heatmapPath = annotated.heatmapPath;
    }

    const signals: VisionSignals = {
      provider: `${this.provider.id}:${this.provider.model}`,
      screenshotPath,
      annotatedScreenshotPath,
      heatmapPath,
      ocrTextSummary: ocr.summary,
      ocrLines: ocr.lines,
      regions: understanding.regions,
      anomalies,
      reasoning: providerResult.reasoning,
      understanding,
      domVisionConfidence: understanding.visionConfidence,
      summary: `regions=${understanding.regions.length}; anomalies=${anomalies.length}; ocrLines=${ocr.lines.length}`,
    };

    if (config.visionCacheEnabled !== false) {
      setCachedVision(cacheKey, signals);
    }

    this.analyzedCount += 1;
    return signals;
  }
}

export const defaultVisionEngine = new VisionEngine();

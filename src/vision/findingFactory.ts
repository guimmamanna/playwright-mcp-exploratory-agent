import type { Finding, Observation } from '../types';
import { normalizeFinding } from '../reporting/severityScoring';
import type { VisionAnomaly, VisionSignals } from './models/types';

function findingId(type: string, key: string) {
  return `vision-multimodal:${type}:${key}`.toLowerCase().replace(/[^a-z0-9:.-]+/g, '-').slice(0, 120);
}

export function visionSignalsToFindings(signals: VisionSignals, observation: Observation, options: { stepId?: string } = {}): Finding[] {
  return signals.anomalies.map((anomaly) => anomalyToFinding(anomaly, observation, signals, options));
}

function anomalyToFinding(
  anomaly: VisionAnomaly,
  observation: Observation,
  signals: VisionSignals,
  options: { stepId?: string },
): Finding {
  const evidence = [];
  if (signals.annotatedScreenshotPath) {
    evidence.push({ label: 'Annotated screenshot', path: signals.annotatedScreenshotPath, kind: 'screenshot' as const });
  } else if (signals.screenshotPath) {
    evidence.push({ label: 'Screenshot', path: signals.screenshotPath, kind: 'screenshot' as const });
  }
  if (signals.heatmapPath) {
    evidence.push({ label: 'Vision heatmap', path: signals.heatmapPath, kind: 'other' as const });
  }

  return normalizeFinding({
    id: findingId(anomaly.anomalyType, anomaly.id),
    type: 'visual-anomaly',
    severity: anomaly.severity,
    category: 'visual',
    title: anomaly.title,
    description: anomaly.description,
    url: observation.url,
    stepId: options.stepId || observation.stepId,
    recommendation: anomaly.recommendation,
    suspectedRootCause: signals.reasoning.summary,
    visionAnomalyType: anomaly.anomalyType,
    evidence,
    reproductionSteps: [
      `Open ${observation.url}`,
      'Review annotated screenshot and detected UI regions.',
      anomaly.recommendation,
    ],
    status: 'new',
  });
}

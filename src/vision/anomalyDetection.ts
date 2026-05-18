import type { Observation } from '../types';
import type { VisionAnomaly, VisionUIRegion } from './models/types';

export function detectVisionAnomalies(args: {
  observation: Observation;
  regions: VisionUIRegion[];
  ocrLines: string[];
  viewport: { width: number; height: number };
}): VisionAnomaly[] {
  const { observation, regions, ocrLines, viewport } = args;
  const anomalies: VisionAnomaly[] = [];
  const text = [observation.visibleTextSummary, ...ocrLines].join(' ').toLowerCase();

  if (text.trim().length < 20 && regions.length < 2) {
    anomalies.push({
      id: 'blank-page',
      anomalyType: 'blank-page',
      severity: 'high',
      title: 'Blank or nearly empty page detected',
      description: 'The rendered page appears visually empty or missing primary content.',
      recommendation: 'Verify routing, auth gates, and loading states for this URL.',
    });
  }

  if (/loading|spinner|please wait/i.test(text) && regions.filter((region) => region.kind === 'button').length === 0) {
    anomalies.push({
      id: 'stuck-spinner',
      anomalyType: 'stuck-spinner',
      severity: 'medium',
      title: 'Loading spinner may be stuck',
      description: 'Loading indicators are visible without actionable controls.',
      recommendation: 'Wait for network idle and verify async data dependencies.',
    });
  }

  const modals = regions.filter((region) => region.kind === 'modal');
  if (modals.length > 1) {
    anomalies.push({
      id: 'duplicate-dialog',
      anomalyType: 'duplicate-dialog',
      severity: 'medium',
      title: 'Duplicate dialogs detected',
      description: 'Multiple modal regions are visible simultaneously.',
      recommendation: 'Ensure only one dialog is mounted and dismiss stale overlays.',
    });
  }

  const hiddenModal = modals.find((modal) => modal.bounds.width < 40 || modal.bounds.height < 40);
  if (hiddenModal) {
    anomalies.push({
      id: 'hidden-dialog',
      anomalyType: 'hidden-dialog',
      severity: 'medium',
      title: 'Hidden dialog candidate detected',
      description: 'A dialog region exists but appears too small to be usable.',
      recommendation: 'Inspect modal visibility CSS and animation state.',
      regionId: hiddenModal.id,
      bounds: hiddenModal.bounds,
    });
  }

  const overlays = regions.filter((region) => region.kind === 'overlay');
  const primaryCtas = regions.filter((region) => region.kind === 'primary-cta' || region.kind === 'button');
  if (overlays.length && primaryCtas.some((cta) => overlaps(overlays[0].bounds, cta.bounds))) {
    anomalies.push({
      id: 'overlay-collision',
      anomalyType: 'overlay-collision',
      severity: 'high',
      title: 'Overlay may be blocking primary actions',
      description: 'An overlay region overlaps actionable controls.',
      recommendation: 'Dismiss blocking overlays or adjust z-index and pointer events.',
      regionId: overlays[0].id,
      bounds: overlays[0].bounds,
    });
  }

  if (observation.forms.length > 0 && regions.filter((region) => region.kind === 'form').length === 0) {
    anomalies.push({
      id: 'partial-render',
      anomalyType: 'partial-render',
      severity: 'medium',
      title: 'Partially rendered form detected',
      description: 'DOM reports forms but visual regions did not identify a form area.',
      recommendation: 'Check dynamic rendering, shadow DOM, or canvas-based UI.',
    });
  }

  const disabledPrimary = primaryCtas.filter((cta) => /submit|continue|save|sign in/i.test(cta.label || ''));
  if (disabledPrimary.length && /disabled|unavailable/i.test(text)) {
    anomalies.push({
      id: 'disabled-cta-confusion',
      anomalyType: 'disabled-cta-confusion',
      severity: 'low',
      title: 'Primary CTA may appear disabled or confusing',
      description: 'Primary call-to-action text suggests action but page text hints disabled state.',
      recommendation: 'Clarify CTA state with consistent enabled/disabled styling.',
    });
  }

  if (viewport.width > 0 && regions.every((region) => region.bounds.x > viewport.width)) {
    anomalies.push({
      id: 'broken-layout',
      anomalyType: 'broken-layout',
      severity: 'high',
      title: 'Broken layout detected',
      description: 'Detected UI regions appear outside the viewport bounds.',
      recommendation: 'Review responsive layout and horizontal overflow.',
    });
  }

  if (regions.length > 12 && text.split(' ').length < 15) {
    anomalies.push({
      id: 'ghost-element',
      anomalyType: 'ghost-element',
      severity: 'low',
      title: 'Ghost elements suspected',
      description: 'Many visual regions exist with very little readable text.',
      recommendation: 'Inspect invisible or zero-opacity elements affecting layout.',
    });
  }

  return anomalies;
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

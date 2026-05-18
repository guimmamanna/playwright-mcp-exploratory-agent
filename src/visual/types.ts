import type { FindingSeverity } from '../types';

export type VisualIssueType =
  | 'overlapping-elements'
  | 'clipped-text'
  | 'horizontal-scroll'
  | 'hidden-primary-button'
  | 'broken-image'
  | 'missing-icon'
  | 'layout-shift-candidate'
  | 'modal-overflow'
  | 'sticky-header-overlap'
  | 'small-text-candidate'
  | 'outside-viewport'
  | 'empty-image-placeholder'
  | 'visual-diff';

export interface ViewportProfile {
  name: string;
  width: number;
  height: number;
}

export interface VisualIssue {
  id: string;
  issueType: VisualIssueType;
  severity: FindingSeverity;
  title: string;
  description: string;
  viewport: string;
  affectedSelector?: string;
  recommendation: string;
  screenshotPath?: string;
  diffPath?: string;
  diffRatio?: number;
}

export interface ViewportCaptureResult {
  viewport: ViewportProfile;
  screenshotPath?: string;
  baselinePath?: string;
  diffPath?: string;
  diffRatio?: number;
  issues: VisualIssue[];
}

export interface VisualSignals {
  activeViewport: string;
  captures: Array<{
    viewport: string;
    width: number;
    height: number;
    screenshotPath?: string;
    baselinePath?: string;
    diffPath?: string;
    diffRatio?: number;
    issueCount: number;
  }>;
  issues: Array<{
    id: string;
    issueType: VisualIssueType;
    severity: FindingSeverity;
    title: string;
    description: string;
    viewport: string;
    affectedSelector?: string;
    recommendation: string;
    screenshotPath?: string;
    diffPath?: string;
    diffRatio?: number;
  }>;
  summary: string;
}

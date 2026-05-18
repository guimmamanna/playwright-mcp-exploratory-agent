export { VisualEngine, defaultVisualEngine } from './visualEngine';
export { visualIssueToFinding, issuesToFindings } from './findingFactory';
export { inspectVisualDom } from './domInspection';
export { captureViewportScreenshot } from './screenshotCapture';
export { responsiveViewports, viewportByName } from './viewports';
export { compareScreenshots, baselinePathFor, diffPathFor, screenshotPathFor } from './visualDiff';
export type { VisualIssue, VisualIssueType, VisualSignals, ViewportProfile, ViewportCaptureResult } from './types';

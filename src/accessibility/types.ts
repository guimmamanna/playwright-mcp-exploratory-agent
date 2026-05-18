import type { FindingSeverity } from '../types';

export interface AccessibilityIssue {
  id: string;
  issueType: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  wcagReference?: string;
  affectedSelector?: string;
  affectedRole?: string;
  affectedName?: string;
  recommendation: string;
}

export interface KeyboardProbeResult {
  focusOrder: string[];
  unreachableControls: string[];
  keyboardTrapDetected: boolean;
  focusDisappeared: boolean;
}

export interface DomInspectionResult {
  issues: AccessibilityIssue[];
  landmarks: string[];
  headingLevels: number[];
}

export interface AxeScanResult {
  violationCount: number;
  issues: AccessibilityIssue[];
}

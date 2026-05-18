import type { FindingSeverity } from '../types';
import type { NetworkThresholds } from './types';

export const defaultNetworkThresholds: NetworkThresholds = {
  warnMs: 1000,
  highMs: 3000,
  criticalMs: 8000,
};

export function slowSeverityForResponseTime(responseTimeMs: number, thresholds: NetworkThresholds = defaultNetworkThresholds): FindingSeverity | undefined {
  if (responseTimeMs >= thresholds.criticalMs) {
    return 'critical';
  }
  if (responseTimeMs >= thresholds.highMs) {
    return 'high';
  }
  if (responseTimeMs >= thresholds.warnMs) {
    return 'medium';
  }
  return undefined;
}

export { findingFingerprint, selectorKey, flowKey, pathnameOf, normalizeTitle } from './fingerprints';
export {
  isSuppressedFinding,
  suppressedFingerprints,
  markFindingStatus,
  filterSuppressedFindings,
} from './falsePositiveManager';
export {
  updateRiskScoresFromSession,
  topRiskRoutes,
  riskScoreForRoute,
  recordRecurringBug,
  repeatedBugFingerprints,
} from './riskScoring';
export { extractLearningSignals } from './signalExtractor';
export { compareWithHistory } from './historicalComparison';
export { memoryPriorityBoost, applyReliableSelectorHints } from './memoryPlanning';

import type {
  Finding,
  FindingCategory,
  FindingSeverity,
  FindingType,
  ReproducibilityConfidence,
} from '../types';

function combinedText(input: Pick<Finding, 'title' | 'description' | 'type'> & Partial<Pick<Finding, 'suspectedRootCause'>>) {
  return [input.type, input.title, input.description, input.suspectedRootCause].filter(Boolean).join(' ').toLowerCase();
}

export function titleCaseSeverity(severity: FindingSeverity) {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export function titleCaseCategory(category: FindingCategory) {
  return category
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function classifyFindingCategory(input: {
  type: FindingType;
  title?: string;
  description?: string;
}): FindingCategory {
  const text = [input.type, input.title, input.description].filter(Boolean).join(' ').toLowerCase();

  if (input.type === 'console-error') return 'console-error';
  if (input.type === 'network-failure' || /\b(request|network|api|http|xhr|fetch)\b/.test(text)) return 'network-error';
  if (input.type === 'accessibility' || /\b(accessibility|aria|label|keyboard|screen reader|contrast)\b/.test(text)) {
    return 'accessibility';
  }
  if (input.type === 'visual-anomaly' || /\b(layout|visual|cosmetic|overlap|alignment|clipped)\b/.test(text)) {
    return 'visual';
  }
  if (/\b(slow|timeout|performance|hang|latency|long task)\b/.test(text)) return 'performance';
  if (/\b(data|saved wrong|incorrect value|stale|persistence|loss)\b/.test(text)) return 'data-issue';
  if (input.type === 'empty-state' || input.type === 'form-validation') return 'usability';

  return 'functional';
}

export function scoreFindingSeverity(input: {
  type: FindingType;
  category?: FindingCategory;
  title: string;
  description: string;
  currentSeverity?: FindingSeverity;
  suspectedRootCause?: string;
}): FindingSeverity {
  const text = combinedText({
    type: input.type,
    title: input.title,
    description: input.description,
    suspectedRootCause: input.suspectedRootCause,
  });
  const category = input.category || classifyFindingCategory(input);

  if (
    /\b(data loss|security|xss|csrf|leak|exposed secret|payment corruption|checkout corruption)\b/.test(text) ||
    (/\b(payment|checkout|basket|cart)\b/.test(text) && /\b(corrupt|wrong total|charged|blocked|failed|broken)\b/.test(text)) ||
    (/\b(core flow|cannot continue|blocked core|irreversible)\b/.test(text) && !/\bnon-blocking\b/.test(text))
  ) {
    return 'critical';
  }

  if (
    /\b(authentication failure|auth failure|login failed|sign in failed|cannot sign in|major user flow|repeated crash|crash loop)\b/.test(text) ||
    /\b(severe accessibility blocker|keyboard trap|screen reader blocker)\b/.test(text)
  ) {
    return 'high';
  }

  if (category === 'network-error' && /\b(500|502|503|504|net::err|timeout)\b/.test(text)) {
    return 'high';
  }

  if (category === 'console-error' && /\b(uncaught|typeerror|referenceerror|syntaxerror|crash|fatal)\b/.test(text)) {
    return 'high';
  }

  if (input.type === 'navigation-dead-end' || input.type === 'loop-detected') {
    return 'high';
  }

  if (category === 'accessibility' && /\b(unlabelled|missing label|no accessible label|required)\b/.test(text)) {
    return 'medium';
  }

  if (
    category === 'network-error' ||
    input.type === 'form-validation' ||
    input.type === 'empty-state' ||
    /\b(partially broken|confusing validation|non-blocking failed request|400|401|403|404|invalid|required)\b/.test(text)
  ) {
    return 'medium';
  }

  if (category === 'visual' || /\b(cosmetic|minor text|typo|layout inconsistency|small layout)\b/.test(text)) {
    return 'low';
  }

  return input.currentSeverity || 'medium';
}

export function inferReproducibilityConfidence(finding: Finding): ReproducibilityConfidence {
  if (finding.reproducibilityConfidence) {
    return finding.reproducibilityConfidence;
  }

  if (finding.evidence.length > 0 && finding.reproductionSteps.length > 1) {
    return 'high';
  }

  if (finding.reproductionSteps.length > 0) {
    return 'medium';
  }

  return 'low';
}

export function normalizeFinding(finding: Finding): Finding {
  const category = finding.category || classifyFindingCategory(finding);
  return {
    ...finding,
    category,
    severity: scoreFindingSeverity({
      type: finding.type,
      category,
      title: finding.title,
      description: finding.description,
      currentSeverity: finding.severity,
      suspectedRootCause: finding.suspectedRootCause,
    }),
    reproducibilityConfidence: inferReproducibilityConfidence({ ...finding, category }),
  };
}

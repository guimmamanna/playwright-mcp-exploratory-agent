import type { Finding } from '../types';
import { classifyFindingCategory, normalizeFinding } from '../reporting/severityScoring';
import { createAgentMessage } from '../multi-agent/protocol';
import type { AgentMessage, BlackboardMemory, CoordinatorContext, MultiAgentFocus, SpecialistAgent } from '../multi-agent/types';

const SENSITIVE_PATTERNS = [
  /\b(api[_-]?key|secret|password|bearer\s+[a-z0-9._-]+|sk_live_|sk_test_)\b/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b.*\b(password|token|secret)\b/i,
];

const AUTH_LEAK_PATTERNS = [
  /localStorage\.(get|set)Item\(['"]token/i,
  /sessionStorage\.(get|set)Item\(['"]auth/i,
  /Authorization:\s*Bearer/i,
];

function findingId(key: string) {
  return `security:${key}`.toLowerCase().replace(/[^a-z0-9:.-]+/g, '-').slice(0, 120);
}

export class SecuritySmokeAgent implements SpecialistAgent {
  readonly name = 'SecuritySmokeAgent' as const;

  supportsFocus(focus: MultiAgentFocus): boolean {
    return focus === 'full';
  }

  analyze(context: CoordinatorContext, _blackboard: BlackboardMemory): AgentMessage[] {
    const { observation, stepId } = context;
    const messages: AgentMessage[] = [];
    const visibleText = observation.visibleText || observation.visibleTextSummary || '';
    const consoleText = observation.consoleMessages.map((m) => m.text).join('\n');
    const combined = `${visibleText}\n${consoleText}`;

    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(combined)) {
        const finding: Finding = normalizeFinding({
          id: findingId(`${observation.url}:sensitive-data`),
          type: 'safety',
          category: classifyFindingCategory({ type: 'safety', title: 'Sensitive data exposure' }),
          severity: 'high',
          title: 'Potential sensitive data exposed in UI or console',
          description: 'Non-destructive smoke check detected patterns that may indicate secrets or PII in visible content.',
          url: observation.url,
          stepId,
          evidence: [],
          reproductionSteps: [`Open ${observation.url}`, 'Inspect visible text and console output for secrets.'],
          status: 'needs-triage',
          discoveredByAgent: this.name,
        });
        messages.push(
          createAgentMessage({
            agentName: this.name,
            currentTask: 'Non-destructive security smoke checks',
            observation: 'Sensitive data pattern detected in UI or console',
            finding,
            confidence: 'medium',
            recommendation: 'Mask secrets in UI and avoid logging credentials.',
            nextSuggestedAction: 'Verify session handling does not leak tokens.',
          }),
        );
        break;
      }
    }

    for (const pattern of AUTH_LEAK_PATTERNS) {
      if (pattern.test(consoleText)) {
        const finding: Finding = normalizeFinding({
          id: findingId(`${observation.url}:auth-leak`),
          type: 'safety',
          category: 'data-issue',
          severity: 'medium',
          title: 'Possible auth token leakage in client logs',
          description: 'Console output references token storage or authorization headers.',
          url: observation.url,
          stepId,
          evidence: [],
          reproductionSteps: [`Open ${observation.url}`, 'Review console for auth-related messages.'],
          status: 'needs-triage',
          discoveredByAgent: this.name,
        });
        messages.push(
          createAgentMessage({
            agentName: this.name,
            currentTask: 'Non-destructive security smoke checks',
            observation: 'Auth-related pattern in console',
            finding,
            confidence: 'low',
            recommendation: 'Avoid logging tokens; use httpOnly cookies where possible.',
            nextSuggestedAction: 'Audit client-side auth storage.',
          }),
        );
        break;
      }
    }

    const sessionSignals = observation.networkSignals?.issues.filter(
      (issue) => issue.issueType === 'auth-session-issue',
    );
    if (sessionSignals?.length) {
      const finding: Finding = normalizeFinding({
        id: findingId(`${observation.url}:session-expiry`),
        type: 'safety',
        category: 'functional',
        severity: 'medium',
        title: 'Session or auth issue detected',
        description: sessionSignals.map((s) => s.description).join(' '),
        url: observation.url,
        stepId,
        evidence: [],
        reproductionSteps: [`Open ${observation.url}`, 'Perform an authenticated action', 'Observe session expiry behavior.'],
        status: 'new',
        discoveredByAgent: this.name,
      });
      messages.push(
        createAgentMessage({
          agentName: this.name,
          currentTask: 'Non-destructive security smoke checks',
          observation: 'Auth/session issue from network signals',
          finding,
          confidence: 'medium',
          recommendation: 'Verify session refresh and role-based access controls.',
          nextSuggestedAction: 'Test readonly vs admin persona access.',
        }),
      );
    }

    if (!messages.length) {
      messages.push(
        createAgentMessage({
          agentName: this.name,
          currentTask: 'Non-destructive security smoke checks',
          observation: `No security smoke issues on ${observation.url}`,
          confidence: 'medium',
          recommendation: 'Continue monitoring for auth and data exposure during flows.',
          nextSuggestedAction: 'Re-check after login/logout transitions.',
        }),
      );
    }

    return messages;
  }
}

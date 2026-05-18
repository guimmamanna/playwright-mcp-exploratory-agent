import type {
  ActionPlan,
  AgentAction,
  ExplorationConfig,
  ExplorationPlanner,
  ExplorationPriority,
  InteractiveElement,
  Observation,
  PlannerContext,
} from '../types';
import { adaptivePriorityBoost } from '../memory/adaptivePrioritisation';
import { applyReliableSelectorHints, memoryPriorityBoost } from '../learning/memoryPlanning';
import { isDuplicateAction } from '../memory/duplicateDetection';
import { actionSignature } from '../memory/elementKey';
import { evaluateActionPolicy, personaPriorityBoost } from '../personas/actionPolicy';
import { strategyPriorityBoost } from '../strategies/strategySelector';

interface Candidate {
  action: AgentAction;
  element?: InteractiveElement;
  priority: ExplorationPriority;
  score: number;
  riskLevel: ActionPlan['riskLevel'];
  rationale: string;
  expectedOutcome: string;
  validationIdea: string;
}

const PRIORITY_WEIGHT: Record<ExplorationPriority, number> = {
  search: 130,
  forms: 120,
  navigation: 80,
  filters: 95,
  authentication: 90,
  'create-edit-delete': 30,
  uploads: 45,
  settings: 55,
  'state-persistence': 50,
  accessibility: 40,
  responsiveness: 35,
  'console-network': 20,
  performance: 20,
};

const FORBIDDEN_WORDS = [
  'checkout',
  'payment',
  'pay',
  'purchase',
  'buy now',
  'place order',
  'delete',
  'remove',
  'cancel subscription',
  'send email',
  'send message',
  'compose message',
  'submit message',
  'account settings',
];

function planId(index: number) {
  return `plan-${String(index + 1).padStart(3, '0')}`;
}

function labelOf(element?: InteractiveElement) {
  return element?.label || element?.placeholder || element?.href || element?.selectorHint || 'unknown element';
}

function targetOf(element: InteractiveElement) {
  return element.selectorHint || element.label || element.placeholder || element.href || '';
}

function textOfCandidate(candidate: Pick<Candidate, 'action' | 'element'>) {
  return [
    candidate.action.kind,
    candidate.action.target,
    candidate.action.selector,
    candidate.action.url,
    candidate.action.reason,
    candidate.element?.label,
    candidate.element?.placeholder,
    candidate.element?.href,
    candidate.element?.selectorHint,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function actionTargets(action: AgentAction) {
  return [action.url, action.selector, action.target, action.key].filter(Boolean).map((value) => value!.toLowerCase());
}

function isForbiddenText(text: string, config: ExplorationConfig) {
  const normalized = text.toLowerCase();
  return [...FORBIDDEN_WORDS, ...config.forbiddenActions].some((word) =>
    normalized.includes(word.toLowerCase()),
  );
}

function isExternalUrlBlocked(url: string | undefined, config: ExplorationConfig) {
  if (!url || !config.allowedDomains.length) {
    return false;
  }

  try {
    const hostname = new URL(url).hostname;
    return !config.allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function goalPriorityBoost(priority: ExplorationPriority, goalPriorities: ExplorationPriority[]) {
  const index = goalPriorities.indexOf(priority);
  return index === -1 ? 0 : (goalPriorities.length - index) * 4;
}

function hasMeaningfulSelector(element: InteractiveElement) {
  return Boolean(element.selectorHint || element.label || element.placeholder || element.href);
}

function isSearchField(element: InteractiveElement) {
  const text = [element.label, element.placeholder, element.selectorHint, element.inputType].filter(Boolean).join(' ');
  return element.visible !== false && ['input', 'textarea'].includes(element.kind) && /search|query|keyword|find/i.test(text);
}

function isFormInput(element: InteractiveElement) {
  const type = element.inputType || '';
  return (
    element.visible !== false &&
    ['input', 'textarea', 'select', 'checkbox', 'radio'].includes(element.kind) &&
    !['hidden', 'submit', 'button', 'reset', 'file'].includes(type)
  );
}

function isPrimaryButton(element: InteractiveElement) {
  const label = labelOf(element);
  return (
    element.visible !== false &&
    element.kind === 'button' &&
    /search|submit|continue|next|apply|save|sign in|log in|start|open/i.test(label)
  );
}

function isFilterControl(element: InteractiveElement) {
  const label = labelOf(element);
  return /filter|sort|category|price|size|colour|color|apply|refine/i.test(label);
}

function isNavigationControl(element: InteractiveElement) {
  const label = labelOf(element);
  return /menu|nav|home|products|dashboard|browse|all|back|next/i.test(label);
}

function isImportantFlowLink(element: InteractiveElement) {
  const label = labelOf(element);
  return /sign in|log in|register|create account|cart|basket|orders|profile|help|support/i.test(label);
}

function isAuthFlowLink(element: InteractiveElement) {
  const label = labelOf(element);
  return /sign in|log in|register|create account|sign up|trial|pricing|paywall/i.test(label);
}

function isAdminFlowLink(element: InteractiveElement) {
  const label = labelOf(element);
  return /admin|manage|users|roles|permissions|audit|configuration/i.test(label);
}

function isSettingsControl(element: InteractiveElement) {
  return /settings|preferences|language|account/i.test(labelOf(element));
}

function isAccessibilityControl(element: InteractiveElement) {
  return /accessibility|contrast|theme|font size|language|keyboard|skip/i.test(labelOf(element));
}

function safeInputValue(element: InteractiveElement, priority: ExplorationPriority) {
  if (priority === 'search') {
    return 'test';
  }

  const type = element.inputType || '';
  if (type === 'email') {
    return 'test@example.com';
  }
  if (type === 'tel') {
    return '07123456789';
  }
  if (type === 'number') {
    return '1';
  }
  if (type === 'password') {
    return 'Password123!';
  }
  return 'test';
}

function navigationAction(element: InteractiveElement): AgentAction {
  if (element.href) {
    return {
      kind: 'navigate',
      url: element.href,
      target: labelOf(element),
      reason: `Follow link "${labelOf(element)}".`,
    };
  }

  return {
    kind: 'click',
    selector: targetOf(element),
    target: labelOf(element),
    reason: `Open navigation control "${labelOf(element)}".`,
  };
}

function candidateFromElement(
  element: InteractiveElement,
  priority: ExplorationPriority,
  baseScore: number,
  rationale: string,
  expectedOutcome: string,
  validationIdea: string,
  action?: AgentAction,
): Candidate | undefined {
  if (element.disabled || element.visible === false || !hasMeaningfulSelector(element)) {
    return undefined;
  }

  return {
    element,
    priority,
    score: PRIORITY_WEIGHT[priority] + baseScore,
    riskLevel: priority === 'settings' || priority === 'authentication' ? 'medium' : 'low',
    action:
      action ||
      {
        kind: 'click',
        selector: targetOf(element),
        target: labelOf(element),
        reason: rationale,
      },
    rationale,
    expectedOutcome,
    validationIdea,
  };
}

function searchCandidates(observation: Observation): Candidate[] {
  return observation.inputs
    .filter(isSearchField)
    .map((element) =>
      candidateFromElement(
        element,
        'search',
        20,
        `Search field "${labelOf(element)}" is the highest-priority safe exploration target.`,
        'Search input accepts a query and prepares a result-producing action.',
        'Verify the field value changes and that submitting search changes results, URL, or visible result state.',
        {
          kind: 'search',
          selector: targetOf(element),
          target: labelOf(element),
          value: safeInputValue(element, 'search'),
          reason: `Enter and submit a safe search query in "${labelOf(element)}".`,
        },
      ),
    )
    .filter(Boolean) as Candidate[];
}

function formCandidates(observation: Observation): Candidate[] {
  const formFieldCandidates = observation.forms.flatMap((form) =>
    (form.fields || [])
      .filter(isFormInput)
      .map((field) =>
        candidateFromElement(
          field,
          'forms',
          field.required ? 15 : 5,
          `Form field "${labelOf(field)}" can be safely populated to explore validation and submission flow.`,
          'The form field accepts safe test data without submitting irreversible changes.',
          'Verify the field value changes and no client error is raised while typing.',
          {
            kind: field.kind === 'select' ? 'click' : 'fill',
            selector: targetOf(field),
            target: labelOf(field),
            value: field.kind === 'select' ? undefined : safeInputValue(field, 'forms'),
            reason: `Populate form field "${labelOf(field)}" with safe test data.`,
          },
        ),
      ),
  );

  if (formFieldCandidates.length) {
    return formFieldCandidates.filter(Boolean) as Candidate[];
  }

  return observation.inputs
    .filter(isFormInput)
    .map((element) =>
      candidateFromElement(
        element,
        'forms',
        element.required ? 12 : 3,
        `Input "${labelOf(element)}" can be explored as a form field.`,
        'The input accepts safe test data.',
        'Verify the input value changes and validation state remains understandable.',
        {
          kind: element.kind === 'select' ? 'click' : 'fill',
          selector: targetOf(element),
          target: labelOf(element),
          value: element.kind === 'select' ? undefined : safeInputValue(element, 'forms'),
          reason: `Populate input "${labelOf(element)}" with safe test data.`,
        },
      ),
    )
    .filter(Boolean) as Candidate[];
}

function buttonCandidates(observation: Observation): Candidate[] {
  return observation.buttons
    .filter(isPrimaryButton)
    .map((element) =>
      candidateFromElement(
        element,
        /sign in|log in/i.test(labelOf(element)) ? 'authentication' : 'navigation',
        10,
        `Primary button "${labelOf(element)}" is likely to advance an important user flow.`,
        'Clicking the button changes page state, opens a flow, or shows validation feedback.',
        'Verify URL, visible text, focused dialog, or validation messages change meaningfully.',
      ),
    )
    .filter(Boolean) as Candidate[];
}

function filterCandidates(observation: Observation): Candidate[] {
  return [...observation.buttons, ...observation.links, ...observation.inputs]
    .filter(isFilterControl)
    .map((element) =>
      candidateFromElement(
        element,
        'filters',
        8,
        `Filter control "${labelOf(element)}" can narrow or alter displayed data.`,
        'The page updates filtered content or exposes more filter options.',
        'Verify result count, selected filter state, URL, or visible content changes.',
        element.href ? navigationAction(element) : undefined,
      ),
    )
    .filter(Boolean) as Candidate[];
}

function navigationCandidates(observation: Observation): Candidate[] {
  return [...observation.buttons, ...observation.links]
    .filter((element) => isNavigationControl(element) || isImportantFlowLink(element))
    .map((element) =>
      candidateFromElement(
        element,
        isImportantFlowLink(element) && /sign in|log in|register/i.test(labelOf(element))
          ? 'authentication'
          : 'navigation',
        isImportantFlowLink(element) ? 9 : 3,
        `Navigation target "${labelOf(element)}" appears to lead to an important flow.`,
        'The action navigates or reveals a user-relevant area without performing destructive work.',
        'Verify the URL, page title, active menu, or visible heading reflects the selected flow.',
        navigationAction(element),
      ),
    )
    .filter(Boolean) as Candidate[];
}

function settingsCandidates(observation: Observation): Candidate[] {
  return [...observation.buttons, ...observation.links]
    .filter(isSettingsControl)
    .map((element) =>
      candidateFromElement(
        element,
        'settings',
        2,
        `Settings-related control "${labelOf(element)}" may expose configuration flow.`,
        'The control opens settings or preferences without applying a change.',
        'Verify settings page/modal opens, then stop before making account changes.',
        navigationAction(element),
      ),
    )
    .filter(Boolean) as Candidate[];
}

function personaFlowCandidates(observation: Observation, context: PlannerContext): Candidate[] {
  const personaId = context.session.explorationContext?.personaId;

  if (personaId === 'anonymous-visitor' || personaId === 'first-time-user') {
    return [...observation.links, ...observation.buttons]
      .filter(isAuthFlowLink)
      .map((element) =>
        candidateFromElement(
          element,
          'authentication',
          35,
          `Authentication or signup flow "${labelOf(element)}" matches the ${personaId} persona.`,
          'The visitor can reach signup, login, or paywall entry points.',
          'Verify the auth entry point is reachable and exposes the expected guest experience.',
          element.href ? navigationAction(element) : undefined,
        ),
      )
      .filter(Boolean) as Candidate[];
  }

  if (personaId === 'admin') {
    return [...observation.links, ...observation.buttons]
      .filter((element) => isSettingsControl(element) || isAdminFlowLink(element))
      .map((element) =>
        candidateFromElement(
          element,
          'settings',
          40,
          `Admin-oriented control "${labelOf(element)}" matches the admin persona.`,
          'Administrative settings or management pages become reachable.',
          'Verify privileged navigation is available to the admin persona.',
          element.href ? navigationAction(element) : undefined,
        ),
      )
      .filter(Boolean) as Candidate[];
  }

  if (personaId === 'readonly-user') {
    return observation.links
      .filter(isImportantFlowLink)
      .filter((element) => !/edit|save|delete|update|submit|create/i.test(labelOf(element)))
      .map((element) =>
        candidateFromElement(
          element,
          'navigation',
          15,
          `Read-only safe navigation "${labelOf(element)}" avoids mutation flows.`,
          'The readonly persona explores view-only paths.',
          'Confirm no edit or submit controls are required to proceed.',
          element.href ? navigationAction(element) : undefined,
        ),
      )
      .filter(Boolean) as Candidate[];
  }

  return [];
}

function accessibilityCandidates(observation: Observation): Candidate[] {
  return [...observation.buttons, ...observation.links, ...observation.inputs]
    .filter(isAccessibilityControl)
    .map((element) =>
      candidateFromElement(
        element,
        'accessibility',
        1,
        `Accessibility control "${labelOf(element)}" can validate inclusive navigation paths.`,
        'The control exposes accessibility, theme, language, or keyboard-related behavior.',
        'Verify the control is keyboard reachable and changes the expected accessible state.',
        element.href ? navigationAction(element) : undefined,
      ),
    )
    .filter(Boolean) as Candidate[];
}

function allCandidates(observation: Observation, context: PlannerContext) {
  return [
    ...personaFlowCandidates(observation, context),
    ...searchCandidates(observation),
    ...formCandidates(observation),
    ...buttonCandidates(observation),
    ...filterCandidates(observation),
    ...navigationCandidates(observation),
    ...settingsCandidates(observation),
    ...accessibilityCandidates(observation),
  ];
}

function isRepeated(candidate: Candidate, context: PlannerContext) {
  if (isDuplicateAction(context.session, candidate.action, { url: context.observation.url })) {
    return true;
  }

  const signature = actionSignature(candidate.action);
  const candidateTargets = new Set(actionTargets(candidate.action));

  for (const action of context.session.memory.actionHistory) {
    if (actionSignature(action) === signature) {
      return true;
    }

    if (actionTargets(action).some((target) => candidateTargets.has(target))) {
      return true;
    }
  }

  return false;
}

function scoreCandidate(candidate: Candidate, context: PlannerContext) {
  const goalBoost = goalPriorityBoost(candidate.priority, context.session.goal.priorities);
  const previousUrlBoost = context.session.memory.visitedUrls.includes(context.observation.url) ? -2 : 0;
  const memoryBoost = adaptivePriorityBoost({
    session: context.session,
    observationUrl: context.observation.url,
    priority: candidate.priority,
    element: candidate.element,
    action: candidate.action,
  });
  const personaBoost = personaPriorityBoost(
    context.session.explorationContext?.persona,
    textOfCandidate(candidate),
    candidate.priority,
  );
  const environmentBoost =
    context.session.explorationContext?.environment.riskTier === 'high' &&
    ['create-edit-delete', 'settings'].includes(candidate.priority)
      ? -20
      : 0;
  const reasoningBoost = context.session.reasoningState?.enabled
    ? strategyPriorityBoost(context.session.reasoningState.currentStrategy, candidate.priority)
    : 0;
  const vision = context.session.memory.observations.at(-1)?.visionSignals?.understanding;
  const visionBoost =
    vision && (vision.weakDomStructure || vision.hasShadowDomHints || vision.hasCanvasRendering)
      ? candidate.element?.selectorHint
        ? 8
        : 18
      : 0;
  const learningBoost = memoryPriorityBoost({
    session: context.session,
    observationUrl: context.observation.url,
    priority: candidate.priority,
    element: candidate.element,
    action: candidate.action,
    learning: context.session.learningContext,
  });
  return (
    candidate.score +
    goalBoost +
    previousUrlBoost +
    memoryBoost +
    personaBoost +
    environmentBoost +
    reasoningBoost +
    visionBoost +
    learningBoost
  );
}

function safeCandidate(candidate: Candidate, context: PlannerContext) {
  if (!context.session.config.allowedActions.includes(candidate.action.kind)) {
    return false;
  }

  if (isRepeated(candidate, context)) {
    return false;
  }

  if (isExternalUrlBlocked(candidate.action.url || candidate.element?.href, context.session.config)) {
    return false;
  }

  const text = textOfCandidate(candidate);
  const policy = evaluateActionPolicy({
    session: context.session,
    action: candidate.action,
    candidateText: text,
    destructiveAllowed: context.session.goal.destructiveActionsAllowed === true,
  });
  if (!policy.allowed) {
    return false;
  }

  if (isForbiddenText(text, context.session.config) && !context.session.goal.destructiveActionsAllowed) {
    return false;
  }

  return true;
}

export class RiskBasedPlanner implements ExplorationPlanner {
  async planNextAction(context: PlannerContext): Promise<ActionPlan> {
    const { session, observation, findings } = context;
    const nextIndex = session.steps.length;
    const targetUrl = session.goal.targetUrl
      ? new URL(session.goal.targetUrl, session.config.baseUrl).toString()
      : session.config.baseUrl;

    const hasCriticalFinding = findings.some((finding) => finding.severity === 'critical');
    if (hasCriticalFinding && session.config.stopConditions.includes('criticalFinding')) {
      return {
        id: planId(nextIndex),
        priority: 'console-network',
        riskLevel: 'low',
        action: {
          kind: 'stop',
          reason: 'Critical finding encountered.',
        },
        rationale: 'Stop before compounding a critical defect.',
        expectedOutcome: 'Exploration session stops and reports current findings.',
        validationIdea: 'Confirm the report contains the critical finding and no further risky action was attempted.',
        stopAfterAction: true,
      };
    }

    if (!observation.url || observation.url === 'about:blank') {
      return {
        id: planId(nextIndex),
        priority: session.goal.priorities[0] || 'navigation',
        riskLevel: 'low',
        action: {
          kind: 'navigate',
          url: targetUrl,
          reason: 'Start exploration at the configured target URL.',
        },
        rationale: 'The current session has not loaded an application page yet.',
        expectedOutcome: `The browser navigates to ${targetUrl}.`,
        validationIdea: 'Verify URL is no longer about:blank and the page title or visible text is captured.',
      };
    }

    const candidates = allCandidates(observation, context)
      .filter((candidate) => safeCandidate(candidate, context))
      .map((candidate) => ({
        ...candidate,
        score: scoreCandidate(candidate, context),
      }))
      .sort((a, b) => b.score - a.score);

    const selected = candidates[0];
    if (selected) {
      const action = applyReliableSelectorHints(selected.action, session.learningContext);
      return {
        id: planId(nextIndex),
        action,
        rationale: selected.rationale,
        expectedOutcome: selected.expectedOutcome,
        validationIdea: selected.validationIdea,
        riskLevel: selected.riskLevel,
        priority: selected.priority,
      };
    }

    session.memory.stopReason = 'No meaningful exploratory actions remain.';
    return {
      id: planId(nextIndex),
      priority: session.goal.priorities[0] || 'navigation',
      riskLevel: 'low',
      action: {
        kind: 'stop',
        reason: 'No safe, non-repeated exploratory action is available.',
      },
      rationale: 'All candidate actions were unsafe, external, repeated, unsupported, or unavailable.',
      expectedOutcome: 'Exploration stops and reports current coverage gaps.',
      validationIdea: 'Confirm report includes pending areas and the stop reason.',
      stopAfterAction: true,
    };
  }
}

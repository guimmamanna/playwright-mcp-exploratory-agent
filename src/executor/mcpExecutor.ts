import type {
  AgentAction,
  ActionPlan,
  ActionResult,
  ExecutionError,
  ExplorationExecutor,
  ExplorationSession,
  LocatorStrategy,
  Observation,
} from '../types';

export interface PlaywrightMcpToolClient {
  observe(session: ExplorationSession): Promise<Observation>;
  navigate(url: string): Promise<void>;
  click(target: string): Promise<void>;
  fill(target: string, value: string): Promise<void>;
  select(target: string, value: string): Promise<void>;
  search?(target: string, value: string): Promise<void>;
  check?(target: string): Promise<void>;
  uncheck?(target: string): Promise<void>;
  press(key: string): Promise<void>;
  goBack?(): Promise<void>;
  wait(timeoutMs: number): Promise<void>;
  waitForLoadState?(state: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void>;
  screenshot(session: ExplorationSession): Promise<string | undefined>;
}

function now() {
  return new Date().toISOString();
}

export class PlaywrightMcpExecutor implements ExplorationExecutor {
  constructor(private readonly client: PlaywrightMcpToolClient) {}

  observe(session: ExplorationSession): Promise<Observation> {
    return this.client.observe(session);
  }

  async execute(plan: ActionPlan, session: ExplorationSession): Promise<ActionResult> {
    const action = plan.action;
    const startedAt = now();
    const locatorStrategy = inferMcpLocatorStrategy(action);

    try {
      let evidencePath: string | undefined;

      switch (action.kind) {
        case 'navigate':
          if (!action.url) {
            throw new Error('Navigate action requires url.');
          }
          await this.client.navigate(action.url);
          break;
        case 'click':
          await this.client.click(action.selector || action.target || '');
          break;
        case 'fill':
          await this.client.fill(action.selector || action.target || '', action.value || '');
          break;
        case 'search':
          if (this.client.search) {
            await this.client.search(action.selector || action.target || '', action.value || '');
          } else {
            await this.client.fill(action.selector || action.target || '', action.value || '');
            await this.client.press('Enter');
          }
          break;
        case 'select':
          await this.client.select(action.selector || action.target || '', action.value || '');
          break;
        case 'check':
          if (this.client.check) {
            await this.client.check(action.selector || action.target || '');
          } else {
            await this.client.click(action.selector || action.target || '');
          }
          break;
        case 'uncheck':
          if (this.client.uncheck) {
            await this.client.uncheck(action.selector || action.target || '');
          } else {
            await this.client.click(action.selector || action.target || '');
          }
          break;
        case 'press':
          await this.client.press(action.key || action.value || '');
          break;
        case 'goBack':
          if (!this.client.goBack) {
            throw new Error('MCP client does not support goBack.');
          }
          await this.client.goBack();
          break;
        case 'wait':
          await this.client.wait(action.timeoutMs || 1000);
          break;
        case 'waitForLoadState':
          if (this.client.waitForLoadState) {
            await this.client.waitForLoadState(action.loadState || 'domcontentloaded');
          } else {
            await this.client.wait(action.timeoutMs || 1000);
          }
          break;
        case 'screenshot':
          evidencePath = await this.client.screenshot(session);
          break;
        case 'noop':
        case 'stop':
          break;
        default:
          throw new Error(`Unsupported action kind: ${action.kind}`);
      }

      return {
        status: action.kind === 'stop' ? 'skipped' : 'success',
        startedAt,
        endedAt: now(),
        action,
        locatorStrategy,
        locatorStrategiesTried: locatorStrategy ? [locatorStrategy] : [],
        message: action.reason,
        actualOutcome: action.kind === 'stop' ? 'No browser action executed.' : `${action.kind} executed by MCP client.`,
        evidencePath,
      };
    } catch (error) {
      const executionError: ExecutionError = {
        code: 'execution-failed',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        locatorStrategiesTried: locatorStrategy ? [locatorStrategy] : [],
      };

      return {
        status: 'failed',
        startedAt,
        endedAt: now(),
        action,
        locatorStrategy,
        locatorStrategiesTried: locatorStrategy ? [locatorStrategy] : [],
        message: executionError.message,
        actualOutcome: 'MCP action failed.',
        errors: [executionError],
      };
    }
  }
}

function inferMcpLocatorStrategy(action: AgentAction): LocatorStrategy | undefined {
  if (action.url) {
    return { type: 'url', value: action.url };
  }
  if (action.role) {
    return { type: 'role', role: action.role, value: action.target || action.label };
  }
  if (action.label) {
    return { type: 'label', value: action.label };
  }
  if (action.placeholder) {
    return { type: 'placeholder', value: action.placeholder };
  }
  if (action.text) {
    return { type: 'text', value: action.text };
  }
  if (action.testId) {
    return { type: 'testId', value: action.testId };
  }
  if (action.selector) {
    return { type: 'css', value: action.selector };
  }
  if (action.key) {
    return { type: 'keyboard', value: action.key };
  }
  return undefined;
}

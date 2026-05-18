import type { ExplorationSession, GeneratedTest } from '../types';
import { createAgentMessage } from '../multi-agent/protocol';
import { recordGeneratedTestOnBlackboard } from '../multi-agent/blackboard';
import type { AgentMessage, BlackboardMemory, CoordinatorContext, MultiAgentFocus, SpecialistAgent } from '../multi-agent/types';

export interface TestGeneratorAgentOptions {
  generate?: (session: ExplorationSession) => GeneratedTest[] | Promise<GeneratedTest[]>;
}

export class TestGeneratorAgent implements SpecialistAgent {
  readonly name = 'TestGeneratorAgent' as const;

  constructor(private readonly options: TestGeneratorAgentOptions = {}) {}

  supportsFocus(focus: MultiAgentFocus): boolean {
    return focus === 'full';
  }

  analyze(context: CoordinatorContext, blackboard: BlackboardMemory): AgentMessage[] {
    const successfulFlows = Object.entries(blackboard.flowStatuses).filter(([, status]) => status === 'passed');
    if (!successfulFlows.length) {
      return [
        createAgentMessage({
          agentName: this.name,
          currentTask: 'Convert verified flows into Playwright tests',
          observation: 'No verified flows ready for test generation yet',
          confidence: 'low',
          recommendation: 'Complete a validated user flow before generating tests.',
          nextSuggestedAction: 'Wait for ExplorerAgent to mark a flow as passed.',
        }),
      ];
    }

    return [
      createAgentMessage({
        agentName: this.name,
        currentTask: 'Convert verified flows into Playwright tests',
        observation: `${successfulFlows.length} flow(s) candidate for test generation`,
        confidence: 'medium',
        recommendation: 'Generate Playwright tests from successful step sequences at session end.',
        nextSuggestedAction: 'Run finalize() to emit generated tests.',
      }),
    ];
  }

  async finalizeFromSession(
    session: ExplorationSession,
    blackboard: BlackboardMemory,
  ): Promise<{ messages: AgentMessage[]; tests: GeneratedTest[] }> {
    if (!this.options.generate) {
      return { messages: [], tests: [] };
    }

    const tests = await this.options.generate(session);
    const messages: AgentMessage[] = [];

    for (const test of tests) {
      recordGeneratedTestOnBlackboard(blackboard, test);
      messages.push(
        createAgentMessage({
          agentName: this.name,
          currentTask: 'Convert verified flows into Playwright tests',
          observation: `Generated test: ${test.title}`,
          confidence: test.confidenceScore,
          recommendation: `Run generated test at ${test.filePath}`,
          nextSuggestedAction: test.status === 'passed' ? 'Promote test to CI suite.' : 'Review failure output and heal selectors.',
        }),
      );
    }

    return { messages, tests };
  }
}

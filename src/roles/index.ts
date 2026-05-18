export { ExplorerAgent } from './explorerAgent';
export { AccessibilityAgent } from './accessibilityAgent';
export { NetworkAgent } from './networkAgent';
export { VisualAgent } from './visualAgent';
export { SecuritySmokeAgent } from './securitySmokeAgent';
export { TestGeneratorAgent, type TestGeneratorAgentOptions } from './testGeneratorAgent';
export { ReportAgent } from './reportAgent';

import { ExplorerAgent } from './explorerAgent';
import { AccessibilityAgent } from './accessibilityAgent';
import { NetworkAgent } from './networkAgent';
import { VisualAgent } from './visualAgent';
import { SecuritySmokeAgent } from './securitySmokeAgent';
import { TestGeneratorAgent, type TestGeneratorAgentOptions } from './testGeneratorAgent';
import { ReportAgent } from './reportAgent';
import type { SpecialistAgent } from '../multi-agent/types';

export function createDefaultSpecialistAgents(options?: TestGeneratorAgentOptions): SpecialistAgent[] {
  return [
    new ExplorerAgent(),
    new AccessibilityAgent(),
    new NetworkAgent(),
    new VisualAgent(),
    new SecuritySmokeAgent(),
    new TestGeneratorAgent(options),
    new ReportAgent(),
  ];
}

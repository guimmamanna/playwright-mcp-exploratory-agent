# Architecture

## Core components (`src/`)

| Module | Responsibility |
| --- | --- |
| `orchestrator/` | Session lifecycle, step loop, stop conditions |
| `planner/` | Risk-based and reasoning-augmented action planning |
| `multi-agent/` | Blackboard, scheduling, conflict resolution |
| `roles/` | Specialist agents (explorer, accessibility, network, visual, security) |
| `executor/` | Playwright MCP and direct Playwright execution |
| `observer/` | DOM, console, network observation capture |
| `memory/` | Session memory, coverage, duplicate detection |
| `reporting/` | Markdown session reports and per-finding bug files |
| `test-generator/` | Maps interactions to Playwright test drafts |
| `reasoning/` | Hypothesis management and LLM-backed replanning |
| `recovery/` | Blocked-flow detection and recovery strategies |
| `long-term-memory/` | Cross-session learning storage |

## Data flow

1. A goal (`ExplorationGoal`) and config (`ExplorationConfig`) define scope and safety boundaries.
2. The orchestrator plans actions, executes them in the browser, and records observations.
3. Specialist agents analyze observations and emit normalized `Finding` objects.
4. Reporters write markdown artifacts under the configured output directory.
5. The dashboard indexes `session-memory.json`, session reports, and bug markdown files.

## Safety model

- **Allowed domains** restrict navigation targets.
- **Forbidden actions** block checkout, payments, deletes, and similar flows.
- **Personas** influence action policy (e.g. anonymous visitor vs admin).
- **Environment rules** add production-like caution for live targets.

## Extension points

- Add a specialist agent in `src/roles/` and register it in `src/roles/index.ts`.
- Add heuristics in `src/heuristics/`.
- Plug LLM providers in `src/llm/`.
- Customize goals in `src/config/` or pass runtime config via `EXPLORATION_RUN_CONFIG`.

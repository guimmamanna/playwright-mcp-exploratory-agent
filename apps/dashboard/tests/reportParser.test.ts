import { describe, expect, it } from 'vitest';
import { filterFindings, parseBugReportMarkdown, parseSessionReport } from '../src/lib/parsers/reportParser';

const sampleReport = `# Exploratory Session Report

## Summary

- Session: test-session-1
- Goal: Homepage smoke
- Status: completed
- Started: 2026-05-17T00:00:00.000Z
- Environment: local
- Persona: anonymous-visitor

## Findings Summary

| Severity | Category | Type | Title | URL | Bug Report | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Medium | functional | console-error | Console error on homepage | http://localhost:3000/ |  |  |

## Generated Tests

| Title | Flow Category | Status | Confidence | File | Last Execution | Failure Reason |
| --- | --- | --- | --- | --- | --- | --- |
| Login flow | successful-flow | passed | high | /tmp/test.spec.ts | passed |  |

## Executed Steps

1. navigate - Start - success - validated

## Coverage Summary

- Pages visited: 2 (2 unique)
- Interactive elements explored: 1 / 5 (20%)
- Explored areas: navigation
- Unexplored areas: settings
`;

describe('reportParser', () => {
  it('parses session report markdown', () => {
    const session = parseSessionReport(sampleReport, '/tmp/report.md');
    expect(session.id).toBe('test-session-1');
    expect(session.findings).toHaveLength(1);
    expect(session.generatedTests).toHaveLength(1);
    expect(session.steps).toHaveLength(1);
  });

  it('parses bug report markdown', () => {
    const bug = parseBugReportMarkdown(`# Bug title\n\n| Field | Value |\n| Severity | High |\n| Category | functional |\n\n## Summary\n\nBroken.\n\n## Steps To Reproduce\n\n1. Open page\n`, '/bugs/b.md');
    expect(bug.title).toBe('Bug title');
    expect(bug.severity).toBe('high');
    expect(bug.reproductionSteps).toEqual(['Open page']);
  });

  it('filters findings', () => {
    const findings = [
      { title: 'A', severity: 'high', category: 'functional', status: 'new' },
      { title: 'B', severity: 'low', category: 'visual', status: 'new' },
    ];
    expect(filterFindings(findings, { severity: 'high' })).toHaveLength(1);
    expect(filterFindings(findings, { search: 'B' })).toHaveLength(1);
  });
});

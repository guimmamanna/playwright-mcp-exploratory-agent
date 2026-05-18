import type { DashboardFinding, DashboardGeneratedTest, DashboardSession, DashboardStep, FindingSeverity } from '../types';

function parseTableRows(markdown: string, sectionTitle: string) {
  const section = markdown.split(`## ${sectionTitle}`)[1]?.split(/^## /m)[0] || '';
  const lines = section.split('\n').filter((line) => line.startsWith('|') && !line.includes('---'));
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => line.split('|').map((cell) => cell.trim()).filter(Boolean));
}

function parseSummaryField(markdown: string, label: string) {
  const match = markdown.match(new RegExp(`- ${label}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim();
}

function normalizeSeverity(value: string): FindingSeverity {
  const lower = value.toLowerCase();
  if (lower.includes('critical')) return 'critical';
  if (lower.includes('high')) return 'high';
  if (lower.includes('low')) return 'low';
  return 'medium';
}

export function parseSessionReport(markdown: string, filePath: string): Partial<DashboardSession> {
  const sessionId = parseSummaryField(markdown, 'Session') || filePath;
  const goalName = parseSummaryField(markdown, 'Goal');
  const status = (parseSummaryField(markdown, 'Status') || 'completed').toLowerCase() as DashboardSession['status'];
  const startedAt = parseSummaryField(markdown, 'Started') || new Date().toISOString();
  const endedAt = parseSummaryField(markdown, 'Ended') || undefined;
  const environment = parseSummaryField(markdown, 'Environment');
  const persona = parseSummaryField(markdown, 'Persona');

  const findingRows = parseTableRows(markdown, 'Findings Summary');
  const findings: DashboardFinding[] = findingRows
    .filter((row) => row[3] && row[3] !== 'No findings recorded')
    .map((row, index) => ({
      id: `${sessionId}-finding-${index}`,
      sessionId,
      severity: normalizeSeverity(row[0] || 'medium'),
      category: row[1] || 'functional',
      type: row[2] || 'unknown',
      title: row[3] || 'Untitled finding',
      url: row[4] || undefined,
      status: 'new' as const,
      environment,
      persona,
      bugReportPath: row[5]?.includes('bug report') ? row[5].match(/\(([^)]+)\)/)?.[1] : undefined,
    }));

  const testRows = parseTableRows(markdown, 'Generated Tests');
  const generatedTests: DashboardGeneratedTest[] = testRows
    .filter((row) => row[0] && !row[0].includes('No generated'))
    .map((row, index) => ({
      id: `${sessionId}-test-${index}`,
      sessionId,
      title: row[0] || 'Generated test',
      flowCategory: row[1] || 'successful-flow',
      status: (row[2]?.toLowerCase().includes('fail') ? 'failed' : row[2]?.toLowerCase().includes('pass') ? 'passed' : 'draft') as DashboardGeneratedTest['status'],
      confidence: (row[3]?.toLowerCase() as DashboardGeneratedTest['confidence']) || 'medium',
      filePath: row[4] || '',
    }));

  const executedLines = markdown
    .split('## Executed Steps')[1]
    ?.split('## Step Observations')[0]
    ?.split('\n')
    .filter((line) => /^\d+\./.test(line.trim())) || [];

  const steps: DashboardStep[] = executedLines.map((line, index) => {
    const match = line.match(/^\d+\.\s+(\w+)\s+-\s+(.+?)\s+-\s+(\w+)/);
    return {
      id: `step-${index + 1}`,
      index,
      actionKind: match?.[1] || 'unknown',
      rationale: match?.[2] || line,
      status: match?.[3] || 'unknown',
    };
  });

  const exploredMatch = markdown.match(/- Explored areas:\s*(.+)$/m);
  const unexploredMatch = markdown.match(/- Unexplored areas:\s*(.+)$/m);
  const pagesVisitedMatch = markdown.match(/- Pages visited:\s*(\d+)/);
  const explorationMatch = markdown.match(/Interactive elements explored:\s*(\d+)\s*\/\s*(\d+)\s*\((\d+)%\)/);

  return {
    id: sessionId,
    goalId: goalName || sessionId,
    goalName,
    status,
    startedAt,
    endedAt,
    environment,
    persona,
    findingsCount: findings.length,
    generatedTestsCount: generatedTests.length,
    reportPath: filePath,
    findings,
    generatedTests,
    steps,
    coverage: {
      pagesVisited: Number(pagesVisitedMatch?.[1] || 0),
      uniquePagesVisited: Number(pagesVisitedMatch?.[1] || 0),
      interactiveElementsExplored: Number(explorationMatch?.[1] || 0),
      interactiveElementsSeen: Number(explorationMatch?.[2] || 0),
      explorationPercentage: Number(explorationMatch?.[3] || 0),
      formsTested: 0,
      formsEncountered: 0,
      exploredAreas: exploredMatch?.[1]?.split(',').map((item) => item.trim()).filter((item) => item && item !== 'none') || [],
      unexploredAreas: unexploredMatch?.[1]?.split(',').map((item) => item.trim()).filter((item) => item && item !== 'none') || [],
      visitedUrls: [],
      byBrowser: {},
      byPersona: persona ? { [persona]: 1 } : {},
      byViewport: {},
    },
  };
}

export function parseBugReportMarkdown(markdown: string, filePath: string) {
  const title = markdown.match(/^# (.+)$/m)?.[1] || 'Bug report';
  const severity = normalizeSeverity(markdown.match(/\| Severity \| (.+) \|/)?.[1] || 'medium');
  const category = markdown.match(/\| Category \| (.+) \|/)?.[1] || 'functional';
  const environment = markdown.match(/\| Environment \| (.+) \|/)?.[1];
  const url = markdown.match(/\| URL \| (.+) \|/)?.[1];
  const summary = markdown.split('## Summary')[1]?.split('##')[0]?.trim() || '';
  const reproductionSteps =
    markdown
      .split('## Steps To Reproduce')[1]
      ?.split('##')[0]
      ?.split('\n')
      .filter((line) => /^\d+\./.test(line.trim()))
      .map((line) => line.replace(/^\d+\.\s*/, '')) || [];
  const expectedResult = markdown.split('## Expected Result')[1]?.split('##')[0]?.trim();
  const actualResult = markdown.split('## Actual Result')[1]?.split('##')[0]?.trim();

  return {
    id: filePath,
    title,
    severity,
    category,
    environment,
    url,
    summary,
    reproductionSteps,
    expectedResult,
    actualResult,
    markdown,
    filePath,
  };
}

export function filterFindings<T extends { title: string; severity: string; category: string; environment?: string; persona?: string; status?: string }>(
  findings: T[],
  filters: {
    severity?: string;
    category?: string;
    environment?: string;
    persona?: string;
    search?: string;
    status?: string;
  },
) {
  return findings.filter((finding) => {
    if (filters.severity && filters.severity !== 'all' && finding.severity !== filters.severity) return false;
    if (filters.category && filters.category !== 'all' && finding.category.toLowerCase() !== filters.category.toLowerCase()) return false;
    if (filters.environment && filters.environment !== 'all' && finding.environment !== filters.environment) return false;
    if (filters.persona && filters.persona !== 'all' && finding.persona !== filters.persona) return false;
    if (filters.status && filters.status !== 'all' && finding.status !== filters.status) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!finding.title.toLowerCase().includes(q) && !finding.category.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

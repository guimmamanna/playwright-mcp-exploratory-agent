import { expect, test } from '@playwright/test';
import { classifyFindingCategory, scoreFindingSeverity } from '../../src/reporting/severityScoring';

test('scores payment and checkout corruption as critical', () => {
  const severity = scoreFindingSeverity({
    type: 'flow-failure',
    category: 'functional',
    title: 'Checkout total corruption',
    description: 'Checkout shows the wrong total after cart update and can corrupt payment state.',
  });

  expect(severity).toBe('critical');
});

test('scores authentication flow failures as high severity', () => {
  const severity = scoreFindingSeverity({
    type: 'flow-failure',
    category: 'functional',
    title: 'Authentication failure',
    description: 'Users cannot sign in after submitting valid credentials.',
  });

  expect(severity).toBe('high');
});

test('scores non-blocking failed requests as medium severity', () => {
  const severity = scoreFindingSeverity({
    type: 'network-failure',
    category: 'network-error',
    title: 'New failed network request after action',
    description: 'GET /analytics returned 404 as a non-blocking failed request.',
  });

  expect(severity).toBe('medium');
});

test('scores cosmetic visual issues as low severity', () => {
  const severity = scoreFindingSeverity({
    type: 'visual-anomaly',
    category: 'visual',
    title: 'Small layout inconsistency',
    description: 'A secondary label is misaligned by a few pixels.',
  });

  expect(severity).toBe('low');
});

test('classifies finding types into report categories', () => {
  expect(classifyFindingCategory({ type: 'console-error', title: 'Console error detected' })).toBe('console-error');
  expect(classifyFindingCategory({ type: 'network-failure', title: 'API 500' })).toBe('network-error');
  expect(classifyFindingCategory({ type: 'accessibility', title: 'Missing label' })).toBe('accessibility');
  expect(classifyFindingCategory({ type: 'visual-anomaly', title: 'Overlapping text' })).toBe('visual');
});

import type { Page } from '@playwright/test';
import type { EnvironmentProfile, LocaleIssue, LocaleSignals } from './types';

export const localeDomScript = ({
  expectedLocale,
  expectedTimezone,
}: {
  expectedLocale: string;
  expectedTimezone: string;
}) => {
  const issues: LocaleIssue[] = [];
  const currencySamples: string[] = [];
  const dateSamples: string[] = [];

  const htmlLang = document.documentElement.lang;
  if (htmlLang && !htmlLang.toLowerCase().startsWith(expectedLocale.split('-')[0].toLowerCase())) {
    issues.push({
      id: `language-mismatch:${htmlLang}`,
      issueType: 'language-mismatch',
      severity: 'medium',
      title: 'Page language does not match expected locale',
      description: `Expected locale prefix "${expectedLocale}" but document lang is "${htmlLang}".`,
      recommendation: 'Align html[lang] with the active environment locale.',
    });
  }

  const text = document.body?.innerText || '';
  const currencyMatches = text.match(/[$€£¥]\s?\d[\d,.]*/g) || [];
  currencySamples.push(...currencyMatches.slice(0, 5));

  const dateMatches = text.match(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g) || [];
  dateSamples.push(...dateMatches.slice(0, 5));

  if (expectedLocale.startsWith('en-GB') && currencySamples.some((sample) => sample.startsWith('$'))) {
    issues.push({
      id: 'currency-format:usd-on-gb',
      issueType: 'currency-format',
      severity: 'low',
      title: 'Currency formatting may not match locale',
      description: 'Detected USD-style currency symbols on an en-GB locale page.',
      recommendation: 'Verify currency formatting uses the configured regional settings.',
    });
  }

  const timezoneHint = document.querySelector('[data-timezone], time[datetime]');
  if (timezoneHint && expectedTimezone && !text.toLowerCase().includes(expectedTimezone.toLowerCase())) {
    issues.push({
      id: 'timezone-hint',
      issueType: 'timezone-hint',
      severity: 'low',
      title: 'Timezone metadata present',
      description: `Page exposes time metadata; expected timezone context is ${expectedTimezone}.`,
      recommendation: 'Validate displayed dates against the environment timezone.',
    });
  }

  return {
    languageTag: htmlLang,
    currencySamples,
    dateSamples,
    issues,
  };
};

export async function validateLocale(page: Page, environment: EnvironmentProfile): Promise<LocaleSignals> {
  const result = await page.evaluate(localeDomScript, {
    expectedLocale: environment.locale,
    expectedTimezone: environment.timezone,
  });
  return {
    locale: environment.locale,
    timezone: environment.timezone,
    languageTag: result.languageTag,
    currencySamples: result.currencySamples,
    dateSamples: result.dateSamples,
    issues: result.issues,
    summary: `locale=${environment.locale}; issues=${result.issues.length}`,
  };
}

import type { Page } from '@playwright/test';

export const ocrDomScript = () => {
  const lines: string[] = [];
  const push = (text: string) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized && !lines.includes(normalized)) {
      lines.push(normalized);
    }
  };

  for (const element of Array.from(document.querySelectorAll('[role="alert"], [role="status"], .error, .alert, .toast'))) {
    push(element.textContent || '');
  }

  for (const element of Array.from(document.querySelectorAll('label, button, a, h1, h2, h3, p, span, input[placeholder]'))) {
    const style = window.getComputedStyle(element);
    const box = element.getBoundingClientRect();
    if (style.visibility === 'hidden' || style.display === 'none' || box.width < 2 || box.height < 2) continue;
    push(element.textContent || '');
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) push(placeholder);
    const aria = element.getAttribute('aria-label');
    if (aria) push(aria);
  }

  return lines.slice(0, 80);
};

export async function extractOcrFromPage(page: Page) {
  const lines = await page.evaluate(ocrDomScript);
  return {
    lines,
    summary: lines.slice(0, 12).join(' | ').slice(0, 600),
  };
}

import type { Locator, Page } from 'playwright';
import { PlaywrightPageObserver } from '../observer/playwrightPageObserver';
import type { ExplorationSession } from '../types';
import type { PlaywrightMcpToolClient } from './mcpExecutor';

function resolveLocator(page: Page, target: string): Locator {
  const trimmed = target.trim();
  if (!trimmed) {
    throw new Error('Target is required for browser action.');
  }

  if (trimmed.startsWith('role=')) {
    const [, role, name] = trimmed.match(/^role=([^:]+)(?::(.+))?$/) || [];
    return name ? page.getByRole(role as Parameters<Page['getByRole']>[0], { name: new RegExp(name, 'i') }) : page.getByRole(role as Parameters<Page['getByRole']>[0]);
  }

  if (trimmed.startsWith('label=')) {
    return page.getByLabel(trimmed.slice(6), { exact: false });
  }

  if (trimmed.startsWith('text=')) {
    return page.getByText(trimmed.slice(5), { exact: false });
  }

  if (trimmed.startsWith('placeholder=')) {
    return page.getByPlaceholder(trimmed.slice(12), { exact: false });
  }

  if (/^(#|\.|\[)/.test(trimmed) || /^[a-z]/i.test(trimmed)) {
    return page.locator(trimmed);
  }

  return page.getByRole('button', { name: new RegExp(escapeRegex(trimmed), 'i') }).or(
    page.getByRole('link', { name: new RegExp(escapeRegex(trimmed), 'i') }),
  );
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class PlaywrightBrowserClient implements PlaywrightMcpToolClient {
  private readonly observer: PlaywrightPageObserver;

  constructor(private readonly page: Page) {
    this.observer = new PlaywrightPageObserver(page, { screenshotMode: 'always' });
    this.observer.attach();
  }

  observe(session: ExplorationSession) {
    return this.observer.observe(session);
  }

  async navigate(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }

  async click(target: string): Promise<void> {
    await resolveLocator(this.page, target).first().click({ timeout: 15000 });
  }

  async fill(target: string, value: string): Promise<void> {
    await resolveLocator(this.page, target).first().fill(value, { timeout: 15000 });
  }

  async select(target: string, value: string): Promise<void> {
    await resolveLocator(this.page, target).first().selectOption(value, { timeout: 15000 });
  }

  async search(target: string, value: string): Promise<void> {
    await this.fill(target, value);
    await this.page.keyboard.press('Enter');
  }

  async press(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  async goBack(): Promise<void> {
    await this.page.goBack({ waitUntil: 'domcontentloaded' });
  }

  async wait(timeoutMs: number): Promise<void> {
    await this.page.waitForTimeout(timeoutMs);
  }

  async waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void> {
    await this.page.waitForLoadState(state);
  }

  async screenshot(session: ExplorationSession): Promise<string | undefined> {
    const observation = await this.observe(session);
    return observation.screenshotPath;
  }
}

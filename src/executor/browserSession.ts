import { mkdir } from 'node:fs/promises';
import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import type { ExplorationConfig } from '../types';

export interface BrowserSessionOptions {
  headless?: boolean;
  timeoutMs?: number;
  browser?: 'chromium' | 'firefox' | 'webkit';
}

export class BrowserSession {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;

  constructor(
    private readonly config: ExplorationConfig,
    private readonly options: BrowserSessionOptions = {},
  ) {}

  async start(initialUrl?: string): Promise<Page> {
    const headless = this.options.headless ?? true;
    const browserType = this.options.browser || 'chromium';

    this.browser =
      browserType === 'firefox'
        ? await firefox.launch({ headless })
        : browserType === 'webkit'
          ? await webkit.launch({ headless })
          : await chromium.launch({ headless });

    await mkdir(this.config.evidenceDirectory, { recursive: true });

    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      locale: this.config.locale,
      timezoneId: this.config.timezone,
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.options.timeoutMs || 30000);

    const target = initialUrl || this.config.baseUrl;
    if (target) {
      await this.page.goto(target, { waitUntil: 'domcontentloaded', timeout: this.options.timeoutMs || 45000 });
      await dismissCommonBanners(this.page);
    }

    return this.page;
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser session not started. Call start() first.');
    }
    return this.page;
  }

  async close(): Promise<void> {
    await this.page?.close().catch(() => undefined);
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.page = undefined;
    this.context = undefined;
    this.browser = undefined;
  }
}

async function dismissCommonBanners(page: Page) {
  const candidates = [
    page.getByRole('button', { name: /accept|agree|ok|got it|continue shopping/i }),
    page.locator('#sp-cc-accept'),
    page.locator('[data-cel-widget="sp-cc"] input[type="submit"]'),
  ];

  for (const locator of candidates) {
    try {
      if (await locator.first().isVisible({ timeout: 2000 })) {
        await locator.first().click({ timeout: 3000 });
        await page.waitForTimeout(500);
        return;
      }
    } catch {
      // try next selector
    }
  }
}

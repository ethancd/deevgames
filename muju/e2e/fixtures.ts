import { test as base, type Browser, type BrowserContext, type BrowserContextOptions } from '@playwright/test';
export * from '@playwright/test';

/** The first-visit tutorial replaces the mode screen until this flag exists.
 * Every spec except `onboarding.spec.ts` starts as a returning player. */
export const ONBOARDING_SEEN = JSON.stringify({ completed: true, at: '2026-10-02T00:00:00.000Z', version: 1 });
export async function seedOnboarding(context: BrowserContext) {
  await context.addInitScript(seen => { try { if (!localStorage.getItem('muju:onboarding:v1')) localStorage.setItem('muju:onboarding:v1', seen); } catch { /* storage-less specs */ } }, ONBOARDING_SEEN);
}
/** For specs that open their own contexts (phones, second players). */
export async function seededContext(browser: Browser, options?: BrowserContextOptions) {
  const context = await browser.newContext(options);
  await seedOnboarding(context);
  return context;
}

export const test = base.extend({
  context: async ({ context }, use) => { await seedOnboarding(context); await use(context); },
});

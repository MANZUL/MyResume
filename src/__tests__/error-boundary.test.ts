import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { de } from '../i18n/messages/de';
import { createTranslator } from '../i18n/translate';
import { ErrorBoundaryCore } from '../ui/error-boundary-core';

// Phase 15: the root error boundary. The reusable core has no React Native import, so the
// real React runs it in Chromium: a child that throws while rendering produces the recovery
// screen, and Reset remounts the children.

const SRC = join(__dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

describe('error boundary core (lifecycle)', () => {
  it('turns a render error into state, and keeps unknown throwables as errors', () => {
    const boom = new Error('x');
    expect(ErrorBoundaryCore.getDerivedStateFromError(boom)).toEqual({ error: boom });
    expect(ErrorBoundaryCore.getDerivedStateFromError('plain string').error).toBeInstanceOf(Error);
  });

  it('reports the error to onError (the error only)', () => {
    const seen: Error[] = [];
    const boundary = new ErrorBoundaryCore({ children: null, fallback: () => null, onError: (error) => seen.push(error) });
    const boom = new Error('x');
    boundary.componentDidCatch(boom);
    expect(seen).toEqual([boom]);
  });
});

describe('root error boundary (source)', () => {
  it('wraps the whole app, outside every provider, so the fallback cannot depend on them', () => {
    const layout = read('app/_layout.tsx');
    const boundary = layout.indexOf('<RootErrorBoundary>');
    for (const provider of ['<SafeAreaProvider>', '<DatabaseProvider>', '<LocalizationProvider>', '<ResumeStoreProvider>']) {
      expect(boundary, provider).toBeGreaterThanOrEqual(0);
      expect(layout.indexOf(provider), provider).toBeGreaterThan(boundary);
    }
  });

  it('the recovery screen uses only React Native primitives and the catalog (no store, database, router or localization context)', () => {
    const screen = read('ui/RootErrorBoundary.tsx');
    expect(screen).not.toMatch(/useResumeStore|useDatabase|useLocalization|useT\b|expo-router|useRouter|resume-store|database-context|localization'/);
    expect(screen).toMatch(/createTranslator\(hasAppLanguage\(\) \? getAppLanguage\(\) : deviceLanguage\(\)\)/);
    expect(screen).toMatch(/t\('crash\.title'\)/);
    expect(screen).toMatch(/t\('crash\.body'\)/);
    expect(screen).toMatch(/t\('database\.tryAgain'\)/);
  });

  it('retry only remounts the app: it never touches saved data', () => {
    const core = read('ui/error-boundary-core.ts');
    expect(core).toMatch(/reset = \(\): void => \{\n    this\.setState\(\(state\) => \(\{ error: null, attempt: state\.attempt \+ 1 \}\)\);/);
    expect(core).not.toMatch(/sqlite|repository|delete|DROP/i);
  });

  it('the limits are written down: only render-time errors are caught', () => {
    const core = read('ui/error-boundary-core.ts');
    expect(core).toMatch(/does NOT catch/);
    expect(core).toMatch(/event handlers/);
    expect(core).toMatch(/native crashes/);
  });

  it('the screen text comes from the catalog in all five languages', () => {
    expect(createTranslator('de').t('crash.title')).toBe(de.crash.title);
    for (const language of ['en', 'de', 'fr', 'es', 'ar'] as const) {
      const { t } = createTranslator(language);
      expect(t('crash.title').length).toBeGreaterThan(5);
      expect(t('crash.body').length).toBeGreaterThan(10);
    }
  });
});

const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROLLDOWN = join(SRC, '..', 'node_modules', 'rolldown');

describe.skipIf(!existsSync(CHROMIUM) || !existsSync(ROLLDOWN))('error boundary in a real React renderer (Chromium)', () => {
  let browser: Browser;
  let page: Page;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'boundary-'));
    const entry = join(dir, 'entry.js');
    writeFileSync(
      entry,
      `import { createElement as h, useState } from 'react';
       import { createRoot } from 'react-dom/client';
       import { ErrorBoundaryCore } from ${JSON.stringify(join(SRC, 'ui', 'error-boundary-core.ts'))};
       window.state = { throwNow: true, caught: [], mounts: 0 };
       function Child() {
         const [mountId] = useState(() => ++window.state.mounts);
         if (window.state.throwNow) throw new Error('child exploded');
         return h('p', { id: 'ok' }, 'child ok #' + mountId);
       }
       // The fallback shares nothing with the failing tree.
       const fallback = (reset) => h('div', { id: 'fallback' }, h('p', null, 'recovery screen'), h('button', { id: 'retry', onClick: reset }, 'retry'));
       window.mount = () => {
         const root = createRoot(document.getElementById('root'));
         root.render(h(ErrorBoundaryCore, { fallback, onError: (e) => window.state.caught.push(e.message) }, h('div', { id: 'app' }, h(Child))));
       };`,
    );
    const { rolldown } = await import('rolldown');
    // The entry lives in a temp folder, so React is found through absolute paths.
    const resolve = createRequire(join(SRC, '..', 'package.json')).resolve;
    const bundle = await rolldown({
      input: entry,
      platform: 'browser',
      logLevel: 'silent',
      resolve: { alias: { react: resolve('react'), 'react-dom/client': resolve('react-dom/client') } },
      transform: { define: { 'process.env.NODE_ENV': '"development"' } },
    });
    const { output } = await bundle.generate({ format: 'iife' });
    const script = output[0].code;
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: CHROMIUM });
    page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: script });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('a throwing child shows the recovery screen instead of the app, and reports the error', async () => {
    await page.evaluate(() => (window as unknown as { mount: () => void }).mount());
    await page.waitForSelector('#fallback');
    expect(await page.locator('#app').count()).toBe(0);
    expect(await page.locator('#fallback p').innerText()).toBe('recovery screen');
    const caught = await page.evaluate(() => (window as unknown as { state: { caught: string[] } }).state.caught);
    expect(caught).toContain('child exploded');
  });

  it('Retry while the error persists shows the recovery screen again (no crash loop, no blank screen)', async () => {
    await page.click('#retry');
    await page.waitForSelector('#fallback');
    expect(await page.locator('#app').count()).toBe(0);
  });

  it('Retry after the cause is gone remounts the app fresh', async () => {
    await page.evaluate(() => {
      (window as unknown as { state: { throwNow: boolean } }).state.throwNow = false;
    });
    const mountsBefore = await page.evaluate(() => (window as unknown as { state: { mounts: number } }).state.mounts);
    await page.click('#retry');
    await page.waitForSelector('#ok');
    expect(await page.locator('#fallback').count()).toBe(0);
    const text = await page.locator('#ok').innerText();
    expect(text).toMatch(/^child ok #\d+$/);
    // A fresh mount: the child's state was rebuilt, not reused.
    expect(Number(text.replace(/\D/g, ''))).toBeGreaterThan(mountsBefore);
  });
});

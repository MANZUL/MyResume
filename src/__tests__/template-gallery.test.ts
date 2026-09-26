import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { emptyResume } from '../domain/resume/types';
import { templateSampleHtml } from '../domain/templates/sample-preview';
import { findTemplate, getTemplate, TEMPLATE_CATEGORIES, TEMPLATES } from '../domain/templates/templates';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import { ResumeLibrary } from '../services/storage/resume-library';
import { initializeDatabase } from '../services/storage/sqlite/database';
import { ManualTimers, openTestDatabase, tempDir, testId, type TestDatabase } from './helpers/node-sqlite';

// Template-first navigation: gallery data, template choice at creation, thumbnails.

const ROOT = join(__dirname, '..', '..');
const THUMB_DIR = join(ROOT, 'assets', 'templates');
const MANIFEST = join(THUMB_DIR, 'manifest.json');
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const hashOf = (html: string) => createHash('sha256').update(html).digest('hex');

// The web product's taxonomy (MANZUL/Resume artifacts/resume-builder/src/lib/templates.ts).
const WEB_TAXONOMY: Record<string, string> = {
  'corporate-boardroom': 'Corporate',
  'corporate-partner': 'Corporate',
  'tech-builder': 'Tech',
  'tech-architect': 'Tech',
  'creative-editorial': 'Creative',
  'creative-studio': 'Creative',
  'healthcare-practitioner': 'Healthcare',
  'healthcare-educator': 'Healthcare',
  'academic-scholar': 'Academic',
  'academic-researcher': 'Academic',
  'trades-operator': 'Trades',
  'trades-foreman': 'Trades',
};

describe('template registry for the gallery', () => {
  it('has the 12 existing templates with the web categories', () => {
    expect(TEMPLATES).toHaveLength(12);
    expect(Object.fromEntries(TEMPLATES.map((t) => [t.id, t.category]))).toEqual(WEB_TAXONOMY);
    for (const t of TEMPLATES) {
      expect(t.name.trim(), t.id).not.toBe('');
      expect(t.description.trim(), t.id).not.toBe('');
    }
  });

  it('lists every category once, in the web filter order, each with its templates', () => {
    expect(TEMPLATE_CATEGORIES).toEqual(['Corporate', 'Tech', 'Creative', 'Healthcare', 'Academic', 'Trades']);
    for (const category of TEMPLATE_CATEGORIES) {
      expect(TEMPLATES.filter((t) => t.category === category).length, category).toBe(2);
    }
    // "All" plus the categories covers every template exactly once.
    expect(TEMPLATE_CATEGORIES.flatMap((c) => TEMPLATES.filter((t) => t.category === c))).toHaveLength(12);
  });

  it('findTemplate returns undefined for an unknown id; getTemplate falls back to the default', () => {
    expect(findTemplate('tech-builder')?.name).toBe('The Builder');
    expect(findTemplate('nope')).toBeUndefined();
    expect(findTemplate('')).toBeUndefined();
    expect(getTemplate('nope').id).toBe(TEMPLATES[0].id);
  });
});

describe('template sample preview (existing renderer, sample data, no watermark)', () => {
  it.each(TEMPLATES.map((t) => [t.id]))('%s renders the sample with its default accent and no watermark', (id) => {
    const html = templateSampleHtml(id);
    const template = getTemplate(id);
    expect(html).toContain(SAMPLE_RESUME.name.split(' ')[0]);
    expect(html.toLowerCase()).toContain(template.defaultAccent.toLowerCase());
    expect(html).not.toContain('class="watermark"');
    expect(html).not.toContain('/*watermark*/');
  });

  it('an unknown id falls back to the default template', () => {
    expect(templateSampleHtml('nope')).toBe(templateSampleHtml(TEMPLATES[0].id));
  });
});

describe('creating a resume from a chosen template', () => {
  let dir: ReturnType<typeof tempDir>;
  let db: TestDatabase;
  let timers: ManualTimers;

  const boot = async () => {
    db = openTestDatabase(dir.file('app.db'));
    const app = await initializeDatabase(db, { newId: testId, now: timers.now });
    const library = new ResumeLibrary(app.resumes, { newId: testId, timers, now: timers.now, delayMs: 600, maxWaitMs: 3000 });
    await library.load();
    return library;
  };

  beforeEach(() => {
    dir = tempDir();
    timers = new ManualTimers();
  });
  afterEach(async () => {
    await db.close();
    dir.cleanup();
  });

  it.each(TEMPLATES.map((t) => [t.id]))('%s becomes the template, with its default accent, and is stored', async (id) => {
    const library = await boot();
    const created = library.create(emptyResume(), 'Untitled resume', id);
    expect(created.templateId).toBe(id);
    expect(created.accent).toBe(getTemplate(id).defaultAccent);
    await library.flush();
    await db.close();
    const reopened = await boot();
    const stored = reopened.get(created.id);
    expect(stored?.templateId).toBe(id);
    expect(stored?.accent).toBe(getTemplate(id).defaultAccent);
  });

  it('an unknown or empty template id falls back to the default template', async () => {
    const library = await boot();
    for (const id of ['nope', '', '../../etc']) {
      const created = library.create(emptyResume(), 'X', id);
      expect(created.templateId).toBe(TEMPLATES[0].id);
      expect(created.accent).toBe(TEMPLATES[0].defaultAccent);
    }
  });

  it('without a template id (Import, Try sample) the default is Boardroom, as before', async () => {
    const library = await boot();
    const created = library.create(SAMPLE_RESUME, 'Sample resume');
    expect(created.templateId).toBe('corporate-boardroom');
    expect(created.accent).toBe(getTemplate('corporate-boardroom').defaultAccent);
  });

  it('existing resumes keep their templates, and template switching still works', async () => {
    const library = await boot();
    const a = library.create(emptyResume(), 'A', 'tech-builder');
    const b = library.create(emptyResume(), 'B', 'trades-foreman');
    const studio = getTemplate('creative-studio');
    library.update(a.id, { templateId: studio.id, accent: studio.defaultAccent });
    await library.flush();
    await db.close();
    const reopened = await boot();
    expect(reopened.get(a.id)?.templateId).toBe('creative-studio');
    expect(reopened.get(a.id)?.accent).toBe(studio.defaultAccent);
    expect(reopened.get(b.id)?.templateId).toBe('trades-foreman');
    expect(reopened.getAll().map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
  });
});

// Thumbnails: `npm run thumbnails` (UPDATE_THUMBNAILS=1) captures them in Chromium;
// the default run checks that the images match the renderer's current output.
describe('gallery thumbnails', () => {
  it.runIf(process.env.UPDATE_THUMBNAILS === '1')(
    'regenerates the thumbnails from the existing renderer',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser: Browser = await chromium.launch({ executablePath: CHROMIUM });
      try {
        const page = await browser.newPage({ viewport: { width: 848, height: 1200 }, deviceScaleFactor: 0.625 });
        const manifest: Record<string, string> = {};
        for (const t of TEMPLATES) {
          const html = templateSampleHtml(t.id);
          await page.setContent(html, { waitUntil: 'load' });
          const box = await page.locator('.page').boundingBox();
          if (!box) throw new Error(`no page box for ${t.id}`);
          await page.screenshot({
            path: join(THUMB_DIR, `${t.id}.png`),
            clip: { x: box.x, y: box.y, width: box.width, height: Math.round((box.width * 11) / 8.5) },
          });
          manifest[t.id] = hashOf(html);
        }
        writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
      } finally {
        await browser.close();
      }
    },
    120_000,
  );

  it('there is one thumbnail per template, matching the current renderer output', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, string>;
    expect(Object.keys(manifest).sort()).toEqual(TEMPLATES.map((t) => t.id).sort());
    for (const t of TEMPLATES) {
      expect(existsSync(join(THUMB_DIR, `${t.id}.png`)), t.id).toBe(true);
      expect(manifest[t.id], `${t.id}: run npm run thumbnails`).toBe(hashOf(templateSampleHtml(t.id)));
    }
  });

  it('the thumbnail map requires exactly the 12 template images', () => {
    const source = readFileSync(join(ROOT, 'src', 'features', 'templates', 'thumbnails.ts'), 'utf8');
    const required = [...source.matchAll(/'([a-z-]+)': require\('\.\.\/\.\.\/\.\.\/assets\/templates\/([a-z-]+)\.png'\)/g)];
    expect(required.map((m) => m[1]).sort()).toEqual(TEMPLATES.map((t) => t.id).sort());
    for (const m of required) expect(m[1]).toBe(m[2]);
  });
});

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { checkAtsReadability } from '../domain/ats/ats';
import { scoreResume } from '../domain/check/resume-score';
import { analyzeText, buildCoachContext } from '../domain/coach/coach';
import { analysisSupport, RULE_LANGUAGES, type AnalysisEngine } from '../domain/i18n/analysis-support';
import { formatDate, formatNumber } from '../domain/i18n/format';
import { DEFAULT_LANGUAGE, directionOf, LANGUAGES, resolveLanguage, toLanguage, type Language } from '../domain/i18n/languages';
import { pluralCategory } from '../domain/i18n/plural';
import { RESUME_LABELS, resumeLabels } from '../domain/i18n/resume-labels';
import { typographyFor } from '../domain/i18n/typography';
import { analyzeJobMatch } from '../domain/job-match/job-match';
import { generateCoverLetter } from '../domain/letter/cover-letter';
import { parseResumeText } from '../domain/parse/parse-text';
import { buildResumeDocxBase64 } from '../domain/render/export-docx';
import { renderResumeHtml, WATERMARK_TILE_URL } from '../domain/render/render-html';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import { emptyResume, type ResumeData, type StoredResume } from '../domain/resume/types';
import { fileSafeName } from '../domain/shared/text';
import { TEMPLATES } from '../domain/templates/templates';
import { CATALOGS, ENGLISH, type PartialMessages } from '../i18n/catalog';
import { en } from '../i18n/messages/en';
import { templateText } from '../i18n/templates';
import { createTranslator, hasTranslation } from '../i18n/translate';
import { EntitlementService } from '../services/entitlement/entitlement-service';
import { MemoryEntitlementCacheStore } from '../services/entitlement/cache-store';
import { FakeStoreProvider } from '../services/entitlement/fake-store';
import { PremiumGate } from '../services/entitlement/premium-gate';
import { exportFileName, pdfHtml } from '../services/export/file-export-platform';
import { PremiumTools } from '../services/premium/premium-tools';
import { PreviewService } from '../services/preview/preview-service';
import { ResumeLibrary } from '../services/storage/resume-library';
import { initializeDatabase } from '../services/storage/sqlite/database';
import { migrate } from '../services/storage/sqlite/migrate';
import { MIGRATIONS } from '../services/storage/sqlite/schema';
import { ManualTimers, openTestDatabase, tempDir, testId, type TestDatabase } from './helpers/node-sqlite';

// Localization architecture (five launch languages; app language ≠ resume language).

const SRC = join(__dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');
const LATIN: Language[] = ['en', 'de', 'fr', 'es'];

const stored = (language: Language, overrides: Partial<StoredResume> = {}): StoredResume => ({
  id: 'r1',
  title: 'Mine',
  templateId: 'corporate-boardroom',
  accent: '#1B2B47',
  language,
  data: SAMPLE_RESUME,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});
const html = (language: Language, templateId = 'corporate-boardroom', mode: 'pdf' | 'preview' = 'pdf', extra: { watermark?: boolean } = {}) =>
  renderResumeHtml(SAMPLE_RESUME, { templateId, accent: TEMPLATES.find((t) => t.id === templateId)!.defaultAccent, mode, language, ...extra });
const docxText = async (language: Language, data: ResumeData = SAMPLE_RESUME) => {
  const zip = await JSZip.loadAsync(Buffer.from(await buildResumeDocxBase64({ data, accent: '#1B2B47', templateName: 'X', language }), 'base64'));
  return zip.file('word/document.xml')!.async('string');
};
const headingsIn = (page: string) => [...page.matchAll(/<h2 class="[^"]*">([^<]*)<\/h2>/g)].map((m) => m[1]);

// --- 1. app language and resume language are independent ---

describe('app language and resume language', () => {
  let dir: ReturnType<typeof tempDir>;
  let db: TestDatabase;
  beforeEach(() => {
    dir = tempDir();
  });
  afterEach(async () => {
    await db.close();
    dir.cleanup();
  });

  it('are stored separately: changing one never changes the other', async () => {
    db = openTestDatabase(dir.file('app.db'));
    const app = await initializeDatabase(db, { newId: testId });
    let appLanguage: Language = 'de';
    const library = new ResumeLibrary(app.resumes, { newId: testId, timers: new ManualTimers(), defaultLanguage: () => appLanguage });
    await library.load();

    await app.settings.setAppLanguage('de');
    const resume = library.create(emptyResume(), 'CV');
    expect(resume.language).toBe('de');

    // The user writes this resume in English while the app stays German.
    library.update(resume.id, { language: 'en' });
    await library.flush();
    expect(await app.settings.getAppLanguage()).toBe('de');
    expect((await app.resumes.get(resume.id))?.language).toBe('en');

    // Switching the app to Arabic changes neither existing resume.
    await app.settings.setAppLanguage('ar');
    appLanguage = 'ar';
    expect((await app.resumes.get(resume.id))?.language).toBe('en');
    expect(library.create(emptyResume(), 'Second').language).toBe('ar');
    expect(library.get(resume.id)?.language).toBe('en');
  });

  it('the app language is persisted; an unknown stored value counts as not chosen', async () => {
    db = openTestDatabase(dir.file('app.db'));
    const app = await initializeDatabase(db, { newId: testId });
    expect(await app.settings.getAppLanguage()).toBeNull();
    await app.settings.setAppLanguage('fr');
    await app.settings.setAppLanguage('es');
    expect(await app.settings.getAppLanguage()).toBe('es');
    db.raw.exec("UPDATE app_settings SET value = 'xx' WHERE key = 'app_language'");
    expect(await app.settings.getAppLanguage()).toBeNull();
  });
});

// --- 2 & 11 (migration). Existing resumes become English; nothing else changes ---

describe('migration v4: resume language', () => {
  let dir: ReturnType<typeof tempDir>;
  let db: TestDatabase;
  beforeEach(() => {
    dir = tempDir();
    db = openTestDatabase(dir.file('app.db'));
  });
  afterEach(async () => {
    await db.close();
    dir.cleanup();
  });

  it('existing resumes migrate to English with all data, target jobs and export records preserved', async () => {
    await migrate(db, MIGRATIONS.slice(0, 3), { now: 1, legacyResumesJson: null });
    const data = JSON.stringify(SAMPLE_RESUME);
    db.raw.prepare(
      'INSERT INTO resumes (id, title, template_id, accent, data_json, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('a', 'First', 'tech-builder', '#3B5168', data, 1, 10, 20);
    db.raw.prepare(
      'INSERT INTO resumes (id, title, template_id, accent, data_json, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('b', 'Second', 'trades-foreman', '#000000', data, 0, 11, 21);
    db.raw.prepare('INSERT INTO target_jobs (resume_id, title, company, description, updated_at) VALUES (?, ?, ?, ?, ?)').run('a', 'PM', 'Acme', 'SQL', 5);
    db.raw.prepare(
      'INSERT INTO export_records (id, resume_id, template_id, export_type, outcome, access_reason, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('e1', 'a', 'tech-builder', 'png', 'succeeded', 'verified', null, 30);
    const before = {
      resumes: db.raw.prepare('SELECT id, title, template_id, accent, data_json, is_active, created_at, updated_at FROM resumes ORDER BY id').all(),
      jobs: db.raw.prepare('SELECT * FROM target_jobs').all(),
      exports: db.raw.prepare('SELECT * FROM export_records').all(),
    };

    expect(await migrate(db, MIGRATIONS, { now: 1, legacyResumesJson: null })).toEqual({ from: 3, to: 4, applied: [4] });

    expect(db.raw.prepare('SELECT id, title, template_id, accent, data_json, is_active, created_at, updated_at FROM resumes ORDER BY id').all()).toEqual(before.resumes);
    expect(db.raw.prepare('SELECT id, language FROM resumes ORDER BY id').all()).toEqual([
      { id: 'a', language: 'en' },
      { id: 'b', language: 'en' },
    ]);
    expect(db.raw.prepare('SELECT * FROM target_jobs').all()).toEqual(before.jobs);
    expect(db.raw.prepare('SELECT * FROM export_records').all()).toEqual(before.exports);

    const app = await initializeDatabase(db, { newId: testId });
    expect((await app.resumes.list()).map((r) => [r.id, r.language, r.data.name])).toEqual([
      ['b', 'en', SAMPLE_RESUME.name],
      ['a', 'en', SAMPLE_RESUME.name],
    ]);
  });

  it('only the five launch languages can be stored', async () => {
    await initializeDatabase(db, { newId: testId });
    const insert = (language: string) =>
      db.raw
        .prepare('INSERT INTO resumes (id, title, template_id, accent, language, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(`r-${language}`, 't', 'tech-builder', '#000000', language, '{}', 1, 1);
    for (const language of LANGUAGES) expect(() => insert(language)).not.toThrow();
    expect(() => insert('pt')).toThrow(/CHECK/);
    expect(() => insert('')).toThrow(/CHECK/);
  });

  it('a record without a valid language reads as English (legacy data, JSON imports)', () => {
    expect(toLanguage(undefined)).toBe('en');
    expect(toLanguage('AR')).toBe('en');
    expect(toLanguage('ar')).toBe('ar');
  });
});

// --- 3. new resumes default to the current app language ---

describe('new resumes', () => {
  it('take the app language at the moment of creation, and an explicit language wins', async () => {
    const dir = tempDir();
    const db = openTestDatabase(dir.file('app.db'));
    const app = await initializeDatabase(db, { newId: testId });
    let appLanguage: Language = 'fr';
    const library = new ResumeLibrary(app.resumes, { newId: testId, timers: new ManualTimers(), defaultLanguage: () => appLanguage });
    expect(library.create(emptyResume()).language).toBe('fr');
    appLanguage = 'es';
    expect(library.create(emptyResume()).language).toBe('es');
    expect(library.create(emptyResume(), 'Sample', undefined, 'en').language).toBe('en');
    // Without an app language (defensive default) a resume is English.
    expect(new ResumeLibrary(app.resumes, { newId: testId }).create(emptyResume()).language).toBe(DEFAULT_LANGUAGE);
    await db.close();
    dir.cleanup();
  });

  it('the app store passes the app language; the sample is English; imports use the app language', () => {
    const store = read('services/storage/resume-store.tsx');
    expect(store).toMatch(/defaultLanguage: getAppLanguage/);
    expect(read('features/library/HomeScreen.tsx')).toMatch(/SAMPLE_RESUME_LANGUAGE\)/);
    const importer = read('features/import/ImportScreen.tsx');
    expect(importer).toMatch(/parseResumeText\(text, appLanguage\)/);
    expect(importer).toMatch(/create\(data, .*, undefined, appLanguage\)/);
  });
});

// --- 4. the renderer receives the resume language ---

describe('renderer contract', () => {
  it('writes the resume language and direction on the page', () => {
    for (const language of LANGUAGES) {
      expect(html(language)).toContain(`<html lang="${language}" dir="${directionOf(language)}">`);
    }
  });

  it('preview and PDF use the resume language, not the app language', async () => {
    const T = 1_700_000_000_000;
    const store = new FakeStoreProvider({ storeNow: () => T });
    const preview = new PreviewService(new EntitlementService(store, new MemoryEntitlementCacheStore(), () => T));
    expect((await preview.render(stored('ar'))).html).toContain('<html lang="ar" dir="rtl">');
    expect((await preview.render(stored('de'))).html).toContain('<html lang="de" dir="ltr">');
    expect(pdfHtml(stored('ar'), 'letter')).toContain('<html lang="ar" dir="rtl">');
    for (const file of ['services/preview/preview-service.ts', 'services/export/file-export-platform.ts']) {
      expect(read(file), file).toMatch(/language: resume\.language/);
    }
  });
});

// --- 5. one canonical label source for PDF and DOCX ---

describe('resume labels', () => {
  it('PDF and DOCX headings come from the same source, in the resume language', async () => {
    const labels = resumeLabels('en');
    const pdfHeadings = headingsIn(html('en'));
    expect(pdfHeadings).toEqual([labels.summary, labels.experience, labels.education, labels.certifications, labels.projects, labels.awards]);
    const docx = await docxText('en');
    for (const heading of pdfHeadings) expect(docx).toContain(`>${heading.toUpperCase()}<`);
    // The old DOCX-only wording is gone: one canonical label set.
    expect(docx).not.toMatch(/Licenses|Honors</);
  });

  it('a translated label reaches both exports (proves the shared source)', async () => {
    const saved = { ...RESUME_LABELS.de };
    try {
      RESUME_LABELS.de.experience = 'Berufserfahrung';
      expect(headingsIn(html('de'))).toContain('Berufserfahrung');
      expect(await docxText('de')).toContain('>BERUFSERFAHRUNG<');
      // Missing translations fall back per label.
      expect(headingsIn(html('de'))).toContain('Education');
    } finally {
      RESUME_LABELS.de = saved;
    }
  });

  it('the watermark text is a resume label', () => {
    expect(resumeLabels('en').previewWatermark).toBe('PREVIEW');
    expect(decodeURIComponent(WATERMARK_TILE_URL)).toContain('>PREVIEW<');
    const ar = html('ar', 'corporate-boardroom', 'preview', { watermark: true });
    expect(ar).toContain('/*watermark*/');
  });
});

// --- 6. template ids are stable across languages ---

describe('template metadata', () => {
  it('display text is keyed by stable template id; every language resolves every template', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(Object.keys(en.templates).filter((k) => k !== 'categories').sort()).toEqual([...ids].sort());
    for (const language of LANGUAGES) {
      const { t } = createTranslator(language);
      for (const id of ids) {
        const text = templateText(t, id);
        expect(text.name, `${language} ${id}`).not.toBe('');
        expect(text.name).not.toContain('templates.');
      }
      for (const key of Object.keys(CATALOGS[language].templates ?? {})) expect([...ids, 'categories'], key).toContain(key);
    }
  });

  it('no display text remains in the template definitions; ids are unchanged', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([
      'corporate-boardroom', 'corporate-partner', 'tech-builder', 'tech-architect', 'creative-editorial', 'creative-studio',
      'healthcare-practitioner', 'healthcare-educator', 'academic-scholar', 'academic-researcher', 'trades-operator', 'trades-foreman',
    ]);
    for (const t of TEMPLATES) expect(Object.keys(t)).not.toEqual(expect.arrayContaining(['name']));
    expect(read('domain/templates/templates.ts')).not.toMatch(/description:|name: 'The/);
  });

  it('a resume keeps the same template id whatever the app or resume language', async () => {
    const dir = tempDir();
    const db = openTestDatabase(dir.file('app.db'));
    const app = await initializeDatabase(db, { newId: testId });
    for (const language of LANGUAGES) {
      const library = new ResumeLibrary(app.resumes, { newId: testId, defaultLanguage: () => language });
      expect(library.create(emptyResume(), 'x', 'healthcare-educator').templateId).toBe('healthcare-educator');
    }
    await db.close();
    dir.cleanup();
  });
});

// --- 7 & 8. direction ---

describe('direction', () => {
  it('Arabic is right-to-left; English, German, French and Spanish are left-to-right', () => {
    expect(directionOf('ar')).toBe('rtl');
    for (const language of LATIN) expect(directionOf(language)).toBe('ltr');
  });

  it('an Arabic document isolates always-LTR parts and mirrors reading-order spacing only', () => {
    const page = html('ar', 'creative-editorial');
    expect(page).toContain('/*rtl*/');
    expect(page).toContain(`<bdi dir="ltr">${SAMPLE_RESUME.contact.email}</bdi>`);
    expect(page).toContain(`<bdi dir="ltr">${SAMPLE_RESUME.contact.phone}</bdi>`);
    expect(page).toContain(`<bdi>${SAMPLE_RESUME.experience[0].start}</bdi>`);
    // Split header: contact column on the end side (left in RTL).
    expect(page).toMatch(/<div style="text-align:left;font-size:8\.5pt;display:flex;flex-direction:column/);
    // Decorative marks are not mirrored.
    expect(html('ar')).toMatch(/\.mark-qc \{ position: absolute; top: 0; right: 0;/);
  });

  it('Latin-script documents get no RTL rules, no isolates and no script overrides', () => {
    for (const language of LATIN) {
      const page = html(language, 'tech-architect', 'preview', { watermark: true });
      expect(page).not.toMatch(/\/\*rtl\*\/|\/\*script\*\/|<bdi/);
    }
  });

  it('DOCX: Arabic paragraphs and runs are bidirectional; Latin ones are not', async () => {
    const ar = await docxText('ar');
    expect(ar).toContain('<w:bidi/>');
    expect(ar).toContain('<w:rtl/>');
    const english = await docxText('en');
    expect(english).not.toMatch(/<w:bidi\/>|<w:rtl\/>/);
  });
});

// --- 9. Arabic typography ---

describe('Arabic typography', () => {
  it('turns off template uppercase, small caps and letter-spacing; Latin keeps them', () => {
    expect(typographyFor('ar')).toMatchObject({ script: 'arabic', caseTransforms: false, smallCaps: false, letterSpacing: false });
    for (const language of LATIN) expect(typographyFor(language)).toMatchObject({ script: 'latin', caseTransforms: true, smallCaps: true, letterSpacing: true });
    const page = html('ar');
    expect(page).toMatch(/\.upper, h1, h2 \{ text-transform: none !important; \}/);
    expect(page).toMatch(/letter-spacing: 0 !important; font-variant: normal !important;/);
    expect(page).toContain("'Geeza Pro', 'Noto Naskh Arabic'");
    const tile = /url\("data:image\/svg\+xml,([^"]+)"\)/.exec(html('ar', 'corporate-boardroom', 'preview', { watermark: true }))![1];
    expect(decodeURIComponent(tile)).toContain("letter-spacing='0'");
    expect(decodeURIComponent(tile)).toContain("direction='rtl'");
  });

  it('DOCX: an Arabic name and headings are not upper-cased or tracked', async () => {
    const data = { ...SAMPLE_RESUME, name: 'Zoë Müller' };
    const ar = await docxText('ar', data);
    expect(ar).toContain('>Zoë Müller<');
    expect(ar).not.toContain('ZOË MÜLLER');
    expect(ar).not.toMatch(/<w:spacing w:val="45"\/>/);
    expect(await docxText('en', data)).toContain('ZOË MÜLLER');
  });

  const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  it.skipIf(!existsSync(CHROMIUM))('in a real engine: Arabic headings and name have no transform or tracking, and the page is RTL', async () => {
    const { chromium } = await import('playwright-core');
    const browser: Browser = await chromium.launch({ executablePath: CHROMIUM });
    try {
      const page = await browser.newPage();
      const style = async (language: Language) => {
        await page.setContent(html(language, 'corporate-boardroom'));
        return page.evaluate(() => {
          const h1 = getComputedStyle(document.querySelector('h1')!);
          const h2 = getComputedStyle(document.querySelector('h2')!);
          return { dir: getComputedStyle(document.body).direction, h1: [h1.textTransform, h1.letterSpacing], h2: [h2.textTransform, h2.letterSpacing] };
        });
      };
      expect(await style('ar')).toEqual({ dir: 'rtl', h1: ['none', 'normal'], h2: ['none', 'normal'] });
      const latin = await style('en');
      expect(latin.dir).toBe('ltr');
      expect(latin.h1[0]).toBe('uppercase');
      expect(latin.h2[0]).toBe('uppercase');
      expect(latin.h1[1]).not.toBe('normal');
    } finally {
      await browser.close();
    }
  }, 60_000);
});

// --- 10. Unicode file names ---

describe('file names', () => {
  it('keep Unicode letters and are safe on every platform', () => {
    expect(fileSafeName('Zoë Müller')).toBe('zoë-müller');
    expect(fileSafeName('محمد أحمد')).toBe('محمد-أحمد');
    expect(fileSafeName('José García-López')).toBe('josé-garcía-lópez');
    expect(fileSafeName('Eleanor Vance')).toBe('eleanor-vance');
    expect(fileSafeName('Jean-Luc   Picard')).toBe('jean-luc-picard');
    // Path, shell and reserved characters never survive.
    expect(fileSafeName('../../etc/passwd')).toBe('etc-passwd');
    expect(fileSafeName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j');
    expect(fileSafeName('CON')).toBe('con-resume');
    // Bidi and zero-width controls are removed (no reordered extensions).
    expect(fileSafeName('evil‮gnp.exe')).toBe('evilgnp-exe');
    expect(fileSafeName('a​b')).toBe('ab');
    // Empty or symbol-only names fall back; long names are capped at 60 characters.
    expect(fileSafeName('')).toBe('resume');
    expect(fileSafeName('✨🚀')).toBe('resume');
    expect(Array.from(fileSafeName('ع'.repeat(200)))).toHaveLength(60);
    // Deterministic: composed and decomposed input give the same name.
    expect(fileSafeName('Zoë')).toBe(fileSafeName('Zoë'));
  });

  it('export files use the Unicode name', () => {
    const arabic = stored('ar', { data: { ...SAMPLE_RESUME, name: 'محمد أحمد' } });
    expect(exportFileName(arabic, 'pdf')).toBe('محمد-أحمد.pdf');
    expect(exportFileName(arabic, 'png', { index: 1, count: 2 })).toBe('محمد-أحمد-page-2.png');
  });
});

// --- 11. analysis engines receive the resume language ---

describe('analysis engine contracts', () => {
  const engines: AnalysisEngine[] = ['resumeScore', 'ats', 'jobMatch', 'writingCoach', 'coverLetter', 'import'];

  it('every engine has English rules; other languages are explicit, never silently English', () => {
    for (const engine of engines) {
      expect(RULE_LANGUAGES[engine]).toEqual(['en']);
      expect(analysisSupport(engine, 'en')).toEqual({ kind: 'native', language: 'en' });
      for (const language of ['de', 'fr', 'es', 'ar'] as const) {
        expect(analysisSupport(engine, language).kind).toBe(engine === 'writingCoach' ? 'unavailable' : 'english-rules');
      }
    }
  });

  it('each report says which rules produced it', () => {
    expect(scoreResume(SAMPLE_RESUME, 'de').support).toEqual({ kind: 'english-rules', language: 'de' });
    expect(checkAtsReadability(SAMPLE_RESUME, 'tech-builder', 'ar').support).toEqual({ kind: 'english-rules', language: 'ar' });
    expect(analyzeJobMatch(SAMPLE_RESUME, 'Python and SQL', 'fr').support).toEqual({ kind: 'english-rules', language: 'fr' });
    expect(generateCoverLetter(SAMPLE_RESUME, 'es', { company: 'A', role: 'B', hiringManager: '' })).toMatchObject({
      writtenIn: 'en',
      support: { kind: 'english-rules', language: 'es' },
    });
  });

  it('the Writing Coach runs no English rules on other languages', () => {
    const weak = 'Helped with the launch of the very new app';
    expect(analyzeText(weak, buildCoachContext('experienceBullet', 'en')).findings.length).toBeGreaterThan(0);
    for (const language of ['de', 'fr', 'es', 'ar'] as const) {
      expect(analyzeText(weak, buildCoachContext('experienceBullet', language))).toMatchObject({ findings: [], support: { kind: 'unavailable' } });
    }
  });

  it('ATS reads what the export for that language contains (headings, no Arabic tracking)', () => {
    const saved = { ...RESUME_LABELS.de };
    try {
      RESUME_LABELS.de.summary = 'Profil';
      const sections = checkAtsReadability(SAMPLE_RESUME, 'tech-builder', 'de').checks.find((c) => c.rule === 'sections')!;
      expect(sections.summary).toContain('Profil');
    } finally {
      RESUME_LABELS.de = saved;
    }
  });

  it('premium tools pass the language and still check the entitlement first', async () => {
    const T = 1_700_000_000_000;
    const make = async (premium: boolean) => {
      const store = new FakeStoreProvider({ storeNow: () => T });
      if (premium) store.setSubscription('active', T + 30 * 24 * 60 * 60 * 1000);
      return new PremiumTools(new PremiumGate(new EntitlementService(store, new MemoryEntitlementCacheStore(), () => T)));
    };
    await expect((await make(false)).writingCoach('Helped', 'experienceBullet', 'de')).rejects.toMatchObject({ feature: 'coach' });
    await expect((await make(false)).jobMatch(SAMPLE_RESUME, 'SQL', 'ar')).rejects.toMatchObject({ feature: 'jobMatch' });
    const paid = await make(true);
    expect((await paid.writingCoach('Helped with the launch', 'experienceBullet', 'de')).support.kind).toBe('unavailable');
    expect((await paid.jobMatch(SAMPLE_RESUME, 'SQL', 'ar')).support.kind).toBe('english-rules');
  });

  it('import parsing takes the target language; English parsing is unchanged', () => {
    const text = 'Jane Doe\njane@example.com\n\nEXPERIENCE\nProduct Manager — Acme  Jan 2020 – Present\n• Led the launch';
    expect(parseResumeText(text, 'de')).toEqual(parseResumeText(text, 'en'));
  });

  it('screens pass the resume language to every engine', () => {
    const tools = read('features/tools/ToolsScreen.tsx');
    for (const tool of ['CheckTool', 'AtsTool', 'MatchTool', 'LetterTool']) expect(tools).toMatch(new RegExp(`<${tool}[^>]*language=\\{resume\\.language\\}`));
    expect(read('features/editor/EditorScreen.tsx').match(/<CoachEntry language=\{lang\}/g)).toHaveLength(5);
  });
});

// --- 12. existing English behavior is unchanged ---

describe('English output is unchanged', () => {
  it('every English render equals the pre-localization output (plus lang/dir on <html>)', () => {
    // sha256 of all 96 renders (12 templates × pdf/preview × watermark × Letter/A4) at commit 2fa2063.
    const BEFORE = '72622a76bff79ffe43da80a0824bba44403758f666606e4db9d083a9aa024a8d';
    const hash = createHash('sha256');
    const out: Record<string, string> = {};
    for (const t of TEMPLATES) {
      for (const mode of ['pdf', 'preview'] as const) {
        for (const watermark of [false, true]) {
          for (const paper of ['letter', 'a4'] as const) {
            const page = renderResumeHtml(SAMPLE_RESUME, { templateId: t.id, accent: t.defaultAccent, mode, watermark, paper, language: 'en' });
            out[`${t.id}/${mode}/${watermark}/${paper}`] = page.replace('<html lang="en" dir="ltr">', '<html>');
          }
        }
      }
    }
    for (const key of Object.keys(out).sort()) {
      hash.update(key);
      hash.update('\0');
      hash.update(out[key]);
      hash.update('\0');
    }
    expect(Object.keys(out)).toHaveLength(96);
    expect(hash.digest('hex')).toBe(BEFORE);
  });

  it('the English app catalog keeps the exact screen text', () => {
    const { t } = createTranslator('en');
    expect(t('home.create')).toBe('Create my resume');
    expect(t('coach.locked')).toBe('Coach 🔒');
    expect(t('match.charCount', { count: 1234, max: 25000 })).toBe('1,234 / 25,000');
    expect(t('home.deleteBody', { title: 'CV' })).toBe('"CV" will be removed from this device.');
    expect(t('resume.copyOf', { title: 'Mine' })).toBe('Mine (copy)');
  });
});

// --- translator: fallback, plurals, formatting, device language ---

describe('translator', () => {
  it('falls back to English, key by key, for every language', () => {
    const custom: Record<Language, PartialMessages> = { ...CATALOGS, de: { home: { create: 'Lebenslauf erstellen' } } };
    const { t } = createTranslator('de', custom);
    expect(t('home.create')).toBe('Lebenslauf erstellen');
    expect(t('home.seeAll')).toBe('See all');
    expect(hasTranslation('de', 'home.create', custom)).toBe(true);
    expect(hasTranslation('de', 'home.seeAll', custom)).toBe(false);
    for (const language of LANGUAGES) expect(createTranslator(language).t('home.headline')).toBe(ENGLISH.home.headline);
  });

  it('translations may only use keys that exist in English', () => {
    const leaves = (node: unknown, prefix = ''): string[] =>
      typeof node === 'object' && node !== null && !('other' in node)
        ? Object.entries(node).flatMap(([k, v]) => leaves(v, `${prefix}${k}.`))
        : [prefix.slice(0, -1)];
    const english = new Set(leaves(en));
    for (const language of LANGUAGES) for (const key of leaves(CATALOGS[language])) if (key) expect(english, `${language}: ${key}`).toContain(key);
  });

  it('uses CLDR plural rules per language', () => {
    expect([0, 1, 2, 5].map((n) => pluralCategory('en', n))).toEqual(['other', 'one', 'other', 'other']);
    expect([0, 1, 2].map((n) => pluralCategory('fr', n))).toEqual(['one', 'one', 'other']);
    expect([0, 1, 2, 3, 10, 11, 99, 100, 102].map((n) => pluralCategory('ar', n))).toEqual(['zero', 'one', 'two', 'few', 'few', 'many', 'many', 'other', 'other']);
    expect(pluralCategory('es', 1_000_000)).toBe('many');
    const custom: Record<Language, PartialMessages> = { ...CATALOGS, ar: { ats: { toCheck: '{count} x', issues: { zero: 'z', one: 'o', two: 't', few: 'f', many: 'm', other: 'x' } } } };
    const { t } = createTranslator('ar', custom);
    expect([0, 1, 2, 3, 11, 100].map((count) => t('ats.issues', { count }))).toEqual(['z', 'o', 't', 'f', 'm', 'x']);
    expect(createTranslator('en').t('ats.issues', { count: 1 })).toBe('1 potential issue');
  });

  it('formats numbers and dates for the language', () => {
    expect(formatNumber('en', 1234.5)).toBe('1,234.5');
    expect(formatNumber('de', 1234.5)).toBe('1.234,5');
    expect(formatNumber('fr', 1234.5).replace(/\s/g, ' ')).toBe('1 234,5');
    expect(formatDate('en', Date.UTC(2026, 0, 15, 12))).toContain('2026');
    expect(formatDate('de', Date.UTC(2026, 0, 15, 12))).toMatch(/15\.\s?Jan/);
  });

  it('isolates user text inside right-to-left sentences only', () => {
    expect(createTranslator('en').t('home.moreActions', { title: 'CV' })).toBe('More actions for CV');
    expect(createTranslator('en').t('home.moreActions', { title: 'سيرة' })).toBe('More actions for ⁨سيرة⁩');
    expect(createTranslator('ar').t('home.moreActions', { title: 'CV' })).toBe('More actions for ⁨CV⁩');
  });

  it('resolves the device language on the primary subtag, else English', () => {
    expect(resolveLanguage(['de-AT'])).toBe('de');
    expect(resolveLanguage(['ar_EG'])).toBe('ar');
    expect(resolveLanguage(['pt-BR', 'es-MX'])).toBe('es');
    expect(resolveLanguage(['ja-JP'])).toBe('en');
    expect(resolveLanguage([])).toBe('en');
  });
});

// --- architecture: one translation source for app UI ---

describe('no hard-coded UI text in screens', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path);
      return /\.tsx$/.test(name) ? [path] : [];
    });
  const screens = [...files(join(SRC, 'features')), ...files(join(SRC, 'ui')), ...files(join(SRC, 'app')), join(SRC, 'services', 'storage', 'database-context.tsx')];

  it('screens, UI components and routes take visible and accessibility text from the catalog', () => {
    const problems: string[] = [];
    for (const file of screens) {
      const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
      const where = relative(SRC, file);
      // JSX text with words: text right after a JSX tag (<Text ...>, </View>, <>), not TS generics or code.
      for (const m of source.matchAll(/(?:<\/?[A-Z][\w.]*(?:\s[^<>]*?)?|<|<\/)>([^<>{}]*[A-Za-z]{2,}[^<>{}]*)</g)) {
        const text = m[1].trim();
        if (text && !/[()=;?]|&&|\|\|/.test(text)) problems.push(`${where}: text "${text}"`);
      }
      // Text props as string literals.
      for (const m of source.matchAll(/\b(title|label|placeholder|accessibilityLabel|accessibilityHint|subtitle|addLabel|emptyHint)=(["'])[^"']*[A-Za-z]{2,}[^"']*\2/g)) {
        problems.push(`${where}: ${m[0]}`);
      }
      for (const m of source.matchAll(/\b(title|label|placeholder|accessibilityLabel|accessibilityHint|subtitle)=\{\s*(['"`])[^'"`]*[A-Za-z]{2,}/g)) problems.push(`${where}: ${m[0]}`);
      for (const m of source.matchAll(/Alert\.alert\(\s*['"`]/g)) problems.push(`${where}: ${m[0]}`);
      for (const m of source.matchAll(/\btitle:\s*['"`][A-Za-z]/g)) problems.push(`${where}: ${m[0]}`);
    }
    expect(problems).toEqual([]);
  });

  it('the old English copy modules are gone', () => {
    for (const path of ['features/editor/editor-copy.ts', 'features/coach/coach-copy.ts', 'features/ats/ats-copy.ts', 'features/job-match/match-copy.ts']) {
      expect(existsSync(join(SRC, path)), path).toBe(false);
    }
  });
});

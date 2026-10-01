import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { checkAtsReadability } from '../domain/ats/ats';
import { scoreResume } from '../domain/check/resume-score';
import { analyzeText, buildCoachContext } from '../domain/coach/coach';
import { COACH_LIMITS, CoachFixRejectedError, CoachInputError, CoachStaleFindingError } from '../domain/coach/types';
import type { AnalysisText } from '../domain/i18n/analysis-text';
import { analysisSupport, RULE_LANGUAGES, type AnalysisEngine } from '../domain/i18n/analysis-support';
import { formatDate, formatNumber } from '../domain/i18n/format';
import { DEFAULT_LANGUAGE, directionOf, LANGUAGES, resolveLanguage, toLanguage, type Language } from '../domain/i18n/languages';
import { pluralCategory } from '../domain/i18n/plural';
import { resumeLabels } from '../domain/i18n/resume-labels';
import { typographyFor } from '../domain/i18n/typography';
import { analyzeJobMatch } from '../domain/job-match/job-match';
import { JOB_DESCRIPTION_MAX, JobDescriptionTooLongError } from '../domain/job-match/types';
import { generateCoverLetter } from '../domain/letter/cover-letter';
import { parseResumeText } from '../domain/parse/parse-text';
import { buildResumeDocxBase64 } from '../domain/render/export-docx';
import { renderResumeHtml, WATERMARK_TILE_URL } from '../domain/render/render-html';
import { normalizeResumeData } from '../domain/resume/normalize';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import { emptyResume, type ResumeData, type StoredResume } from '../domain/resume/types';
import { fileSafeName } from '../domain/shared/text';
import { templateSampleHtml } from '../domain/templates/sample-preview';
import { TEMPLATES } from '../domain/templates/templates';
import { englishText, errorText, renderText } from '../i18n/analysis';
import { CATALOGS, ENGLISH, type MessageKey, type PartialMessages } from '../i18n/catalog';
import { de } from '../i18n/messages/de';
import { en } from '../i18n/messages/en';
import { fr } from '../i18n/messages/fr';
import { templateText } from '../i18n/templates';
import { createTranslator, hasTranslation } from '../i18n/translate';
import { exportFileName, pdfHtml } from '../services/export/file-export-platform';
import { renderPreview } from '../services/preview/preview-service';
import { jobMatch, writingCoach } from '../services/tools/resume-tools';
import { ResumeLibrary } from '../services/storage/resume-library';
import { initializeDatabase } from '../services/storage/sqlite/database';
import { migrate } from '../services/storage/sqlite/migrate';
import { MIGRATIONS } from '../services/storage/sqlite/schema';
import { EDGE as ATS_EDGE, STRONG as ATS_STRONG, WEAK as ATS_WEAK } from './fixtures/ats-corpus';
import { STRONG as COACH_STRONG, WEAK as COACH_WEAK } from './fixtures/coach-corpus';
import { JDS, RESUMES as JOB_RESUMES } from './fixtures/job-corpus';
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
/** Runs `fn` with a temporary translation for one language (test-only; always restored). */
function withCatalog<T>(language: Language, messages: PartialMessages, fn: () => T): T {
  const saved = CATALOGS[language];
  CATALOGS[language] = messages;
  let result: T;
  try {
    result = fn();
  } catch (error) {
    CATALOGS[language] = saved;
    throw error;
  }
  if (result instanceof Promise) return result.finally(() => (CATALOGS[language] = saved)) as T;
  CATALOGS[language] = saved;
  return result;
}
/** Source files (not tests) under a directory. */
const uiFilesOf = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return uiFilesOf(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
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

  it('preview and PDF use the resume language, not the app language', () => {
    expect(renderPreview(stored('ar'))).toContain('<html lang="ar" dir="rtl">');
    expect(renderPreview(stored('de'))).toContain('<html lang="de" dir="ltr">');
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
    await withCatalog('de', { resume: { labels: { experience: 'Berufserfahrung' } } }, async () => {
      expect(headingsIn(html('de'))).toContain('Berufserfahrung');
      expect(await docxText('de')).toContain('>BERUFSERFAHRUNG<');
      // Missing translations fall back per label.
      expect(headingsIn(html('de'))).toContain('Education');
    });
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
    withCatalog('de', { resume: { labels: { summary: 'Profil' } } }, () => {
      const sections = checkAtsReadability(SAMPLE_RESUME, 'tech-builder', 'de').checks.find((c) => c.rule === 'sections')!;
      expect(sections.summary).toContain('Profil');
    });
  });

  it('the tools pass the resume language to the engines', async () => {
    expect((await writingCoach('Helped with the launch', 'experienceBullet', 'de')).support.kind).toBe('unavailable');
    expect((await jobMatch(SAMPLE_RESUME, 'SQL', 'ar')).support.kind).toBe('english-rules');
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
    expect(t('coach.open')).toBe('Coach');
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
    // Languages without a catalog yet fall back to English; German and French have their own text.
    for (const language of ['es', 'ar'] as const) expect(createTranslator(language).t('home.headline')).toBe(ENGLISH.home.headline);
    expect(createTranslator('de').t('home.headline')).toBe(de.home.headline);
    expect(createTranslator('fr').t('home.headline')).toBe(fr.home.headline);
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
    const custom: Record<Language, PartialMessages> = { ...CATALOGS, ar: { ats: { toCheck: { other: '{count} x' }, issues: { zero: 'z', one: 'o', two: 't', few: 'f', many: 'm', other: 'x' } } } };
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

// --- Phase 13A: English catalog hardening ---

/** Every coded text in a value (recursively, including coded parameters). */
const codesIn = (value: unknown, out: AnalysisText[] = []): AnalysisText[] => {
  if (Array.isArray(value)) for (const v of value) codesIn(v, out);
  else if (value && typeof value === 'object') {
    if (typeof (value as AnalysisText).code === 'string') {
      out.push(value as AnalysisText);
      for (const p of Object.values((value as AnalysisText).params ?? {})) codesIn(p, out);
    } else for (const v of Object.values(value)) codesIn(v, out);
  }
  return out;
};
/** Each `{ x, xText }` pair in a report: the English string next to its code. */
const pairsIn = (value: unknown, out: [string, AnalysisText][] = []): [string, AnalysisText][] => {
  if (Array.isArray(value)) for (const v of value) pairsIn(v, out);
  else if (value && typeof value === 'object' && typeof (value as AnalysisText).code !== 'string') {
    const record = value as Record<string, unknown>;
    for (const [key, v] of Object.entries(record)) {
      if (key === 'strengthTexts') (v as AnalysisText[]).forEach((s, i) => out.push([(record.strengths as string[])[i], s]));
      else if (key.endsWith('Text') && v && typeof v === 'object') out.push([record[key.slice(0, -4)] as string, v as AnalysisText]);
      else pairsIn(v, out);
    }
  }
  return out;
};
const englishLeaf = (code: string) => code.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);

describe('English catalog hardening', () => {
  const reports = () => {
    const resumes = [SAMPLE_RESUME, emptyResume(), ...Object.values(ATS_STRONG), ...Object.values(ATS_WEAK), ...Object.values(ATS_EDGE), ...Object.values(JOB_RESUMES)];
    const out: unknown[] = [];
    for (const data of resumes) {
      out.push(scoreResume(normalizeResumeData(data), 'en'));
      for (const t of TEMPLATES) out.push(checkAtsReadability(data, t.id, 'en'));
    }
    for (const data of Object.values(JOB_RESUMES)) for (const jd of Object.values(JDS)) out.push(analyzeJobMatch(data, jd, 'en'));
    for (const entry of [...COACH_STRONG, ...COACH_WEAK]) out.push(analyzeText(entry.text, buildCoachContext(entry.field, 'en', entry.siblings ?? [])));
    return out;
  };

  it('every code the engines emit exists in the English catalog, and renders to the English they return', () => {
    const all = reports();
    const codes = new Set(codesIn(all).map((c) => c.code));
    expect(codes.size).toBeGreaterThan(80);
    for (const code of codes) {
      const leaf = englishLeaf(code);
      expect(typeof leaf === 'string' || (typeof leaf === 'object' && leaf !== null && 'other' in leaf), code).toBe(true);
    }
    const pairs = pairsIn(all);
    expect(pairs.length).toBeGreaterThan(1000);
    for (const [message, coded] of pairs) {
      expect(englishText(coded), coded.code).toBe(message);
      expect(message, coded.code).not.toMatch(/\{\w+\}/);
    }
  });

  it('coded errors render the exact English message', () => {
    const errors: { error: Error & { messageText: AnalysisText }; formatNumbers?: boolean }[] = [];
    try {
      analyzeJobMatch(SAMPLE_RESUME, 'x'.repeat(JOB_DESCRIPTION_MAX + 1), 'en');
    } catch (error) {
      errors.push({ error: error as JobDescriptionTooLongError, formatNumbers: true });
    }
    for (const run of [() => analyzeText('x'.repeat(COACH_LIMITS.maxTextLength + 1), buildCoachContext('tagline', 'en')), () => analyzeText(1 as unknown as string, buildCoachContext('tagline', 'en'))]) {
      try {
        run();
      } catch (error) {
        errors.push({ error: error as CoachInputError });
      }
    }
    errors.push({ error: new CoachStaleFindingError() }, { error: new CoachFixRejectedError('no_fix') });
    expect(errors).toHaveLength(5);
    expect(errors[0].error.message).toContain('25,000');
    for (const { error, formatNumbers } of errors) {
      expect(typeof englishLeaf(error.messageText.code), error.messageText.code).not.toBe('undefined');
      expect(englishText(error.messageText, { formatNumbers })).toBe(error.message);
    }
    // The UI shows the code in the app language, else the error's own text.
    const { t } = createTranslator('en');
    expect(errorText(t, new CoachStaleFindingError(), 'coach.failed')).toBe(new CoachStaleFindingError().message);
    expect(errorText(t, new Error('Disk full'), 'coach.failed')).toBe('Disk full');
    expect(errorText(t, 'boom', 'coach.failed')).toBe(t('coach.failed'));
  });

  it('analysis codes follow the analysis/errors namespaces; parameters are values or codes, never English sentences', () => {
    // English words the rules used to splice into sentences are now codes of their own.
    const sentences = new Set(JSON.stringify(en.analysis).match(/"[^"{}]*\s[^"{}]*"/g)!.map((v) => v.slice(1, -1)));
    for (const coded of codesIn(reports())) {
      expect(coded.code, coded.code).toMatch(/^(analysis|errors|templates)\./);
      for (const param of Object.values(coded.params ?? {})) {
        if (typeof param === 'string') expect(sentences.has(param), `${coded.code}: ${param}`).toBe(false);
      }
    }
  });

  it('keys are unique; a value is shared only where the context differs (pinned)', () => {
    const leaves = (node: unknown, prefix = ''): [string, string][] =>
      typeof node === 'object' && node !== null && !('other' in node)
        ? Object.entries(node).flatMap(([k, v]) => leaves(v, `${prefix}${k}.`))
        : [[prefix.slice(0, -1), JSON.stringify(node)]];
    const all = leaves(en);
    expect(new Set(all.map(([k]) => k)).size).toBe(all.length);
    const byValue = new Map<string, string[]>();
    for (const [key, value] of all) byValue.set(value, [...(byValue.get(value) ?? []), key]);
    const shared = [...byValue.values()].filter((keys) => keys.length > 1).map((keys) => keys.join(' | ')).sort();
    // Document labels, editor fields and analysis locations are separate contexts: a
    // translation may word them differently (e.g. a PDF heading vs. a form label).
    expect(shared).toEqual([
      'analysis.location.field.name | analysis.ats.detected.name',
      'ats.separator | match.separator',
      'check.attention | check.status.needsAttention',
      'check.improve | ats.improve',
      'editor.fields.certifications.date | analysis.location.field.date',
      'editor.fields.certifications.org | analysis.location.field.organization',
      'editor.fields.education.degree | analysis.location.field.degree',
      'editor.fields.education.school | analysis.location.field.school',
      'editor.fields.experience.bullets | editor.fields.projects.bullets',
      'editor.fields.experience.bulletsAdd | editor.fields.projects.bulletsAdd',
      'editor.fields.experience.company | letter.company | analysis.location.field.company',
      'editor.fields.experience.end | analysis.location.field.endDate',
      'editor.fields.experience.start | analysis.location.field.startDate',
      'editor.fields.experience.title | analysis.location.field.jobTitle',
      'editor.fields.personal.email | analysis.location.email | analysis.ats.detected.email',
      'editor.fields.personal.linkedin | analysis.location.linkedin',
      'editor.fields.personal.location | editor.fields.experience.location | editor.fields.education.location | analysis.location.location | analysis.location.field.location | analysis.ats.detected.location',
      'editor.fields.personal.name | analysis.location.name',
      'editor.fields.personal.phone | analysis.location.phone | analysis.ats.detected.phone',
      'editor.fields.personal.website | analysis.location.website',
      'editor.fields.projects.description | analysis.location.field.shortDescription',
      'editor.fields.projects.name | analysis.location.field.projectName',
      'editor.fields.summary.skills | analysis.location.section.skills',
      'home.templateA11y | gallery.cardA11y',
      'match.jdLabel | match.sections.general',
      'nav.import | home.importText',
      'nav.preview | editor.preview',
      'nav.tools | editor.tools',
      'resume.labels.awards | editor.sections.awards',
      'resume.labels.certifications | editor.sections.certifications',
      'resume.labels.education | editor.sections.education | analysis.location.section.education',
      'resume.labels.experience | editor.sections.experience | analysis.location.section.experience',
      'resume.labels.projects | editor.sections.projects',
    ]);
  });

  it('template metadata: 12 designs, each with id, categoryKey, nameKey and descriptionKey in the catalog', () => {
    expect(TEMPLATES).toHaveLength(12);
    const { t } = createTranslator('en');
    for (const template of TEMPLATES) {
      expect(template.nameKey).toBe(`templates.${template.id}.name`);
      expect(template.shortNameKey).toBe(`templates.${template.id}.shortName`);
      expect(template.descriptionKey).toBe(`templates.${template.id}.description`);
      expect(template.categoryKey).toBe(`templates.categories.${template.category}`);
      for (const key of [template.nameKey, template.shortNameKey, template.descriptionKey, template.categoryKey]) {
        expect(typeof englishLeaf(key), key).toBe('string');
        expect(t(key as MessageKey)).not.toBe(key);
      }
    }
    // No per-language template definitions: one registry, display text only in catalogs.
    expect(read('domain/templates/templates.ts')).not.toMatch(/\b(de|fr|es|ar):\s*\{/);
  });

  it('counts go through plural messages; no manual English plural concatenation remains', () => {
    const sources = [...uiFilesOf(join(SRC, 'features')), ...uiFilesOf(join(SRC, 'domain')), ...uiFilesOf(join(SRC, 'app'))];
    for (const file of sources) {
      const source = readFileSync(file, 'utf8');
      expect(source, relative(SRC, file)).not.toMatch(/===?\s*1\s*\?\s*(''|"")\s*:\s*['"]s['"]|!==?\s*1\s*\?\s*['"]s['"]/);
    }
    const plural = (key: MessageKey) => englishLeaf(key) as Record<string, string>;
    for (const key of ['ats.toCheck', 'ats.issues', 'match.alsoFound', 'match.mentionLines', 'analysis.score.warnings.shortBullets', 'analysis.coach.repeatedOpener', 'analysis.coach.longBullet', 'errors.jobDescriptionTooLong', 'errors.coachTextTooLong'] as MessageKey[]) {
      expect(Object.keys(plural(key)).sort(), key).toEqual(['one', 'other']);
    }
    const { t } = createTranslator('en');
    expect(t('match.mentionLines', { count: 1 })).toBe(' (1 line)');
    expect(t('match.mentionLines', { count: 3 })).toBe(' (3 lines)');
  });

  it('app-generated numbers are formatted by the app language; user text is not', () => {
    expect(createTranslator('en').t('match.charCount', { count: 1234, max: 25000 })).toBe('1,234 / 25,000');
    withCatalog('de', { match: { charCount: '{count} / {max}' } }, () => {
      expect(createTranslator('de').t('match.charCount', { count: 1234, max: 25000 })).toBe('1.234 / 25.000');
    });
    expect(createTranslator('de').t('home.deleteBody', { title: 'Jan 2020 – 1234' })).toContain('Jan 2020 – 1234');
  });

  it('resume labels have one catalog source, shared by PDF and DOCX', async () => {
    expect(Object.keys(en.resume.labels).sort()).toEqual(['awards', 'certifications', 'education', 'experience', 'previewWatermark', 'projects', 'resume', 'summary']);
    expect(resumeLabels('en')).toEqual(en.resume.labels);
    for (const file of ['domain/render/render-html.ts', 'domain/render/export-docx.ts']) {
      const source = read(file);
      expect(source, file).toMatch(/resumeLabels\(/);
      expect(source, file).not.toMatch(/['"](Professional Summary|Summary|Experience|Education|Certifications|Projects|Awards)['"]/);
    }
    expect(read('domain/i18n/resume-labels.ts')).not.toMatch(/'(Summary|Experience|Education)'/);
    const docx = await docxText('en');
    for (const key of ['summary', 'experience', 'education', 'certifications', 'projects', 'awards'] as const) {
      expect(docx).toContain(`>${en.resume.labels[key].toUpperCase()}<`);
    }
  });

  it('Case A — app German, resume English: UI from the German catalog (English fallback); document stays English', async () => {
    await withCatalog('de', { home: { create: 'Lebenslauf erstellen' }, analysis: { score: { categories: { content: 'Inhalt' } } } }, async () => {
      const { t } = createTranslator('de');
      expect(t('home.create')).toBe('Lebenslauf erstellen');
      expect(t('home.seeAll')).toBe('See all'); // fallback
      // Analysis of the English resume is shown in the app language.
      const report = scoreResume(SAMPLE_RESUME, 'en');
      expect(report.categories.map((c) => renderText(t, c.labelText))[0]).toBe('Inhalt');
      const page = html('en');
      expect(page).toContain('<html lang="en" dir="ltr">');
      expect(headingsIn(page)).toEqual(['Summary', 'Experience', 'Education', 'Certifications', 'Projects', 'Awards']);
      expect(await docxText('en')).toContain('>EXPERIENCE<');
    });
  });

  it('Case B — app English, resume German: UI English; document labels from the German catalog (English fallback)', async () => {
    await withCatalog('de', { resume: { labels: { experience: 'Berufserfahrung' } }, home: { create: 'Lebenslauf erstellen' } }, async () => {
      expect(createTranslator('en').t('home.create')).toBe('Create my resume');
      const page = html('de');
      expect(page).toContain('<html lang="de" dir="ltr">');
      expect(headingsIn(page)).toEqual(['Summary', 'Berufserfahrung', 'Education', 'Certifications', 'Projects', 'Awards']);
      const docx = await docxText('de');
      expect(docx).toContain('>BERUFSERFAHRUNG<');
      expect(docx).toContain('>EDUCATION<');
    });
    // (A partial German catalog is swapped in above, so the English fallback is visible.)
  });

  it('migration v4 leaves local_profile untouched and is idempotent', async () => {
    const dir = tempDir();
    const db = openTestDatabase(dir.file('app.db'));
    await migrate(db, MIGRATIONS.slice(0, 3), { now: 1, legacyResumesJson: null });
    db.raw.prepare('INSERT OR REPLACE INTO local_profile (id, name, email, phone, location, headline, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?)').run('Ada', 'a@b.c', '1', 'Paris', 'Engineer', 7);
    db.raw.prepare(
      'INSERT INTO resumes (id, title, template_id, accent, data_json, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('a', 'First', 'tech-builder', '#3B5168', JSON.stringify(SAMPLE_RESUME), 1, 10, 20);
    const profile = db.raw.prepare('SELECT * FROM local_profile').all();
    const snapshot = () => ({
      resumes: db.raw.prepare('SELECT * FROM resumes ORDER BY id').all(),
      profile: db.raw.prepare('SELECT * FROM local_profile').all(),
      settings: db.raw.prepare('SELECT * FROM app_settings').all(),
    });
    expect((await migrate(db, MIGRATIONS, { now: 1, legacyResumesJson: null })).applied).toEqual([4]);
    const after = snapshot();
    expect(after.profile).toEqual(profile);
    // Re-running is a no-op and changes nothing.
    expect(await migrate(db, MIGRATIONS, { now: 2, legacyResumesJson: null })).toEqual({ from: 4, to: 4, applied: [] });
    expect(snapshot()).toEqual(after);
    await db.close();
    dir.cleanup();
  });

  it('the 12 gallery thumbnails are the committed images, unchanged', () => {
    // sha256 of each PNG as captured at commit 5b9e5db (before localization).
    const PNG: Record<string, string> = {
      'academic-researcher': 'de5fbe4e12f0337a9bdc31f7ac2614747c6e175790ed5c9d723a45b8da40e40e',
      'academic-scholar': 'fb75e838f3df2d5c0bcf9cf4821d1533973469f4530eebd9dff3ebdedbb992d0',
      'corporate-boardroom': 'cc7c7a1f851ac43797d067b3de62d4c7e32c124fd9c8d43ab7f12d03efe0b3b1',
      'corporate-partner': '7adf19126cbc5a54c900b367f0be9b964949c04aa547cf0c1a4cf9d2b9307d99',
      'creative-editorial': '417fec9d37ce8a0968da5306eb4fc9e52ffc6ce0be88561b9877315005ee5bda',
      'creative-studio': 'c9d6f181a636240e92d878feb38897689e9d44790e02fc05969758ebc78f9f15',
      'healthcare-educator': 'fb8b47bcc3c67b46db5940f7c367dd4bd5144b6208cb91ccde4394c9a2ee24c9',
      'healthcare-practitioner': '588466fadec88895bedb9b76da481108d46fb2c0bc4c7ccfbe7737a45f67e1bb',
      'tech-architect': 'e0da2dc4457c2104ccccb42bd23237e20e61490484ee4ecc658eb319825cbd70',
      'tech-builder': 'eff1094acec28e8ede0bee899da9cbb12a8e8bdb7fe207e67b904826f4530f48',
      'trades-foreman': 'fa1a497df8e276b46a557308f8563c13930f37ce9ddf751a4a3ab0d5cc0842dd',
      'trades-operator': 'a60daf9afb9d1ab46494313603f2064e4e0a04331a372a7d316e691612f895dc',
    };
    expect(Object.keys(PNG).sort()).toEqual(TEMPLATES.map((t) => t.id).sort());
    for (const [id, sha] of Object.entries(PNG)) {
      expect(createHash('sha256').update(readFileSync(join(SRC, '..', 'assets', 'templates', `${id}.png`))).digest('hex'), id).toBe(sha);
    }
  });

  const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  it.skipIf(!existsSync(CHROMIUM))(
    'in a real engine: the current English template renders are pixel-identical to the committed thumbnails',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser: Browser = await chromium.launch({ executablePath: CHROMIUM });
      try {
        // Same capture settings as `npm run thumbnails`.
        const page = await browser.newPage({ viewport: { width: 848, height: 1200 }, deviceScaleFactor: 0.625 });
        for (const template of TEMPLATES) {
          await page.setContent(templateSampleHtml(template.id), { waitUntil: 'load' });
          const box = (await page.locator('.page').boundingBox())!;
          const shot = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: Math.round((box.width * 11) / 8.5) } });
          const committed = readFileSync(join(SRC, '..', 'assets', 'templates', `${template.id}.png`));
          expect(Buffer.compare(shot, committed), template.id).toBe(0);
        }
      } finally {
        await browser.close();
      }
    },
    120_000,
  );
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

  // Letters of any script (\p{L}), so German, French, Spanish or Arabic text is caught too.
  /** JSX text, text props, alerts and navigation titles written in a screen instead of the catalog. */
  const jsxProblems = (raw: string): string[] => {
    const source = raw.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
    const problems: string[] = [];
    // JSX text with words: text right after a JSX tag (<Text ...>, </View>, <>), not TS generics or code.
    for (const m of source.matchAll(/(?:<\/?[A-Z][\w.]*(?:\s[^<>]*?)?|<|<\/)>([^<>{}]*\p{L}{2,}[^<>{}]*)</gu)) {
      const text = m[1].trim();
      if (text && !/[()=;?]|&&|\|\|/.test(text)) problems.push(`text "${text}"`);
    }
    // Text props as string literals.
    for (const m of source.matchAll(/\b(title|label|placeholder|accessibilityLabel|accessibilityHint|subtitle|addLabel|emptyHint)=(["'])[^"']*\p{L}{2,}[^"']*\2/gu)) {
      problems.push(m[0]);
    }
    for (const m of source.matchAll(/\b(title|label|placeholder|accessibilityLabel|accessibilityHint|subtitle)=\{\s*(['"`])[^'"`]*\p{L}{2,}/gu)) problems.push(m[0]);
    for (const m of source.matchAll(/Alert\.alert\(\s*['"`]/g)) problems.push(m[0]);
    for (const m of source.matchAll(/\btitle:\s*['"`]\p{L}/gu)) problems.push(m[0]);
    return problems;
  };

  it('screens, UI components and routes take visible and accessibility text from the catalog', () => {
    const problems = screens.flatMap((file) => jsxProblems(readFileSync(file, 'utf8')).map((p) => `${relative(SRC, file)}: ${p}`));
    expect(problems).toEqual([]);
  });

  it('the JSX guard catches English and German text', () => {
    for (const line of [
      `<Text>Delete this resume</Text>`,
      `<Text>Vorschau öffnen</Text>`,
      `<Text>Übernehmen</Text>`,
      `<Button title="Löschen" />`,
      `<Field placeholder={'Straße'} />`,
      `<Stack.Screen options={{ title: 'Einstellungen' }} />`,
      `<Text>Créer mon CV</Text>`,
      `<Text>Aperçu du modèle</Text>`,
      `<Button title="Télécharger" />`,
      `<Field placeholder={'Intitulé du poste'} />`,
      `<Stack.Screen options={{ title: 'Paramètres' }} />`,
    ]) {
      expect(jsxProblems(line), line).not.toEqual([]);
    }
    expect(jsxProblems(`<Text>{t('home.create')}</Text>`)).toEqual([]);
  });

  // Literal-level guard: every string literal in UI code must be a catalog key, a technical
  // identifier (route, style key, color, asset, enum value) or developer-only text.
  const literalSources = [
    ...uiFilesOf(join(SRC, 'features')),
    ...uiFilesOf(join(SRC, 'ui')),
    ...uiFilesOf(join(SRC, 'app')),
    join(SRC, 'services', 'storage', 'database-context.tsx'),
    join(SRC, 'services', 'i18n', 'localization.tsx'),
  ];
  const stripComments = (s: string) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/(^|[^:'"`\\])\/\/.*$/gm, (m, p: string) => p + ' '.repeat(m.length - p.length));
  /** Returns the user-visible literals (any language) the guard would reject in `source`. */
  const visibleLiterals = (source: string): string[] => {
    const code = stripComments(source);
    const found: string[] = [];
    for (const m of code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g)) {
      const value = m[2];
      const before = code.slice(Math.max(0, m.index! - 60), m.index);
      const plain = value.replace(/\$\{[^}]*\}/g, ' ').trim();
      if (!/\p{L}{2,}/u.test(plain)) continue;
      if (/\b(from|import|require)\s*\(?\s*$/.test(before)) continue; // module specifiers and assets
      if (/\bt\(\s*$/.test(before)) continue; // catalog keys
      if (/\b(name|href|pathname|testID|key|nativeID)=\{?\s*$/.test(before)) continue; // routes and ids
      if (/\b(console\.\w+|throw new Error)\(\s*$/.test(before)) continue; // developer-only text
      if (/[!=]==\s*$|\bcase\s+$/.test(before)) continue; // enum comparisons
      if (/^#[0-9A-Fa-f]{3,8}$/.test(plain) || /^(about:blank|data:|https?:\/\/)/.test(plain)) continue; // colors, URLs
      // Technical identifiers: keys, style names, paths, CSS values — one lowercase/camel token.
      if (/^[\w.\-/:[\]@ ]*$/.test(plain) && !/\p{L}{2,}\s+\p{L}{2,}/u.test(plain) && !/^(\p{Lu}\p{Ll}+|\p{Lu}{2,})$/u.test(plain)) continue;
      found.push(value);
    }
    return found;
  };

  it('UI code has no user-visible string literals (English, German or other)', () => {
    const problems = literalSources.flatMap((file) => visibleLiterals(readFileSync(file, 'utf8')).map((v) => `${relative(SRC, file)}: ${JSON.stringify(v)}`));
    expect(problems).toEqual([]);
  });

  it('the literal guard catches injected English and ignores technical strings', () => {
    const injected = [
      `<Button title={saving ? 'Saving…' : t('common.save')} />`,
      `Alert.alert(t('x'), 'Are you sure?')`,
      `setError('Something went wrong')`,
      `<Stack.Screen options={{ title: 'Settings' }} />`,
      `const empty = 'No resumes yet';`,
      `<TextInput placeholder={'Job title'} />`,
      `accessibilityLabel={\`Delete \${name}\`}`,
      `const label = 'OK';`,
      // German text is caught the same way (umlauts, ß, single capitalized words).
      `<Button title={'Lebenslauf speichern'} />`,
      `const title = 'Löschen';`,
      `Alert.alert(t('x'), 'Größe prüfen')`,
      `const hint = 'Übernehmen';`,
      // French text is caught the same way (accents, single capitalized words, phrases).
      `const empty = 'Aucun CV pour le moment';`,
      `const title = 'Réessayer';`,
      `Alert.alert(t('x'), 'Êtes-vous sûr ?')`,
      `setError('Une erreur est survenue')`,
    ];
    for (const line of injected) expect(visibleLiterals(line), line).not.toEqual([]);
    const technical = [
      `import { View } from 'react-native';`,
      `const thumb = require('../../../assets/templates/corporate-boardroom.png');`,
      `<Stack.Screen name="resume/[id]/index" />`,
      `router.push('/resume/new');`,
      `const color = '#A3A6AC';`,
      `if (status === 'ready') {}`,
      `t('editor.sections.summary')`,
      `style={styles[\`button_\${variant}\`]}`,
      `console.warn('[storage]', error);`,
      `throw new Error('useDatabase must be used inside DatabaseProvider');`,
      `const uri = 'about:blank';`,
      `const url = 'https://example.com/privacy';`,
      `// 'A comment with words'`,
    ];
    for (const line of technical) expect(visibleLiterals(line), line).toEqual([]);
  });

  it('the old English copy modules are gone', () => {
    for (const path of ['features/editor/editor-copy.ts', 'features/coach/coach-copy.ts', 'features/ats/ats-copy.ts', 'features/job-match/match-copy.ts']) {
      expect(existsSync(join(SRC, path)), path).toBe(false);
    }
  });
});

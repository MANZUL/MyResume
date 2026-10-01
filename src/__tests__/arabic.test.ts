import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { checkAtsReadability } from '../domain/ats/ats';
import { scoreResume } from '../domain/check/resume-score';
import { analyzeText, buildCoachContext } from '../domain/coach/coach';
import { analysisSupport } from '../domain/i18n/analysis-support';
import type { AnalysisText } from '../domain/i18n/analysis-text';
import { formatDate, formatNumber } from '../domain/i18n/format';
import { directionOf, LANGUAGE_NAMES, LANGUAGES, resolveLanguage, toLanguage, type Language } from '../domain/i18n/languages';
import { pluralCategory } from '../domain/i18n/plural';
import { resumeLabels } from '../domain/i18n/resume-labels';
import { typographyFor } from '../domain/i18n/typography';
import { analyzeJobMatch } from '../domain/job-match/job-match';
import { JOB_DESCRIPTION_MAX } from '../domain/job-match/types';
import { buildResumeDocxBase64 } from '../domain/render/export-docx';
import { renderResumeHtml, type PaperSize, type RenderMode } from '../domain/render/render-html';
import { normalizeResumeData } from '../domain/resume/normalize';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import { emptyResume, type ResumeData, type StoredResume } from '../domain/resume/types';
import { fileSafeName } from '../domain/shared/text';
import { templateSampleHtml } from '../domain/templates/sample-preview';
import { TEMPLATE_CATEGORIES, TEMPLATES } from '../domain/templates/templates';
import { errorText, renderText } from '../i18n/analysis';
import { CATALOGS, type PartialMessages } from '../i18n/catalog';
import { ar } from '../i18n/messages/ar';
import { de } from '../i18n/messages/de';
import { en } from '../i18n/messages/en';
import { es } from '../i18n/messages/es';
import { fr } from '../i18n/messages/fr';
import { categoryName, templateText } from '../i18n/templates';
import { createTranslator } from '../i18n/translate';
import { createFileExportPlatform, exportFileName, pdfHtml, type ExportFileSystem, type FileRef } from '../services/export/file-export-platform';
import type { Rasterizer } from '../services/export/rasterizer/rasterizer-bridge';
import { renderPreview } from '../services/preview/preview-service';
import { ResumeLibrary } from '../services/storage/resume-library';
import { initializeDatabase } from '../services/storage/sqlite/database';
import { EDGE as ATS_EDGE, STRONG as ATS_STRONG, WEAK as ATS_WEAK } from './fixtures/ats-corpus';
import { ARABIC_RESUME, ENGLISH_WITH_ARABIC } from './fixtures/arabic-resume';
import { WEAK as COACH_WEAK } from './fixtures/coach-corpus';
import { JDS, RESUMES as JOB_RESUMES } from './fixtures/job-corpus';
import { openTestDatabase, tempDir, testId } from './helpers/node-sqlite';

// Phase 13F: Arabic (ar) localization, RTL and document typography. The analysis rules stay
// English; Arabic is the app language and/or the resume's document language, independently.

const SRC = join(__dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');
const T = {
  ar: createTranslator('ar').t,
  es: createTranslator('es').t,
  fr: createTranslator('fr').t,
  de: createTranslator('de').t,
  en: createTranslator('en').t,
};

type Leaf = string | Record<string, string>;
/** key → value (a string, or a plural object) for every message in a catalog. */
const leaves = (node: unknown, prefix = ''): [string, Leaf][] =>
  typeof node === 'object' && node !== null && !('other' in node)
    ? Object.entries(node).flatMap(([k, v]) => leaves(v, `${prefix}${k}.`))
    : [[prefix.slice(0, -1), node as Leaf]];
const EN = new Map(leaves(en));
const AR = new Map(leaves(ar));
const forms = (value: Leaf) => (typeof value === 'string' ? [value] : Object.values(value));
const params = (value: Leaf) => new Set(forms(value).flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])));
const catalogHash = (catalog: unknown) => createHash('sha256').update(JSON.stringify(leaves(catalog))).digest('hex');
const ARABIC_LETTER = /[ء-ي]/;

const ARABIC_LABELS = ['الملخص', 'الخبرات', 'التعليم', 'الشهادات', 'المشاريع', 'الجوائز'];
const ENGLISH_LABELS = ['Summary', 'Experience', 'Education', 'Certifications', 'Projects', 'Awards'];
const GERMAN_LABELS = ['Kurzprofil', 'Berufserfahrung', 'Ausbildung', 'Zertifikate', 'Projekte', 'Auszeichnungen'];
const FRENCH_LABELS = ['Profil', 'Expérience professionnelle', 'Formation', 'Certifications', 'Projets', 'Distinctions'];
const SPANISH_LABELS = ['Perfil profesional', 'Experiencia', 'Formación', 'Certificaciones', 'Proyectos', 'Premios'];
const headingsIn = (page: string) => [...page.matchAll(/<h2 class="[^"]*">([^<]*)<\/h2>/g)].map((m) => m[1]);
const tileText = (label: string) => encodeURIComponent(`>${label}<`);
const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/;
/** Bidi formatting characters (isolates, embeddings, marks) that must never reach a file name. */
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩؜]/;

const render = (language: Language, templateId = 'corporate-boardroom', mode: RenderMode = 'pdf', extra: { watermark?: boolean; paper?: PaperSize; data?: ResumeData } = {}) =>
  renderResumeHtml(extra.data ?? ARABIC_RESUME, {
    templateId,
    accent: TEMPLATES.find((t) => t.id === templateId)!.defaultAccent,
    mode,
    language,
    watermark: extra.watermark,
    paper: extra.paper,
  });
const docxXml = async (language: Language, templateId = 'corporate-boardroom', data: ResumeData = ARABIC_RESUME) => {
  const templateName = templateText(createTranslator(language).t, templateId).name;
  const zip = await JSZip.loadAsync(Buffer.from(await buildResumeDocxBase64({ data, accent: '#1B2B47', templateName, language }), 'base64'));
  return { body: await zip.file('word/document.xml')!.async('string'), core: await zip.file('docProps/core.xml')!.async('string') };
};
/** The visible text of a DOCX body, with the bidi marks removed. */
const plainText = (body: string) =>
  [...body.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
    .map((m) => m[1])
    .join('')
    .replace(/[‎‏⁦-⁩]/g, '');
const stored = (language: Language, overrides: Partial<StoredResume> = {}): StoredResume => ({
  id: 'r1',
  title: 'سيرتي',
  templateId: 'corporate-boardroom',
  accent: '#1B2B47',
  language,
  data: ARABIC_RESUME,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

// --- catalog ---

// Same in every language on purpose: 03/2020 is a numeric date format that belongs to no language.
const SHARED = ['editor.startPlaceholder'];

describe('Arabic catalog', () => {
  it('has an Arabic value for every English key, and no other keys', () => {
    expect([...AR.keys()].sort()).toEqual([...EN.keys()].sort());
    expect(AR.size).toBe(445);
    for (const [key, value] of AR) for (const form of forms(value)) expect(form.trim(), key).not.toBe('');
    // The runtime catalog is the complete file.
    expect(CATALOGS.ar).toBe(ar);
  });

  it('translates every key; the identical values are only names, technical names and pure formats', () => {
    const identical = [...AR].filter(([key, value]) => JSON.stringify(value) === JSON.stringify(EN.get(key))).map(([key]) => key).sort();
    expect(identical).toEqual(
      [
        // Brand and technical names (LinkedIn, PDF, Word, ATS).
        'analysis.location.linkedin', 'editor.fields.personal.linkedin', 'preview.formats.docx', 'preview.formats.pdf', 'tools.tabs.ats',
        // Pure formats and separators: parameters and punctuation only.
        'analysis.location.inEntry', 'ats.separator', 'ats.statusPrefix', 'check.improveA11y', 'check.outOf', 'editor.listCount',
        'editor.listItem', 'home.templateAndDate', 'match.charCount', 'match.separator',
      ].sort(),
    );
  });

  it('is its own translation: never German, French or Spanish text', () => {
    for (const other of [de, fr, es]) {
      const map = new Map(leaves(other));
      for (const [key, value] of AR) {
        if (JSON.stringify(value) === JSON.stringify(map.get(key)) && !SHARED.includes(key)) expect(JSON.stringify(value), key).toBe(JSON.stringify(EN.get(key)));
      }
    }
    // Every translated value has Arabic letters; only the English-identical values may not.
    for (const [key, value] of AR) {
      // Pure formats (parameters and punctuation only) have no letters to translate.
      if (JSON.stringify(value) === JSON.stringify(EN.get(key)) || SHARED.includes(key) || !/[A-Za-z]/.test(forms(EN.get(key)!).join('').replace(/\{\w+\}/g, ''))) continue;
      for (const form of forms(value)) expect(form, key).toMatch(ARABIC_LETTER);
    }
    const all = [...AR.values()].flatMap(forms).join('\n');
    expect(all).not.toMatch(/Lebenslauf|Vorlage|Créer|Modèle|Currículum|plantilla/);
  });

  it('every message takes exactly the parameters of its English source', () => {
    for (const [key, value] of AR) expect([...params(value)].sort(), key).toEqual([...params(EN.get(key)!)].sort());
  });

  it('is Modern Standard Arabic: no dialect words', () => {
    const all = [...AR.values()].flatMap(forms).join('\n');
    // Sudanese and other dialect markers that must not appear in the app text.
    for (const dialect of [/\bشنو\b/, /\bديل\b/, /\bكدا\b/, /\bليه\b/, /\bعشان\b/, /\bإزاي\b/, /\bدلوقتي\b/, /\bهسي\b/, /\bمنو\b/, /\bشن\b/]) {
      expect(all, String(dialect)).not.toMatch(dialect);
    }
  });

  it('the 10 plural messages carry all six Arabic CLDR categories, and counted forms show the count', () => {
    const plurals = [...AR].filter(([, value]) => typeof value !== 'string');
    expect(plurals.map(([key]) => key).sort()).toEqual([...EN].filter(([, v]) => typeof v !== 'string').map(([k]) => k).sort());
    expect(plurals).toHaveLength(10);
    for (const [key, value] of plurals) {
      expect(Object.keys(value).sort(), key).toEqual(['few', 'many', 'one', 'other', 'two', 'zero']);
      // few, many and other always show the number; one and two use the dual and singular words.
      for (const category of ['few', 'many', 'other']) expect((value as Record<string, string>)[category], `${key}.${category}`).toContain('{count}');
    }
  });

  it('uses Arabic punctuation: no Latin comma, semicolon or question mark; « » in pairs; no straight or curly quotes', () => {
    for (const [key, value] of AR) {
      for (const form of forms(value)) {
        expect(form, key).not.toMatch(/["“”'’]/);
        expect(form, key).not.toMatch(/[,;?]/);
        expect((form.match(/«/g) ?? []).length, key).toBe((form.match(/»/g) ?? []).length);
        expect(form, key).not.toMatch(/«\s|\s»/);
        expect(form, key).not.toMatch(/\s[،؛؟:]/); // no space before Arabic punctuation or a colon
      }
    }
    expect(ar.home.deleteTitle).toBe('حذف السيرة الذاتية؟');
    expect(ar.analysis.coach.measurable).toBe('هل يمكنك إضافة نتيجة قابلة للقياس هنا؟');
    expect(ar.home.deleteBody).toBe('ستتم إزالة «{title}» من هذا الجهاز.');
    expect(ar.match.listSeparator).toBe('، ');
    expect(ar.home.templateA11y).toBe('{name}، {category}. يفتح معاينة أكبر.');
  });

  it('uses one term per concept (terminology map)', () => {
    const all = [...AR.values()].flatMap(forms).join('\n');
    // Rejected alternatives for the chosen terms.
    for (const avoid of [/\bCV\b/, /الريزومي|ريزومه|السي في/, /\bPreview\b|برفيو/, /\bTemplate\b|تمبلت/, /قوالب جاهزة|نموذج السيرة/, /\bPremium\b/i]) {
      expect(all, String(avoid)).not.toMatch(avoid);
    }
    expect(ar.resume.labels.experience).toBe(ar.editor.sections.experience);
    expect(ar.resume.labels.education).toBe(ar.editor.sections.education);
    expect(ar.resume.labels.certifications).toBe(ar.editor.sections.certifications);
    expect(ar.resume.labels.projects).toBe(ar.editor.sections.projects);
    expect(ar.resume.labels.awards).toBe(ar.editor.sections.awards);
    expect(ar.resume.labels.summary).toBe('الملخص');
    expect(ar.analysis.location.section.skills).toBe(ar.editor.fields.summary.skills);
    expect(ar.nav.preview).toBe(ar.editor.preview);
    expect(ar.nav.tools).toBe(ar.editor.tools);
    expect(ar.resume.labels.previewWatermark).toBe(ar.nav.preview);
    expect(ar.resume.labels.resume).toBe('السيرة الذاتية');
    expect(ar.nav.templates).toBe('القوالب');
    expect(ar.editor.fields.summary.skills).toBe('المهارات');
    expect(ar.tools.tabs.letter).toBe('خطاب التقديم');
    expect(ar.tools.tabs.match).toBe('مطابقة الوظيفة');
    // ATS keeps its industry name in Latin letters.
    expect(ar.tools.tabs.ats).toBe('ATS');
    expect(ar.ats.title).toContain('ATS');
  });
});

// --- plurals, numbers, dates ---

describe('Arabic plurals and formatting', () => {
  it('uses the six CLDR categories: zero, one, two, few (3-10), many (11-99), other (100 and fractions)', () => {
    expect([0, 1, 2, 3, 10, 11, 99, 100, 101, 102, 103, 111, 200, 1.5].map((n) => pluralCategory('ar', n))).toEqual([
      'zero', 'one', 'two', 'few', 'few', 'many', 'many', 'other', 'other', 'other', 'few', 'many', 'other', 'other',
    ]);
    // What the engine really supports, independent of our table.
    expect(new Intl.PluralRules('ar').resolvedOptions().pluralCategories.sort()).toEqual(['few', 'many', 'one', 'other', 'two', 'zero']);
  });

  it('every plural message renders the right form for 0, 1, 2, 3, 11 and 100', () => {
    expect([0, 1, 2, 3, 11, 100].map((count) => T.ar('ats.issues', { count }))).toEqual([
      'لا توجد مشكلات محتملة', 'مشكلة محتملة واحدة', 'مشكلتان محتملتان', '3 مشكلات محتملة', '11 مشكلة محتملة', '100 مشكلة محتملة',
    ]);
    expect([0, 1, 2, 3, 11, 100].map((count) => T.ar('ats.toCheck', { count }))).toEqual([
      'لا شيء للمراجعة', 'عنصر واحد للمراجعة', 'عنصران للمراجعة', '3 عناصر للمراجعة', '11 عنصرًا للمراجعة', '100 عنصر للمراجعة',
    ]);
    expect([0, 1, 2, 3, 11, 100].map((count) => T.ar('match.termsDetected', { count }))).toEqual([
      'لم يتم اكتشاف أي مصطلح وظيفي', 'تم اكتشاف مصطلح وظيفي واحد', 'تم اكتشاف مصطلحين وظيفيين', 'تم اكتشاف 3 مصطلحات وظيفية', 'تم اكتشاف 11 مصطلحًا وظيفيًا', 'تم اكتشاف 100 مصطلح وظيفي',
    ]);
    expect([0, 1, 2, 3, 11, 100].map((count) => T.ar('match.mentionLines', { count }))).toEqual([
      ' (بلا أسطر)', ' (سطر واحد)', ' (سطران)', ' (3 أسطر)', ' (11 سطرًا)', ' (100 سطر)',
    ]);
    expect([1, 2, 3, 11].map((count) => T.ar('match.alsoFound', { count }))).toEqual([
      'واحد منها موجود أيضًا في سيرتك الذاتية', 'اثنان منها موجودان أيضًا في سيرتك الذاتية', '3 منها موجودة أيضًا في سيرتك الذاتية', '11 منها موجودًا أيضًا في سيرتك الذاتية',
    ]);
    expect(renderText(T.ar, { code: 'analysis.coach.longBullet', params: { count: 40, max: 32 } })).toBe(
      'تحتوي هذه النقطة على 40 كلمة. اجعلها 32 كلمة أو أقل ليسهل مسح النتيجة.',
    );
    expect(renderText(T.ar, { code: 'analysis.coach.longBullet', params: { count: 2, max: 32 } })).toContain('على كلمتين.');
    expect(renderText(T.ar, { code: 'analysis.score.warnings.shortBullets', params: { count: 2 } })).toBe('يمكن تقوية نقطتي خبرة.');
    expect(renderText(T.ar, { code: 'analysis.score.warnings.shortBullets', params: { count: 5 } })).toBe('يمكن تقوية 5 نقاط خبرة.');
    expect(renderText(T.ar, { code: 'analysis.coach.repeatedOpener', params: { count: 2, word: 'Led' } })).toContain('نقطتان في هذا الإدخال تبدآن بـ');
    expect(T.ar('errors.jobDescriptionTooLong', { count: JOB_DESCRIPTION_MAX })).toBe('هذا الوصف الوظيفي طويل جدًا (الحد الأقصى 25,000 محرف).');
    expect(T.ar('errors.coachTextTooLong', { count: 2 })).toContain('محرفان');
    expect(T.ar('errors.coachTextTooLong', { count: 3 })).toContain('3 محارف');
    expect(T.ar('errors.coachTextTooLong', { count: 11 })).toContain('11 محرفًا');
  });

  it('numbers use Latin digits with a stable separator: 0, 1, 2, 3, 11, 100, 1,234, 25,000, 1,234,567', () => {
    const shown = [0, 1, 2, 3, 11, 100, 1234, 25000, 1234567].map((n) => formatNumber('ar', n));
    expect(shown).toEqual(['0', '1', '2', '3', '11', '100', '1,234', '25,000', '1,234,567']);
    for (const text of shown) expect(text).not.toMatch(ARABIC_INDIC_DIGITS);
    expect(T.ar('match.charCount', { count: 1234, max: JOB_DESCRIPTION_MAX })).toBe('1,234 / 25,000');
    expect(T.ar('check.outOf')).toBe(' / 100');
    expect(T.ar('share.page', { title: 'CV', index: 2, count: 3 })).toBe('⁨CV⁩ (الصفحة 2 من 3)');
  });

  it('dates the app writes use Arabic month names and Latin digits; a user date is shown exactly as typed', () => {
    expect(formatDate('ar', Date.UTC(2026, 2, 15, 12))).toBe('15 مارس 2026');
    expect(formatDate('ar', Date.UTC(2026, 2, 15, 12))).not.toMatch(ARABIC_INDIC_DIGITS);
    const page = render('ar');
    expect(page).toContain('03/2020');
    expect(page).toContain('Present');
    expect(page).not.toMatch(ARABIC_INDIC_DIGITS);
    // A user who typed Arabic-Indic digits keeps them.
    const typed = { ...ARABIC_RESUME, experience: [{ ...ARABIC_RESUME.experience[0], start: '٢٠٢٠', end: 'الحاضر' }] };
    const typedPage = render('ar', 'corporate-boardroom', 'pdf', { data: typed });
    expect(typedPage).toContain('٢٠٢٠');
    expect(typedPage).toContain('الحاضر');
  });

  it('every number in an Arabic message is Latin: no Arabic-Indic digits in the catalog', () => {
    expect([...AR.values()].flatMap(forms).join('\n')).not.toMatch(ARABIC_INDIC_DIGITS);
  });
});

// --- template metadata ---

describe('Arabic template metadata', () => {
  it('names, short names, descriptions and categories are Arabic for all 12 templates; ids unchanged', () => {
    expect(TEMPLATES).toHaveLength(12);
    const names = new Set<string>();
    const shortNames = new Set<string>();
    for (const template of TEMPLATES) {
      const arabic = templateText(T.ar, template.id);
      for (const field of ['name', 'shortName', 'description'] as const) {
        for (const other of [T.en, T.de, T.fr, T.es]) expect(arabic[field], `${template.id} ${field}`).not.toBe(templateText(other, template.id)[field]);
        expect(arabic[field]).not.toMatch(/^templates\./);
        expect(arabic[field], `${template.id} ${field}`).toMatch(ARABIC_LETTER);
      }
      expect(arabic.category).toBe(ar.templates.categories[template.category as keyof typeof ar.templates.categories]);
      names.add(arabic.name);
      shortNames.add(arabic.shortName);
    }
    expect(names.size).toBe(12);
    expect(shortNames.size).toBe(12);
    expect(TEMPLATE_CATEGORIES.map((c) => categoryName(T.ar, c))).toEqual(['الشركات', 'التقنية', 'الإبداع', 'الرعاية الصحية', 'الأكاديمي', 'المهن الفنية']);
    expect(TEMPLATES.map((t) => t.id)).toEqual([
      'corporate-boardroom', 'corporate-partner', 'tech-builder', 'tech-architect', 'creative-editorial', 'creative-studio',
      'healthcare-practitioner', 'healthcare-educator', 'academic-scholar', 'academic-researcher', 'trades-operator', 'trades-foreman',
    ]);
  });

  it('the DOCX title uses the Arabic template name for an Arabic resume', async () => {
    expect((await docxXml('ar', 'trades-foreman')).core).toContain('رئيس العمال');
    expect((await docxXml('en', 'trades-foreman')).core).toContain('The Foreman');
  });
});

// --- resume documents ---

describe('Arabic resume documents', () => {
  it('the canonical labels resolve to Arabic (one source for PDF, preview and DOCX)', () => {
    expect(resumeLabels('ar')).toEqual({
      summary: 'الملخص',
      experience: 'الخبرات',
      education: 'التعليم',
      certifications: 'الشهادات',
      projects: 'المشاريع',
      awards: 'الجوائز',
      resume: 'السيرة الذاتية',
      previewWatermark: 'معاينة',
    });
    expect(resumeLabels('ar')).toEqual(ar.resume.labels);
  });

  it('every template, PDF and preview, Letter and A4, with and without watermark: Arabic headings, lang="ar", dir="rtl"', () => {
    for (const t of TEMPLATES) {
      for (const mode of ['pdf', 'preview'] as const) {
        for (const watermark of [false, true]) {
          for (const paper of ['letter', 'a4'] as const) {
            const page = render('ar', t.id, mode, { watermark, paper });
            const where = `${t.id} ${mode} ${watermark} ${paper}`;
            expect(page, where).toContain('<html lang="ar" dir="rtl">');
            expect(headingsIn(page), where).toEqual(ARABIC_LABELS);
            expect(page, where).toContain('/*rtl*/');
            expect(page.includes(tileText('معاينة')), where).toBe(mode === 'preview' && watermark);
            expect(page, where).not.toContain(tileText('PREVIEW'));
          }
        }
      }
    }
    expect(render('ar', 'tech-builder', 'pdf', { data: { ...emptyResume() } })).toContain('<title>السيرة الذاتية</title>');
  });

  it('the DOCX has the same Arabic headings for every template, and no English, German, French or Spanish labels', async () => {
    for (const t of TEMPLATES) {
      const { body } = await docxXml('ar', t.id);
      for (const label of ARABIC_LABELS) expect(body, `${t.id} ${label}`).toContain(`>${label}<`);
      for (const label of [...ENGLISH_LABELS, ...GERMAN_LABELS, ...FRENCH_LABELS, ...SPANISH_LABELS]) {
        expect(body, `${t.id} ${label}`).not.toContain(`>${label.toUpperCase()}<`);
      }
    }
  });

  it('the app preview is clean (free product) and in the resume language; the PDF HTML too', () => {
    const shown = renderPreview(stored('ar'));
    expect(shown).toContain('<html lang="ar" dir="rtl">');
    expect(headingsIn(shown)).toEqual(ARABIC_LABELS);
    expect(shown).not.toContain('class="watermark"');
    expect(shown).not.toContain(tileText('معاينة'));
    const printed = pdfHtml(stored('ar'), 'a4');
    expect(headingsIn(printed)).toEqual(ARABIC_LABELS);
    expect(printed).not.toContain('class="watermark"');
  });

  it('an English resume with Arabic text stays left-to-right (the language decides, not the characters)', () => {
    const page = render('en', 'tech-builder', 'pdf', { data: ENGLISH_WITH_ARABIC });
    expect(page).toContain('<html lang="en" dir="ltr">');
    expect(page).not.toContain('/*rtl*/');
    expect(page).not.toContain('<bdi');
    expect(page).toContain('Software engineer (مهندس برمجيات) with 8 years of experience');
  });
});

// --- Arabic typography ---

describe('Arabic document typography', () => {
  it('no uppercase, small caps, tracking or italics in an Arabic document, for any template', () => {
    expect(typographyFor('ar')).toMatchObject({ script: 'arabic', direction: 'rtl', caseTransforms: false, smallCaps: false, letterSpacing: false, italics: false });
    for (const t of TEMPLATES) {
      const page = render('ar', t.id);
      expect(page, t.id).toMatch(/\.upper, h1, h2 \{ text-transform: none !important; \}/);
      expect(page, t.id).toMatch(/letter-spacing: 0 !important; font-variant: normal !important;/);
      expect(page, t.id).toMatch(/\.italic \{ font-style: normal !important; \}/);
      expect(page, t.id).toContain("'Geeza Pro', 'Noto Naskh Arabic'");
    }
  });

  it('DOCX: no character spacing, caps, small caps or italics in any template; Arabic font set for complex script', async () => {
    for (const t of TEMPLATES) {
      const { body } = await docxXml('ar', t.id);
      // Italics are explicitly switched off (w:val="false"), never on.
      expect(body, t.id).not.toMatch(/<w:caps\b|<w:smallCaps\b|<w:i\/>|<w:iCs\/>|<w:i w:val="(true|1)"/);
      expect(body, t.id).not.toMatch(/<w:spacing w:val="\d+"\/>/);
      expect(body, t.id).toContain('<w:bidi/>');
      expect(body, t.id).toContain('<w:rtl/>');
    }
    const zip = await JSZip.loadAsync(Buffer.from(await buildResumeDocxBase64({ data: ARABIC_RESUME, accent: '#1B2B47', templateName: 'x', language: 'ar' }), 'base64'));
    const styles = await zip.file('word/styles.xml')!.async('string');
    expect(styles).toMatch(/w:cs="Times New Roman"/);
  });

  it('the Arabic comma separates what the app joins itself; Latin documents keep the Latin comma', () => {
    const arabic = render('ar', 'corporate-boardroom');
    expect(arabic).toContain('<bdi>Acme Corp</bdi>\u060C <bdi>Berlin</bdi>');
    expect(arabic).toContain('<bdi>شركة الأفق</bdi>\u060C <bdi>دبي</bdi>');
    const english = render('en', 'corporate-boardroom', 'pdf', { data: ENGLISH_WITH_ARABIC });
    expect(english).toContain('Acme Corp, Berlin');
  });
});

// --- mixed-direction safety ---

describe('mixed Arabic and English content never reorders', () => {
  it('HTML: phone, e-mail and URLs are LTR isolates; Latin skills and numbers are isolated; user data is verbatim', () => {
    for (const t of TEMPLATES) {
      const page = render('ar', t.id);
      expect(page, t.id).toContain('<bdi dir="ltr">+49 170 1234567</bdi>');
      expect(page, t.id).toContain('<bdi dir="ltr">mohamed.ahmed@example.com</bdi>');
      expect(page, t.id).toContain('<bdi dir="ltr">linkedin.com/in/mohamed-ahmed</bdi>');
      expect(page, t.id).toContain('<bdi dir="ltr">example.com/profile</bdi>');
      expect(page, t.id).toContain('<bdi>C++</bdi>');
      expect(page, t.id).toContain('<bdi>.NET</bdi>');
      expect(page, t.id).toContain('<bdi>AWS</bdi>');
      expect(page, t.id).toContain('<bdi>03/2020</bdi>');
      expect(page, t.id).toContain('<bdi>Reduced latency by 35% using AWS Lambda.</bdi>');
      expect(page, t.id).toContain('<bdi>محمد أحمد</bdi>');
      // Digits are exactly what the user typed: Latin, no conversion.
      expect(page, t.id).not.toMatch(ARABIC_INDIC_DIGITS);
      expect(page, t.id).toContain('35%');
      expect(page, t.id).toContain('C++17');
      expect(page, t.id).toContain('<bdi dir="ltr">https://shop.example.com</bdi>.');
    }
  });

  it('HTML: user text is escaped, never rewritten', () => {
    const data = { ...ARABIC_RESUME, name: 'محمد <b>أحمد</b> & Co', summary: { ...ARABIC_RESUME.summary, tagline: 'A&B "x" <script>' } };
    const page = render('ar', 'tech-builder', 'pdf', { data });
    expect(page).not.toMatch(/<b>|<script>/);
    expect(page).toContain('<bdi>محمد &lt;<bdi dir="ltr">b</bdi>&gt;أحمد&lt;/<bdi dir="ltr">b</bdi>&gt; &amp; <bdi dir="ltr">Co</bdi></bdi>');
    expect(page).not.toContain('<script>');
  });

  it('DOCX: contact parts and dates are LTR isolates; Latin free text carries LRM marks; Arabic text is unmarked', async () => {
    for (const t of TEMPLATES) {
      const { body } = await docxXml('ar', t.id);
      expect(body, t.id).toContain('⁦+49 170 1234567⁩');
      expect(body, t.id).toContain('⁦mohamed.ahmed@example.com⁩');
      expect(body, t.id).toContain('\u2066https://linkedin.com/in/mohamed-ahmed\u2069');
      expect(body, t.id).toContain('‎Reduced latency by 35% using AWS Lambda.‎');
      expect(body, t.id).toContain('‎Acme Corp‎');
      // Skills keep their reading order: each separator is bracketed by RLM.
      expect(body, t.id).toContain('\u200EJavaScript\u200E\u200F  -  \u200F\u200ETypeScript\u200E');
      expect(body, t.id).toContain('>تصميم خدمات \u200EREST\u200E و\u200EGraphQL\u200E باستخدام \u200ETypeScript\u200E.<');
      expect(body, t.id).not.toMatch(ARABIC_INDIC_DIGITS);
      // Text, once the marks are removed, is exactly the user's.
      const text = plainText(body);
      for (const piece of ['mohamed.ahmed@example.com', '+49 170 1234567', 'C++', '.NET', 'AWS Certified Solutions Architect', 'تطوير محرك رسوميات بلغة C++17 يدعم 60 FPS.']) {
        expect(text, `${t.id} ${piece}`).toContain(piece);
      }
    }
  });

  it('DOCX: every paragraph of an Arabic document is right-to-left; bullets use a right-to-left list', async () => {
    const { body } = await docxXml('ar', 'tech-builder');
    const paragraphs = body.match(/<w:p>[\s\S]*?<\/w:p>|<w:p [\s\S]*?<\/w:p>/g) ?? [];
    expect(paragraphs.length).toBeGreaterThan(20);
    for (const p of paragraphs.filter((x) => /<w:t[ >]/.test(x))) expect(p).toContain('<w:bidi/>');
    expect(body).toMatch(/<w:numPr>/);
  });

  it('DOCX: a left-to-right document is unchanged by the Arabic work (no marks, no bidi)', async () => {
    const { body } = await docxXml('en', 'tech-builder', ENGLISH_WITH_ARABIC);
    expect(body).not.toMatch(/<w:bidi\/>|<w:rtl\/>|[‎⁦-⁩]/);
  });
});

// --- language separation ---

describe('app language and resume language never leak into each other', () => {
  type Shown = 'en' | 'de' | 'fr' | 'es' | 'ar';
  const combos: [Shown, Shown][] = [
    ['ar', 'ar'], // A: Arabic UI + Arabic document
    ['ar', 'en'], // B: Arabic UI + English document
    ['en', 'ar'], // C: English UI + Arabic document
    ['de', 'ar'], // D: German UI + Arabic document
    ['fr', 'ar'], // E: French UI + Arabic document
    ['es', 'ar'], // F: Spanish UI + Arabic document
  ];
  const UI = {
    en: { create: 'Create my resume', preview: 'Preview', builder: 'The Builder', content: 'Content' },
    de: { create: 'Lebenslauf erstellen', preview: 'Vorschau', builder: 'Der Baustein', content: 'Inhalt' },
    fr: { create: 'Créer mon CV', preview: 'Aperçu', builder: 'Le Bâtisseur', content: 'Contenu' },
    es: { create: 'Crear mi currículum', preview: 'Vista previa', builder: 'El Constructor', content: 'Contenido' },
    ar: { create: 'أنشئ سيرتي الذاتية', preview: 'معاينة', builder: 'البنّاء', content: 'المحتوى' },
  } as const;
  const DOC = {
    en: { headings: ENGLISH_LABELS, experience: 'EXPERIENCE', builder: 'The Builder', dir: 'ltr' },
    ar: { headings: ARABIC_LABELS, experience: 'الخبرات', builder: 'البنّاء', dir: 'rtl' },
  } as const;

  it.each(combos)('app %s, resume %s', async (app, resumeLanguage) => {
    const dir = tempDir();
    const db = openTestDatabase(dir.file('app.db'));
    const store = await initializeDatabase(db, { newId: testId });
    await store.settings.setAppLanguage(app);
    const library = new ResumeLibrary(store.resumes, { newId: testId, defaultLanguage: () => app });
    const resume = library.create(ARABIC_RESUME, 'CV', 'tech-builder', resumeLanguage);
    await library.flush();

    // UI: the app language only (and its direction).
    const savedApp = (await store.settings.getAppLanguage())!;
    expect(directionOf(savedApp)).toBe(app === 'ar' ? 'rtl' : 'ltr');
    const { t } = createTranslator(savedApp);
    expect(t('home.create')).toBe(UI[app].create);
    expect(t('nav.preview')).toBe(UI[app].preview);
    expect(templateText(t, 'tech-builder').name).toBe(UI[app].builder);
    const score = scoreResume(resume.data, resume.language);
    expect(renderText(t, score.categories[0].labelText)).toBe(UI[app].content);

    // Document: the resume language only (and its direction).
    const doc = DOC[resumeLanguage as 'en' | 'ar'];
    const saved = (await store.resumes.get(resume.id))!;
    expect(saved.language).toBe(resumeLanguage);
    const page = pdfHtml(saved, 'letter');
    expect(page).toContain(`<html lang="${resumeLanguage}" dir="${doc.dir}">`);
    expect(headingsIn(page)).toEqual(doc.headings);
    const { body, core } = await docxXml(resumeLanguage, 'tech-builder');
    expect(body).toContain(`>${doc.experience}<`);
    expect(core).toContain(doc.builder);
    expect(body.includes('<w:bidi/>')).toBe(resumeLanguage === 'ar');

    // Neither setting moved.
    expect(await store.settings.getAppLanguage()).toBe(app);
    expect((await store.resumes.get(resume.id))!.language).toBe(resumeLanguage);
    await db.close();
    dir.cleanup();
  });

  it('a new resume is created in the language the user picks in the editor, independent of the app language', async () => {
    const dir = tempDir();
    const db = openTestDatabase(dir.file('app.db'));
    const store = await initializeDatabase(db, { newId: testId });
    const library = new ResumeLibrary(store.resumes, { newId: testId, defaultLanguage: () => 'ar' });
    const english = library.create(SAMPLE_RESUME, 'CV', 'tech-builder', 'en');
    const arabic = library.create(ARABIC_RESUME, 'سيرة', 'tech-builder', 'ar');
    await library.flush();
    expect((await store.resumes.get(english.id))!.language).toBe('en');
    expect((await store.resumes.get(arabic.id))!.language).toBe('ar');
    await db.close();
    dir.cleanup();
  });

  it('template discovery shows the English sample with English labels, and the Arabic UI says so', () => {
    const sample = templateSampleHtml('corporate-boardroom');
    expect(sample).toContain('<html lang="en" dir="ltr">');
    expect(headingsIn(sample)).toEqual(ENGLISH_LABELS);
    expect(T.ar('templatePreview.sampleNote')).toBe('معروض بمحتوى نموذجي. تبدأ سيرتك الذاتية فارغة.');
  });

  it('the Arabic app language and resume language resolve from storage, device lists and unknown values', () => {
    expect(toLanguage('ar')).toBe('ar');
    expect(toLanguage('AR')).toBe('en');
    expect(resolveLanguage(['ar-SA'])).toBe('ar');
    expect(resolveLanguage(['ar_EG', 'fr'])).toBe('ar');
    expect(resolveLanguage(['ar-SD'])).toBe('ar');
    expect(LANGUAGES).toContain('ar');
  });
});

// --- analysis messages ---

describe('Arabic analysis messages', () => {
  const codesIn = (value: unknown, out: AnalysisText[] = []): AnalysisText[] => {
    if (Array.isArray(value)) for (const v of value) codesIn(v, out);
    else if (value && typeof value === 'object') {
      if (typeof (value as AnalysisText).code === 'string') out.push(value as AnalysisText);
      else for (const v of Object.values(value)) codesIn(v, out);
    }
    return out;
  };

  it('every code the engines emit renders in Arabic (nested codes too), with every parameter filled', () => {
    const reports: unknown[] = [];
    for (const data of [SAMPLE_RESUME, ARABIC_RESUME, emptyResume(), ...Object.values(ATS_STRONG), ...Object.values(ATS_WEAK), ...Object.values(ATS_EDGE)]) {
      reports.push(scoreResume(normalizeResumeData(data), 'ar'));
      for (const t of TEMPLATES) reports.push(checkAtsReadability(data, t.id, 'ar'));
    }
    for (const data of Object.values(JOB_RESUMES)) for (const jd of Object.values(JDS)) reports.push(analyzeJobMatch(data, jd, 'ar'));
    for (const entry of COACH_WEAK) reports.push(analyzeText(entry.text, buildCoachContext(entry.field, 'en', entry.siblings ?? [])));
    const codes = codesIn(reports);
    expect(new Set(codes.map((c) => c.code)).size).toBeGreaterThan(80);
    for (const coded of codes) {
      const arabic = renderText(T.ar, coded);
      expect(arabic, coded.code).not.toMatch(/\{\w+\}|analysis\.|templates\./);
      if (AR.get(coded.code) !== EN.get(coded.code)) expect(arabic, coded.code).not.toBe(renderText(T.en, coded));
    }
    // Nested codes follow the app language: the tense and the ATS template name.
    expect(renderText(T.ar, { code: 'analysis.coach.tense', params: { theirs: { code: 'analysis.coach.tenses.past' }, word: 'Lead', mine: { code: 'analysis.coach.tenses.present' } } })).toBe(
      'النقاط الأخرى في هذا الإدخال تستخدم زمن \u2068الماضي\u2069، بينما تبدأ هذه بـ «\u2068Lead\u2069» (زمن \u2068المضارع\u2069).',
    );
    expect(renderText(T.ar, checkAtsReadability(SAMPLE_RESUME, 'trades-foreman', 'ar').checks.find((c) => c.rule === 'template-text')!.titleText)).toBe(
      'نص القالب (⁨رئيس العمال⁩)',
    );
  });

  it('English and Latin text inside an Arabic sentence is isolated so it does not reorder', () => {
    expect(renderText(T.ar, { code: 'analysis.coach.weakOpener', params: { word: 'Helped' } })).toBe(
      '«⁨Helped⁩» بداية ضعيفة. اختر فعلًا يوضح ما فعلته؛ فهذه الأفعال تحافظ على مستوى الادعاء نفسه.',
    );
    expect(T.ar('home.deleteBody', { title: 'My CV (2026)' })).toBe('ستتم إزالة «⁨My CV (2026)⁩» من هذا الجهاز.');
    expect(T.ar('home.moreActions', { title: 'C++' })).toBe('مزيد من الإجراءات لـ ⁨C++⁩');
    // An English sentence is never wrapped.
    expect(T.en('home.deleteBody', { title: 'CV' })).toBe('"CV" will be removed from this device.');
  });

  it('the rules are unchanged: an Arabic resume gets the same scores, statuses and findings as English', () => {
    for (const data of [SAMPLE_RESUME, ARABIC_RESUME, ...Object.values(ATS_WEAK)]) {
      const score = (language: Language) => {
        const r = scoreResume(normalizeResumeData(data), language);
        return { score: r.score, warnings: r.warnings.map((w) => [w.id, w.messageText]), strengths: r.strengthTexts, categories: r.categories.map((c) => c.status) };
      };
      expect(score('ar')).toEqual(score('en'));
      const ats = (language: Language) =>
        checkAtsReadability(data, 'tech-builder', language).checks.map((c) => [c.rule, c.status, c.findings.map((f) => [f.id, f.status, f.messageText.code])]);
      expect(ats('ar')).toEqual(ats('en'));
    }
  });

  it('never claims Arabic language analysis: the English-rules limits are stated in Arabic', () => {
    for (const engine of ['resumeScore', 'ats', 'jobMatch', 'coverLetter', 'import'] as const) expect(analysisSupport(engine, 'ar').kind).toBe('english-rules');
    expect(analysisSupport('writingCoach', 'ar').kind).toBe('unavailable');
    // The Coach stays disabled for Arabic resumes: no findings, and the reason is shown in Arabic.
    expect(analyzeText('Helped with the launch', buildCoachContext('experienceBullet', 'ar')).findings).toEqual([]);
    expect(T.ar('tools.englishRules', { language: LANGUAGE_NAMES.ar })).toBe(
      'تعتمد هذه الفحوصات على قواعد اللغة الإنجليزية وصياغتها. قد تكون النتائج غير مكتملة للسير الذاتية بلغة ⁨العربية⁩.',
    );
    expect(T.ar('editor.coachUnavailable')).toBe('المدرّب الكتابي يعمل حاليًا مع السير الذاتية الإنجليزية فقط.');
    expect(T.ar('letter.englishOnly')).toBe('تُكتب المسودة بالإنجليزية حاليًا.');
    expect(T.ar('import.englishHeadings')).toMatch(/إلا بالإنجليزية/);
    expect(T.ar('analysis.ats.dates.noEnd')).toContain('Present');
  });

  it('Job Match keeps the English taxonomy; only the UI around it is Arabic', () => {
    const report = analyzeJobMatch(SAMPLE_RESUME, JDS.softwareEngineer, 'ar');
    expect(report.terms.map((term) => term.label)).toEqual(analyzeJobMatch(SAMPLE_RESUME, JDS.softwareEngineer, 'en').terms.map((term) => term.label));
    expect(T.ar('match.sections.required')).toBe('المتطلبات');
    let message = '';
    try {
      analyzeJobMatch(SAMPLE_RESUME, 'x'.repeat(JOB_DESCRIPTION_MAX + 1), 'ar');
    } catch (error) {
      message = errorText(T.ar, error, 'match.failed');
    }
    expect(message).toBe('هذا الوصف الوظيفي طويل جدًا (الحد الأقصى 25,000 محرف).');
  });

  it('the cover letter UI is Arabic while the draft is English (stated on screen)', () => {
    expect(T.ar('letter.intro')).toContain('مسودة أولية');
    expect(T.ar('letter.englishOnly')).toContain('بالإنجليزية');
  });
});

// --- app UI and the free product ---

describe('Arabic app UI', () => {
  it('screens resolve Arabic text', () => {
    expect(T.ar('home.create')).toBe('أنشئ سيرتي الذاتية');
    expect(T.ar('gallery.useTemplate')).toBe('استخدام القالب');
    expect(T.ar('editor.sections.experience')).toBe('الخبرات');
    expect(T.ar('preview.export', { format: T.ar('preview.formats.pdf') })).toBe('تصدير ⁨PDF⁩');
    expect(T.ar('preview.export', { format: T.ar('preview.formats.image') })).toBe('تصدير ⁨صورة⁩');
    expect(T.ar('settings.appLanguage')).toBe('لغة التطبيق');
  });

  it('the Language screen lists every language by its own name; Arabic is "العربية" and persists', async () => {
    expect(LANGUAGES.map((l) => LANGUAGE_NAMES[l])).toEqual(['English', 'Deutsch', 'Français', 'Español', 'العربية']);
    const dir = tempDir();
    const db = openTestDatabase(dir.file('app.db'));
    const app = await initializeDatabase(db, { newId: testId });
    await app.settings.setAppLanguage('ar');
    expect(await app.settings.getAppLanguage()).toBe('ar');
    expect(read('features/settings/LanguageSettingsScreen.tsx')).toMatch(/setAppLanguage\(language\)/);
    // The restart requirement is unchanged and stated in Arabic.
    expect(T.ar('settings.restart')).toBe('أغلق التطبيق وأعد فتحه لتبديل اتجاه التخطيط.');
    expect(T.ar('settings.appLanguageHint')).toContain('تحتفظ كل سيرة ذاتية بلغتها الخاصة');
    await db.close();
    dir.cleanup();
  });

  it('has no monetization text or keys (My Resume is free)', () => {
    expect(ar).not.toHaveProperty('paywall');
    expect(ar.nav).not.toHaveProperty('premium');
    expect(ar.coach).not.toHaveProperty('locked');
    expect(ar.match).not.toHaveProperty('compareLocked');
    expect(ar.preview).not.toHaveProperty('locked');
    expect(ar.preview).not.toHaveProperty('devStore');
    const all = [...AR.values()].flatMap(forms).join('\n');
    expect(all).not.toMatch(/بريميوم|مميز(ة)? مدفوع|اشتراك|اشترِ|شراء|سعر|الدفع|ادفع|دفع|مقفل|مغلق(ة)? حتى|فتح القفل|استعادة المشتريات|مدى الحياة|ترقية|ترقّ|ريال|دولار|يورو|\$\s?\d|€|🔒/);
  });

  it('a key missing from Arabic falls back to English, key by key', () => {
    const partial: Record<Language, PartialMessages> = { ...CATALOGS, ar: { ...ar, home: { ...ar.home, seeAll: undefined } } };
    const { t } = createTranslator('ar', partial);
    expect(t('home.seeAll')).toBe('See all');
    expect(t('home.create')).toBe('أنشئ سيرتي الذاتية');
  });
});

// --- regression: the other languages and the free product are untouched ---

describe('other catalogs are unchanged by the Arabic work', () => {
  it('English, German, French and Spanish keep exactly their previous text', () => {
    expect(leaves(en)).toHaveLength(445);
    expect(catalogHash(en)).toBe('bbd8860f9c6f7fc294f00b930f2808855ed2aa9fb7eb87626f10c317cc2fbd10');
    expect(catalogHash(de)).toBe('99a5cf244a82e7f666d671611812683c99c6873fd8640f248de9ba8fdf19dd7a');
    expect(catalogHash(fr)).toBe('333fc9f2ec87050ad4e0703142550697edaf9ed3998cc12bf7f9340d1db07ea6');
    expect(catalogHash(es)).toBe('ce3821d064983d42487fdaba3bf3b8e91a5645859916f3dc1325e5e83ae06de3');
  });

  it('Latin-script documents render exactly as before: no RTL rules, no isolates, no script overrides', () => {
    for (const language of ['en', 'de', 'fr', 'es'] as const) {
      for (const t of TEMPLATES) {
        const page = render(language, t.id, 'preview', { data: SAMPLE_RESUME, watermark: true });
        expect(page, `${language} ${t.id}`).not.toMatch(/\/\*rtl\*\/|\/\*script\*\/|<bdi/);
        expect(page, `${language} ${t.id}`).toContain(`<html lang="${language}" dir="ltr">`);
      }
      expect(typographyFor(language)).toMatchObject({ caseTransforms: true, smallCaps: true, letterSpacing: true, italics: true, listSeparator: ', ' });
    }
  });
});

// --- RTL app foundation ---

describe('RTL app foundation', () => {
  it('uses semantic RTL: no row-reverse, no hard-coded left/right text alignment, no per-screen direction hacks', () => {
    const files = ['ui/components.tsx', 'ui/direction.ts', 'features/ats/AtsTool.tsx', 'features/check/CheckTool.tsx', 'features/coach/CoachEntry.tsx', 'features/editor/EditorScreen.tsx', 'features/job-match/MatchTool.tsx', 'features/library/HomeScreen.tsx', 'features/preview/PreviewScreen.tsx', 'features/settings/LanguageSettingsScreen.tsx', 'features/templates/TemplateCard.tsx'];
    for (const file of files) {
      const source = read(file);
      expect(source, file).not.toMatch(/row-reverse/);
      expect(source, file).not.toMatch(/textAlign:\s*'(left|right)'/);
      // Only the editor-input helper (resume language decides the typing direction) reads isRTL.
      if (file !== 'ui/direction.ts') expect(source, file).not.toMatch(/I18nManager\.(isRTL|forceRTL)/);
    }
    // The layout direction is decided in one place, from the app language.
    expect(read('services/i18n/layout-direction.ts')).toMatch(/I18nManager\.forceRTL\(rtl\)/);
  });

  it('tracked caps (letter-spacing, uppercase) are off for Arabic, and unchanged for Latin languages', () => {
    const direction = read('ui/direction.ts');
    expect(direction).toMatch(/typographyFor\(language\)\.letterSpacing \? \{\} : \{ letterSpacing: 0, textTransform: 'none' \}/);
    expect(direction).toMatch(/directionOf\(language\) === 'rtl' \? '\\u2190' : '\\u2192'/);
    expect(typographyFor('ar').letterSpacing).toBe(false);
    for (const language of ['en', 'de', 'fr', 'es'] as const) expect(typographyFor(language).letterSpacing).toBe(true);
    // Every screen text that is tracked or upper-cased goes through the shared style.
    for (const file of ['features/templates/TemplateCard.tsx', 'ui/components.tsx']) expect(read(file), file).toMatch(/trackedCapsStyle\(/);
    for (const file of ['features/ats/AtsTool.tsx', 'features/job-match/MatchTool.tsx', 'features/coach/CoachEntry.tsx', 'features/library/HomeScreen.tsx', 'features/settings/LanguageSettingsScreen.tsx', 'features/check/CheckTool.tsx']) {
      expect(read(file), file).toMatch(/<SectionTitle/);
      expect(read(file), file).not.toMatch(/styles\.sectionTitle/);
    }
  });
});

// --- UI fit ---

describe('Arabic strings in narrow places', () => {
  const len = (s: string) => [...s].length;

  it('tabs, buttons, chips, badges and status labels stay within the measured budgets (Arabic text is shorter than the Latin text that fits)', () => {
    for (const key of ['check', 'ats', 'match', 'letter'] as const) {
      for (const word of ar.tools.tabs[key].split(' ')) expect(len(word), `tab ${key}`).toBeLessThanOrEqual(11);
    }
    for (const format of Object.values(ar.preview.formats)) {
      expect(len(T.ar('preview.export', { format }))).toBeLessThanOrEqual(len(T.en('preview.export', { format: en.preview.formats.image })) + 2);
    }
    expect(len(ar.gallery.useTemplate)).toBeLessThanOrEqual(14);
    expect(len(ar.gallery.atsReady)).toBeLessThanOrEqual(14);
    for (const id of Object.keys(ar.templates).filter((k) => k !== 'categories') as (keyof typeof ar.templates)[]) {
      const entry = ar.templates[id] as { name: string; shortName: string };
      expect(len(entry.shortName), id).toBeLessThanOrEqual(13);
      expect(len(entry.name), id).toBeLessThanOrEqual(16);
    }
    for (const name of Object.values(ar.templates.categories)) expect(len(name)).toBeLessThanOrEqual(14);
    for (const status of Object.values(ar.check.status)) expect(len(status)).toBeLessThanOrEqual(16);
    expect(len(ar.editor.add)).toBeLessThanOrEqual(13);
    expect(len(ar.editor.moveUp) + len(ar.editor.moveDown) + len(ar.editor.remove)).toBeLessThanOrEqual(30);
    expect(len(ar.match.detected)).toBeLessThanOrEqual(len(en.match.detected) + 8);
    expect(len(ar.ats.detected)).toBeLessThanOrEqual(10);
    expect(len(ar.ats.notDetected)).toBeLessThanOrEqual(12);
    expect(len(ar.editor.tools) + len(ar.editor.preview)).toBeLessThanOrEqual(24);
  });
});

// --- file names ---

describe('Arabic file names', () => {
  it('keep Arabic letters, use hyphens, and are deterministic', () => {
    expect(fileSafeName('محمد أحمد')).toBe('محمد-أحمد');
    expect(fileSafeName('أحمد محمد')).toBe('أحمد-محمد');
    expect(fileSafeName('سارة علي')).toBe('سارة-علي');
    expect(fileSafeName('محمد أحمد Müller')).toBe('محمد-أحمد-müller');
    expect(fileSafeName('محمد أحمد')).toBe(fileSafeName('محمد أحمد'));
  });

  it('never contain direction-control characters, path characters, a trailing separator or more than 60 characters', () => {
    const noisy = fileSafeName('‫محمد‬ ‏⁧أحمد⁩‎ Müller؜');
    expect(noisy).toBe('محمد-أحمد-müller');
    expect(noisy).not.toMatch(BIDI_CONTROLS);
    expect(fileSafeName('../محمد/أحمد:*؟')).toBe('محمد-أحمد');
    // Diacritics (tashkeel) and the tatweel are kept or dropped consistently, never producing control characters.
    expect(fileSafeName('مُحَمَّد أحمد')).not.toMatch(BIDI_CONTROLS);
    const long = fileSafeName('محمد أحمد '.repeat(12));
    expect([...long].length).toBeLessThanOrEqual(60);
    expect(long).toMatch(/^محمد-أحمد-محمد-أحمد/);
    expect(long).not.toMatch(/-$/);
    const exact = fileSafeName(`${'م'.repeat(59)} م`);
    expect([...exact].length).toBeLessThanOrEqual(60);
    expect(exact).not.toMatch(/-$/);
  });

  it('PDF, DOCX and image file names for an Arabic resume', () => {
    const resume = stored('ar', { data: { ...ARABIC_RESUME, name: 'محمد أحمد' } });
    expect(exportFileName(resume, 'pdf')).toBe('محمد-أحمد.pdf');
    expect(exportFileName(resume, 'docx')).toBe('محمد-أحمد.docx');
    expect(exportFileName(resume, 'png', { index: 1, count: 2 })).toBe('محمد-أحمد-page-2.png');
    expect(exportFileName(stored('ar', { data: { ...ARABIC_RESUME, name: 'محمد أحمد Müller' } }), 'pdf')).toBe('محمد-أحمد-müller.pdf');
    expect(exportFileName(resume, 'pdf')).not.toContain('_');
    // A resume with no name falls back to its (Arabic) title.
    expect(exportFileName(stored('ar', { title: 'سيرة سارة علي', data: { ...ARABIC_RESUME, name: '' } }), 'pdf')).toBe('سيرة-سارة-علي.pdf');
  });
});

// --- image export goes through the same pipeline as the PDF ---

describe('Arabic image export', () => {
  class MemoryFs implements ExportFileSystem {
    files = new Map<string, string>();
    prepareFile(artifactId: string, name: string): FileRef {
      return { uri: `mem://${artifactId}/${name}` };
    }
    writeBase64(file: FileRef, base64: string) {
      this.files.set(file.uri, base64);
    }
    async readBase64(uri: string) {
      return this.files.get(uri) ?? '';
    }
    async moveInto(sourceUri: string, target: FileRef) {
      this.files.set(target.uri, this.files.get(sourceUri) ?? '');
      this.files.delete(sourceUri);
    }
    deleteUri(uri: string) {
      this.files.delete(uri);
    }
    deleteArtifactDir() {}
    exists(file: FileRef) {
      return this.files.has(file.uri);
    }
    purge() {}
  }

  it('prints the same Arabic HTML for PDF and image export, and names every page in Arabic', async () => {
    const fs = new MemoryFs();
    const printed: string[] = [];
    const print = {
      async printToFile(options: { html: string }) {
        printed.push(options.html);
        const uri = `mem://tmp/${printed.length}.pdf`;
        fs.files.set(uri, Buffer.from('%PDF-fake').toString('base64'));
        return { uri };
      },
    };
    const rasterizer: Rasterizer = { async rasterize() { return [0, 1].map((index) => ({ index, width: 1, height: 1, pngBase64: `png-${index}` })); } };
    const platform = createFileExportPlatform({ fs, print, share: { async isAvailable() { return true; }, async share() {} }, rasterizer, newId: (() => { let n = 0; return () => `a${++n}`; })() });
    const resume = stored('ar');
    await platform.generatePdf(resume, 'a4');
    await platform.generatePng(resume, 'a4');
    expect(printed).toHaveLength(2);
    expect(printed[1]).toBe(printed[0]);
    expect(printed[0]).toContain('<html lang="ar" dir="rtl">');
    expect(headingsIn(printed[0])).toEqual(ARABIC_LABELS);
    expect(printed[0]).not.toContain('class="watermark"');
    const names = [...fs.files.keys()].filter((uri) => !uri.includes('/tmp/')).map((uri) => decodeURIComponent(uri.split('/').pop()!));
    expect(names.sort()).toEqual(['محمد-أحمد-page-1.png', 'محمد-أحمد-page-2.png', 'محمد-أحمد.pdf']);
    for (const name of names) expect(name).not.toMatch(BIDI_CONTROLS);
  });
});

// --- real PDFs and layout (Chromium + pdf.js) ---

const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CONTENT_PX: Record<PaperSize, number> = { letter: 672, a4: Math.round((210 / 25.4 - 1.5) * 96) };
const squash = (s: string) => s.replace(/[\s\u200E\u200F\u2066-\u2069]+/g, '');
const ARABIC_CHAR = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
/**
 * The text a PDF reader gets from a page. Chromium emits Arabic as one glyph run per letter
 * form, so a word is only whole once the glyphs of a line are put back in reading order:
 * Arabic items right-to-left, Latin items left-to-right, then NFKC turns the presentation
 * forms (U+FExx) into ordinary letters. Whitespace is removed (spaces are positions, not
 * characters, in a PDF).
 */
async function extractText(doc: { numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }> }) {
  const lines = new Map<string, { x: number; str: string }[]>();
  let raw = '';
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    for (const item of content.items as { str?: string; transform?: number[] }[]) {
      if (!item.str?.trim()) continue;
      raw += item.str;
      const key = `${n}:${String(-Math.round(item.transform![5] / 2)).padStart(6, '0')}`;
      lines.set(key, [...(lines.get(key) ?? []), { x: item.transform![4], str: item.str }]);
    }
  }
  let arabic = '';
  let latin = '';
  for (const key of [...lines.keys()].sort()) {
    const items = lines.get(key)!;
    arabic += items.filter((i) => ARABIC_CHAR.test(i.str)).sort((a, b) => b.x - a.x).map((i) => i.str).join('').normalize('NFKC');
    latin += items.filter((i) => !ARABIC_CHAR.test(i.str)).sort((a, b) => a.x - b.x).map((i) => i.str).join('');
  }
  return { arabic: squash(arabic), latin: squash(latin), raw };
}

describe.skipIf(!existsSync(CHROMIUM))('Arabic documents in a real engine', () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: CHROMIUM });
    page = await browser.newPage();
  }, 30_000);
  afterAll(async () => {
    await browser?.close();
  });

  it('every template, Letter and A4: the PDF text layer yields the Arabic headings and name as whole words, and Latin parts intact', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    await page.emulateMedia({ media: 'print' });
    for (const t of TEMPLATES) {
      for (const paper of ['letter', 'a4'] as const) {
        await page.setContent(pdfHtml(stored('ar', { templateId: t.id, accent: t.defaultAccent }), paper));
        const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
        const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
        const { arabic, latin, raw } = await extractText(doc);
        const where = `${t.id} ${paper}`;
        for (const label of ARABIC_LABELS) expect(arabic, `${where} ${label}`).toContain(squash(label));
        expect(arabic, where).toContain(squash('محمد أحمد'));
        expect(arabic, where).toContain(squash('مهندس برمجيات أول'));
        expect(arabic, where).toContain(squash('جامعة الملك سعود'));
        expect(arabic, where).toContain(squash('شركة الأفق'));
        expect(latin, where).toContain('mohamed.ahmed@example.com');
        expect(latin, where).toContain('+491701234567');
        expect(latin, where).toContain('linkedin.com/in/mohamed-');
        expect(latin, where).toContain('.NET');
        expect(latin, where).toContain('03/2020');
        expect(latin, where).toContain('Reducedlatencyby35%usingAWSLambda');
        expect(latin, where).toContain('AWSCertifiedSolutionsArchitect');
        expect(latin, where).toContain('C++');
        expect(`${arabic}${latin}`, where).not.toMatch(ARABIC_INDIC_DIGITS);
        expect(`${arabic}${latin}`, where).not.toContain('معاينة');
        // Real letters, not a placeholder glyph for a missing font.
        expect(raw, where).not.toMatch(/[\uFFFD]/);
      }
    }
  }, 240_000);

  it('headings fit on one line, stay inside the page, never touch a decorative mark, and have no transform or tracking (PDF and preview)', async () => {
    for (const t of TEMPLATES) {
      for (const mode of ['pdf', 'preview'] as const) {
        for (const paper of ['letter', 'a4'] as const) {
          if (mode === 'pdf') {
            await page.setViewportSize({ width: CONTENT_PX[paper], height: 1000 });
            await page.emulateMedia({ media: 'print' });
          } else {
            await page.setViewportSize({ width: 900, height: 1000 });
            await page.emulateMedia({ media: 'screen' });
          }
          await page.setContent(render('ar', t.id, mode, { paper, watermark: mode === 'preview' }), { waitUntil: 'load' });
          const result = await page.evaluate(() => {
            const root = document.querySelector('.content')!.getBoundingClientRect();
            const headings = Array.from(document.querySelectorAll('.content h2')).map((h) => {
              const range = document.createRange();
              range.selectNodeContents(h);
              const lines = new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top)));
              const r = h.getBoundingClientRect();
              const s = getComputedStyle(h);
              return {
                text: h.textContent,
                lines: lines.size,
                inside: r.left >= root.left - 0.5 && r.right <= root.right + 0.5,
                clipped: h.scrollWidth > h.clientWidth + 1,
                transform: s.textTransform,
                tracking: s.letterSpacing,
                caps: s.fontVariantCaps,
              };
            });
            const name = getComputedStyle(document.querySelector('h1')!);
            const italics = Array.from(document.querySelectorAll('.italic')).map((el) => getComputedStyle(el).fontStyle);
            const marks = Array.from(document.querySelectorAll('.mark-qc, .mark-rule')).map((m) => m.getBoundingClientRect());
            const texts: DOMRect[] = [];
            const walker = document.createTreeWalker(document.querySelector('.content')!, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              if (!node.textContent?.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(node);
              texts.push(...Array.from(range.getClientRects()).filter((r) => r.width > 0));
            }
            const touching = marks.some((m) => texts.some((r) => r.left < m.right && m.left < r.right && r.top < m.bottom && m.top < r.bottom));
            return {
              headings,
              touching,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              dir: getComputedStyle(document.documentElement).direction,
              name: { transform: name.textTransform, tracking: name.letterSpacing },
              italics,
            };
          });
          const where = `${t.id} ${mode} ${paper}`;
          expect(result.dir, where).toBe('rtl');
          expect(result.headings.map((h) => h.text), where).toEqual(ARABIC_LABELS);
          for (const h of result.headings) {
            expect(h.lines, `${where} ${h.text}`).toBe(1);
            expect(h.inside, `${where} ${h.text}`).toBe(true);
            expect(h.clipped, `${where} ${h.text}`).toBe(false);
            expect(h.transform, `${where} ${h.text}`).toBe('none');
            expect(['normal', '0px'], `${where} ${h.text}`).toContain(h.tracking);
            expect(h.caps, `${where} ${h.text}`).toBe('normal');
          }
          expect(result.name.transform, where).toBe('none');
          expect(['normal', '0px'], where).toContain(result.name.tracking);
          for (const style of result.italics) expect(style, where).toBe('normal');
          expect(result.touching, where).toBe(false);
          expect(result.overflow, where).toBeLessThanOrEqual(0);
        }
      }
    }
  }, 300_000);

  it('mixed text keeps its order on screen: final periods, "C++" and ".NET" stay on the right side; contact parts read left-to-right', async () => {
    await page.setViewportSize({ width: CONTENT_PX.letter, height: 1000 });
    await page.emulateMedia({ media: 'print' });
    for (const id of ['corporate-boardroom', 'tech-architect', 'creative-editorial', 'tech-builder', 'trades-foreman']) {
      await page.setContent(render('ar', id), { waitUntil: 'load' });
      const result = await page.evaluate(() => {
        const rectOf = (node: Text, start: number, end: number) => {
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, end);
          return range.getBoundingClientRect();
        };
        const find = (needle: string) => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
            const at = (node.textContent ?? '').indexOf(needle);
            if (at >= 0) return { node, at };
          }
          return null;
        };
        const sentence = find('Reduced latency by 35% using AWS Lambda.');
        const lambda = sentence ? rectOf(sentence.node, sentence.at + 'Reduced latency by 35% using AWS '.length, sentence.at + 'Reduced latency by 35% using AWS Lambda'.length) : null;
        const period = sentence ? rectOf(sentence.node, sentence.at + 'Reduced latency by 35% using AWS Lambda'.length, sentence.at + 'Reduced latency by 35% using AWS Lambda.'.length) : null;
        const reduced = sentence ? rectOf(sentence.node, sentence.at, sentence.at + 'Reduced'.length) : null;
        const cpp = find('C++');
        const cppC = cpp ? rectOf(cpp.node, cpp.at, cpp.at + 1) : null;
        const cppPlus = cpp ? rectOf(cpp.node, cpp.at + 1, cpp.at + 3) : null;
        const dotnet = find('.NET');
        const dot = dotnet ? rectOf(dotnet.node, dotnet.at, dotnet.at + 1) : null;
        const net = dotnet ? rectOf(dotnet.node, dotnet.at + 1, dotnet.at + 4) : null;
        const email = find('mohamed.ahmed@example.com');
        const emailFirst = email ? rectOf(email.node, email.at, email.at + 6) : null;
        const emailLast = email ? rectOf(email.node, email.at + 'mohamed.ahmed@example.co'.length, email.at + 'mohamed.ahmed@example.com'.length) : null;
        return { lambda, period, reduced, cppC, cppPlus, dot, net, emailFirst, emailLast };
      });
      const where = id;
      expect(result.period!.left, where).toBeGreaterThanOrEqual(result.lambda!.right - 0.5);
      expect(result.lambda!.left, where).toBeGreaterThan(result.reduced!.left);
      expect(result.cppPlus!.left, where).toBeGreaterThanOrEqual(result.cppC!.right - 0.5);
      expect(result.net!.left, where).toBeGreaterThanOrEqual(result.dot!.right - 0.5);
      expect(result.emailLast!.left, where).toBeGreaterThan(result.emailFirst!.left);
    }
  }, 120_000);
});

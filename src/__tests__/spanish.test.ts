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
import { de } from '../i18n/messages/de';
import { en } from '../i18n/messages/en';
import { es } from '../i18n/messages/es';
import { fr } from '../i18n/messages/fr';
import { categoryName, templateText } from '../i18n/templates';
import { createTranslator } from '../i18n/translate';
import { exportFileName, pdfHtml } from '../services/export/file-export-platform';
import { renderPreview } from '../services/preview/preview-service';
import { ResumeLibrary } from '../services/storage/resume-library';
import { initializeDatabase } from '../services/storage/sqlite/database';
import { EDGE as ATS_EDGE, STRONG as ATS_STRONG, WEAK as ATS_WEAK } from './fixtures/ats-corpus';
import { WEAK as COACH_WEAK } from './fixtures/coach-corpus';
import { JDS, RESUMES as JOB_RESUMES } from './fixtures/job-corpus';
import { openTestDatabase, tempDir, testId } from './helpers/node-sqlite';

// Phase 13E: Spanish (es) localization. The analysis rules stay English; Spanish is the
// app language and/or the resume's document language.

const SRC = join(__dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');
const T = { es: createTranslator('es').t, fr: createTranslator('fr').t, de: createTranslator('de').t, en: createTranslator('en').t };

type Leaf = string | Record<string, string>;
/** key → value (a string, or a plural object) for every message in a catalog. */
const leaves = (node: unknown, prefix = ''): [string, Leaf][] =>
  typeof node === 'object' && node !== null && !('other' in node)
    ? Object.entries(node).flatMap(([k, v]) => leaves(v, `${prefix}${k}.`))
    : [[prefix.slice(0, -1), node as Leaf]];
const EN = new Map(leaves(en));
const DE = new Map(leaves(de));
const FR = new Map(leaves(fr));
const ES = new Map(leaves(es));
const forms = (value: Leaf) => (typeof value === 'string' ? [value] : Object.values(value));
const params = (value: Leaf) => new Set(forms(value).flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])));
const catalogHash = (catalog: unknown) => createHash('sha256').update(JSON.stringify(leaves(catalog))).digest('hex');

const SPANISH_LABELS = ['Perfil profesional', 'Experiencia', 'Formación', 'Certificaciones', 'Proyectos', 'Premios'];
const ENGLISH_LABELS = ['Summary', 'Experience', 'Education', 'Certifications', 'Projects', 'Awards'];
const GERMAN_LABELS = ['Kurzprofil', 'Berufserfahrung', 'Ausbildung', 'Zertifikate', 'Projekte', 'Auszeichnungen'];
const FRENCH_LABELS = ['Profil', 'Expérience professionnelle', 'Formation', 'Certifications', 'Projets', 'Distinctions'];
const headingsIn = (page: string) => [...page.matchAll(/<h2 class="[^"]*">([^<]*)<\/h2>/g)].map((m) => m[1]);
/** The watermark label as it appears inside the encoded SVG tile. */
const tileText = (label: string) => encodeURIComponent(`>${label}<`);
const render = (language: Language, templateId = 'corporate-boardroom', mode: RenderMode = 'pdf', extra: { watermark?: boolean; paper?: PaperSize; data?: ResumeData } = {}) =>
  renderResumeHtml(extra.data ?? SAMPLE_RESUME, {
    templateId,
    accent: TEMPLATES.find((t) => t.id === templateId)!.defaultAccent,
    mode,
    language,
    watermark: extra.watermark,
    paper: extra.paper,
  });
const docxXml = async (language: Language, templateId = 'corporate-boardroom', data: ResumeData = SAMPLE_RESUME) => {
  const templateName = templateText(createTranslator(language).t, templateId).name;
  const zip = await JSZip.loadAsync(Buffer.from(await buildResumeDocxBase64({ data, accent: '#1B2B47', templateName, language }), 'base64'));
  return { body: await zip.file('word/document.xml')!.async('string'), core: await zip.file('docProps/core.xml')!.async('string') };
};
const stored = (language: Language, overrides: Partial<StoredResume> = {}): StoredResume => ({
  id: 'r1',
  title: 'Mi currículum',
  templateId: 'corporate-boardroom',
  accent: '#1B2B47',
  language,
  data: SAMPLE_RESUME,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

// --- catalog ---

describe('Spanish catalog', () => {
  it('has a Spanish value for every English key, and no other keys', () => {
    expect([...ES.keys()].sort()).toEqual([...EN.keys()].sort());
    expect(ES.size).toBe(445);
    expect(EN.size).toBe(445);
    for (const [key, value] of ES) for (const form of forms(value)) expect(form.trim(), key).not.toBe('');
    // The runtime catalog is the complete file.
    expect(CATALOGS.es).toBe(es);
  });

  it('translates every key; the few identical values are names, technical names or pure formats', () => {
    const identical = [...ES].filter(([key, value]) => JSON.stringify(value) === JSON.stringify(EN.get(key))).map(([key]) => key).sort();
    expect(identical).toEqual([
      // Product and brand names (My Resume, Writing Coach's short name "Coach", LinkedIn).
      'analysis.location.linkedin', 'coach.open', 'editor.fields.personal.linkedin', 'nav.home',
      // Technical names.
      'preview.formats.docx', 'preview.formats.pdf', 'tools.tabs.ats',
      // Pure formats and separators: parameters and punctuation only.
      'analysis.location.inEntry', 'ats.separator', 'ats.statusPrefix', 'check.improveA11y', 'check.outOf', 'editor.listCount',
      'editor.listItem', 'home.templateAndDate', 'match.charCount', 'match.listSeparator', 'match.separator',
    ].sort());
  });

  it('is its own translation: never German or French text, never an English copy of one', () => {
    // Same on purpose: 03/2020 is a numeric date format that belongs to no language, and
    // "un emoji" is the same phrase in French and Spanish.
    const SHARED = ['editor.startPlaceholder', 'analysis.ats.characters.what.emoji'];
    for (const [key, value] of ES) {
      for (const other of [DE, FR]) {
        if (JSON.stringify(value) === JSON.stringify(other.get(key)) && !SHARED.includes(key)) {
          expect(JSON.stringify(value), key).toBe(JSON.stringify(EN.get(key)));
        }
      }
    }
    const all = [...ES.values()].flatMap(forms).join('\n');
    expect(all).not.toMatch(/Lebenslauf|Vorlage|Berufserfahrung|\bund\b|\bnicht\b|Créer|Modèle|Expérience|\bvotre\b|\bvous\b/);
  });

  it('every message takes exactly the parameters of its English source', () => {
    for (const [key, value] of ES) expect([...params(value)].sort(), key).toEqual([...params(EN.get(key)!)].sort());
  });

  it('plural messages are the same 10 keys as English, with valid categories, and counted forms show the count', () => {
    const plurals = [...ES].filter(([, value]) => typeof value !== 'string');
    expect(plurals.map(([key]) => key).sort()).toEqual([...EN].filter(([, v]) => typeof v !== 'string').map(([k]) => k).sort());
    expect(plurals).toHaveLength(10);
    for (const [key, value] of plurals) {
      expect(Object.keys(value).sort(), key).toEqual(['one', 'other']);
      for (const form of forms(value)) expect(form, key).toContain('{count}');
    }
  });

  it('uses Spanish typography: ¿…? and ¡…! in pairs, « … » without inner spaces, no English quotes, no apostrophes', () => {
    for (const [key, value] of ES) {
      for (const form of forms(value)) {
        expect(form, key).not.toMatch(/["“”'’]/);
        expect((form.match(/¿/g) ?? []).length, key).toBe((form.match(/\?/g) ?? []).length);
        expect((form.match(/¡/g) ?? []).length, key).toBe((form.match(/!/g) ?? []).length);
        expect((form.match(/«/g) ?? []).length, key).toBe((form.match(/»/g) ?? []).length);
        expect(form, key).not.toMatch(/«\s|\s»/);
        expect(form, key).not.toMatch(/\s[:;?!]/); // Spanish has no space before : ; ? !
      }
    }
    expect(es.home.deleteTitle).toBe('¿Eliminar el currículum?');
    expect(es.analysis.coach.measurable).toBe('¿Puedes añadir aquí un resultado medible?');
    expect(es.home.deleteBody).toBe('«{title}» se eliminará de este dispositivo.');
  });

  it('uses one term per concept (terminology map), neutral Spanish with "tú"', () => {
    const all = [...ES.values()].flatMap(forms).join('\n');
    // Rejected alternatives for the chosen terms, and regional or formal-register words.
    for (const avoid of [/Habilidades/, /Hoja de vida/, /Plantilla de CV/, /Resumen profesional|Perfil personal/, /Prevista|Previsualización|Preview/, /Carta de motivación|Carta de recomendación/, /\bordenador\b|\bcomputadora\b|\bcelular\b|\bmóvil\b/, /\busted\b|\bvosotros\b|\bvos\b|\bUd\./i, /\bTemplate\b/]) {
      expect(all, String(avoid)).not.toMatch(avoid);
    }
    expect(es.resume.labels.experience).toBe(es.editor.sections.experience);
    expect(es.resume.labels.education).toBe(es.editor.sections.education);
    expect(es.resume.labels.certifications).toBe(es.editor.sections.certifications);
    expect(es.resume.labels.projects).toBe(es.editor.sections.projects);
    expect(es.resume.labels.awards).toBe(es.editor.sections.awards);
    expect(es.analysis.location.section.skills).toBe(es.editor.fields.summary.skills);
    expect(es.nav.preview).toBe(es.editor.preview);
    expect(es.nav.tools).toBe(es.editor.tools);
    expect(es.resume.labels.resume).toBe('Currículum');
    // The tab is "Carta" (fit); the full term appears where there is room.
    expect(es.tools.tabs.letter).toBe('Carta');
    expect(es.letter.intro).toContain('carta de presentación');
  });
});

// --- plurals, numbers, dates ---

describe('Spanish plurals and formatting', () => {
  it('zero, one and several use the CLDR Spanish forms (0 is plural)', () => {
    expect([0, 1, 1.5, 2, 5, 1_000_000].map((n) => pluralCategory('es', n))).toEqual(['other', 'one', 'other', 'other', 'other', 'many']);
    expect([0, 1, 3].map((count) => T.es('ats.issues', { count }))).toEqual(['0 posibles problemas', '1 posible problema', '3 posibles problemas']);
    expect([0, 1, 2].map((count) => T.es('match.mentionLines', { count }))).toEqual([' (0 líneas)', ' (1 línea)', ' (2 líneas)']);
    expect([0, 1, 4].map((count) => T.es('match.termsDetected', { count }))).toEqual(['0 términos del puesto detectados', '1 término del puesto detectado', '4 términos del puesto detectados']);
    expect([1, 4].map((count) => T.es('match.alsoFound', { count }))).toEqual(['1 también aparece en tu currículum', '4 también aparecen en tu currículum']);
    expect([1, 3].map((count) => T.es('ats.toCheck', { count }))).toEqual(['1 por revisar', '3 por revisar']);
    // A "many" count (a million) has no own form in Spanish messages: the plural form is used.
    expect(T.es('ats.issues', { count: 1_000_000 })).toBe('1.000.000 posibles problemas');
    expect(renderText(T.es, { code: 'analysis.coach.longBullet', params: { count: 40, max: 32 } })).toBe(
      'Esta viñeta tiene 40 palabras. Intenta no pasar de 32 para que el resultado se vea de un vistazo.',
    );
    expect(renderText(T.es, { code: 'analysis.coach.longBullet', params: { count: 1, max: 32 } })).toContain('tiene 1 palabra.');
    expect(renderText(T.es, { code: 'analysis.score.warnings.shortBullets', params: { count: 1 } })).toBe('1 viñeta de experiencia podría ser más sólida.');
    expect(renderText(T.es, { code: 'analysis.score.warnings.shortBullets', params: { count: 0 } })).toBe('0 viñetas de experiencia podrían ser más sólidas.');
    expect(renderText(T.es, { code: 'analysis.coach.repeatedOpener', params: { count: 2, word: 'Led' } })).toContain('2 viñetas de esta entrada empiezan por');
  });

  it('app-generated numbers and dates use Spanish formats; user text is untouched', () => {
    // Spanish does not group four-digit numbers.
    expect(formatNumber('es', 1234.5)).toBe('1234,5');
    expect(formatNumber('es', 12345.5)).toBe('12.345,5');
    expect(T.es('match.charCount', { count: 1234, max: JOB_DESCRIPTION_MAX })).toBe('1234 / 25.000');
    expect(T.es('match.charCount', { count: 12345, max: JOB_DESCRIPTION_MAX })).toBe('12.345 / 25.000');
    expect(formatDate('es', Date.UTC(2026, 2, 15, 12))).toBe('15 mar 2026');
    expect(T.es('share.page', { title: 'CV', index: 2, count: 3 })).toBe('CV (página 2 de 3)');
    let message = '';
    try {
      analyzeJobMatch(SAMPLE_RESUME, 'x'.repeat(JOB_DESCRIPTION_MAX + 1), 'es');
    } catch (error) {
      message = errorText(T.es, error, 'match.failed');
    }
    expect(message).toBe('Esta descripción del puesto es demasiado larga (máximo 25.000 caracteres).');
    // A resume date the user typed is shown exactly as typed.
    const data = { ...SAMPLE_RESUME, experience: [{ ...SAMPLE_RESUME.experience[0], start: 'marzo de 2020', end: 'Actualidad' }] };
    const page = render('es', 'corporate-boardroom', 'pdf', { data });
    expect(page).toContain('marzo de 2020');
    expect(page).toContain('Actualidad');
  });
});

// --- template metadata ---

describe('Spanish template metadata', () => {
  it('names, short names, descriptions and categories are Spanish for all 12 templates; ids unchanged', () => {
    expect(TEMPLATES).toHaveLength(12);
    const names = new Set<string>();
    const shortNames = new Set<string>();
    for (const template of TEMPLATES) {
      const spanish = templateText(T.es, template.id);
      for (const other of [T.en, T.de, T.fr]) {
        const text = templateText(other, template.id);
        for (const field of ['name', 'shortName', 'description'] as const) {
          expect(spanish[field], `${template.id} ${field}`).not.toBe(text[field]);
          expect(spanish[field]).not.toMatch(/^templates\./);
        }
      }
      expect(spanish.category).toBe(es.templates.categories[template.category as keyof typeof es.templates.categories]);
      names.add(spanish.name);
      shortNames.add(spanish.shortName);
    }
    expect(names.size).toBe(12);
    expect(shortNames.size).toBe(12);
    expect(TEMPLATE_CATEGORIES.map((c) => categoryName(T.es, c))).toEqual(['Empresa', 'Tecnología', 'Creativo', 'Salud', 'Académico', 'Oficios']);
    expect(TEMPLATES.map((t) => t.id)).toEqual([
      'corporate-boardroom', 'corporate-partner', 'tech-builder', 'tech-architect', 'creative-editorial', 'creative-studio',
      'healthcare-practitioner', 'healthcare-educator', 'academic-scholar', 'academic-researcher', 'trades-operator', 'trades-foreman',
    ]);
  });

  it('Home, gallery, filters, template preview and the switcher read template text through the catalog', () => {
    for (const file of ['features/templates/TemplateCard.tsx', 'features/templates/TemplatePreviewScreen.tsx', 'features/preview/PreviewScreen.tsx', 'features/library/HomeScreen.tsx']) {
      expect(read(file), file).toMatch(/templateText\(t, /);
    }
    expect(read('features/templates/TemplateGalleryScreen.tsx')).toMatch(/categoryName\(t, f\)/);
  });

  it('the DOCX title uses the Spanish template name for a Spanish resume', async () => {
    expect((await docxXml('es', 'trades-foreman')).core).toContain('El Capataz');
    expect((await docxXml('fr', 'trades-foreman')).core).toContain('Le Contremaître');
    expect((await docxXml('en', 'trades-foreman')).core).toContain('The Foreman');
  });
});

// --- resume document ---

describe('Spanish resume documents', () => {
  it('the canonical labels resolve to Spanish (one source for PDF, preview and DOCX)', () => {
    expect(resumeLabels('es')).toEqual({
      summary: 'Perfil profesional',
      experience: 'Experiencia',
      education: 'Formación',
      certifications: 'Certificaciones',
      projects: 'Proyectos',
      awards: 'Premios',
      resume: 'Currículum',
      previewWatermark: 'PREVIA',
    });
    expect(resumeLabels('es')).toEqual(es.resume.labels);
  });

  it('every template, PDF and preview, Letter and A4, with and without watermark: Spanish headings, lang="es", dir="ltr"', () => {
    for (const t of TEMPLATES) {
      for (const mode of ['pdf', 'preview'] as const) {
        for (const watermark of [false, true]) {
          for (const paper of ['letter', 'a4'] as const) {
            const page = render('es', t.id, mode, { watermark, paper });
            const where = `${t.id} ${mode} ${watermark} ${paper}`;
            expect(page, where).toContain('<html lang="es" dir="ltr">');
            expect(headingsIn(page), where).toEqual(SPANISH_LABELS);
            expect(page, where).not.toContain('/*rtl*/');
            // The renderer's watermark tile carries the Spanish label; a PDF never has one.
            expect(page.includes(tileText('PREVIA')), where).toBe(mode === 'preview' && watermark);
            expect(page, where).not.toContain(tileText('PREVIEW'));
          }
        }
      }
    }
    // With no name, the document title is the Spanish label.
    expect(render('es', 'tech-builder', 'pdf', { data: { ...emptyResume() } })).toContain('<title>Currículum</title>');
  });

  it('the DOCX has the same Spanish headings for every template, and no English, German or French labels', async () => {
    for (const t of TEMPLATES) {
      const { body } = await docxXml('es', t.id);
      for (const label of SPANISH_LABELS) expect(body, `${t.id} ${label}`).toContain(`>${label.toUpperCase()}<`);
      for (const label of [...ENGLISH_LABELS, ...GERMAN_LABELS, ...FRENCH_LABELS]) {
        expect(body, `${t.id} ${label}`).not.toContain(`>${label.toUpperCase()}<`);
      }
    }
  });

  it('the app preview is clean (free product) and in the resume language; the PDF HTML too', () => {
    const shown = renderPreview(stored('es'));
    expect(shown).toContain('<html lang="es" dir="ltr">');
    expect(headingsIn(shown)).toEqual(SPANISH_LABELS);
    expect(shown).not.toContain('class="watermark"');
    expect(shown).not.toContain(tileText('PREVIA'));
    const printed = pdfHtml(stored('es'), 'a4');
    expect(headingsIn(printed)).toEqual(SPANISH_LABELS);
    expect(printed).not.toContain('class="watermark"');
  });

  it('Spanish is left-to-right with the Latin typography (no RTL rules)', () => {
    expect(directionOf('es')).toBe('ltr');
    const page = render('es', 'creative-editorial');
    expect(page).not.toContain('/*rtl*/');
    expect(page).not.toContain('<bdi');
  });
});

// --- language separation ---

describe('app language and resume language never leak into each other', () => {
  type Shown = 'en' | 'de' | 'fr' | 'es';
  const combos: [Shown, Shown][] = [
    ['es', 'es'], // A: Spanish UI + Spanish document
    ['es', 'en'], // B: Spanish UI + English document
    ['en', 'es'], // C: English UI + Spanish document
    ['de', 'es'], // D: German UI + Spanish document
    ['fr', 'es'], // E: French UI + Spanish document
  ];
  const UI = {
    en: { create: 'Create my resume', preview: 'Preview', builder: 'The Builder', content: 'Content' },
    de: { create: 'Lebenslauf erstellen', preview: 'Vorschau', builder: 'Der Baustein', content: 'Inhalt' },
    fr: { create: 'Créer mon CV', preview: 'Aperçu', builder: 'Le Bâtisseur', content: 'Contenu' },
    es: { create: 'Crear mi currículum', preview: 'Vista previa', builder: 'El Constructor', content: 'Contenido' },
  } as const;
  const DOC = {
    en: { headings: ENGLISH_LABELS, experience: 'EXPERIENCE', builder: 'The Builder' },
    de: { headings: GERMAN_LABELS, experience: 'BERUFSERFAHRUNG', builder: 'Der Baustein' },
    fr: { headings: FRENCH_LABELS, experience: 'EXPÉRIENCE PROFESSIONNELLE', builder: 'Le Bâtisseur' },
    es: { headings: SPANISH_LABELS, experience: 'EXPERIENCIA', builder: 'El Constructor' },
  } as const;

  it.each(combos)('app %s, resume %s', async (app, resumeLanguage) => {
    const dir = tempDir();
    const db = openTestDatabase(dir.file('app.db'));
    const store = await initializeDatabase(db, { newId: testId });
    await store.settings.setAppLanguage(app);
    const library = new ResumeLibrary(store.resumes, { newId: testId, defaultLanguage: () => app });
    const resume = library.create(SAMPLE_RESUME, 'CV', 'tech-builder', resumeLanguage);
    await library.flush();

    // UI: the app language only.
    const { t } = createTranslator((await store.settings.getAppLanguage())!);
    expect(t('home.create')).toBe(UI[app].create);
    expect(t('nav.preview')).toBe(UI[app].preview);
    expect(templateText(t, 'tech-builder').name).toBe(UI[app].builder);
    // Analysis of the resume is shown in the app language.
    const score = scoreResume(resume.data, resume.language);
    expect(renderText(t, score.categories[0].labelText)).toBe(UI[app].content);

    // Document: the resume language only.
    const saved = (await store.resumes.get(resume.id))!;
    expect(saved.language).toBe(resumeLanguage);
    const page = pdfHtml(saved, 'letter');
    expect(page).toContain(`<html lang="${resumeLanguage}" dir="ltr">`);
    expect(headingsIn(page)).toEqual(DOC[resumeLanguage].headings);
    const { body, core } = await docxXml(resumeLanguage, 'tech-builder');
    expect(body).toContain(`>${DOC[resumeLanguage].experience}<`);
    expect(core).toContain(DOC[resumeLanguage].builder);

    // Neither setting moved.
    expect(await store.settings.getAppLanguage()).toBe(app);
    expect((await store.resumes.get(resume.id))!.language).toBe(resumeLanguage);
    await db.close();
    dir.cleanup();
  });

  it('template discovery shows the English sample with English labels, and Spanish UI says so', () => {
    const sample = templateSampleHtml('corporate-boardroom');
    expect(sample).toContain('<html lang="en" dir="ltr">');
    expect(headingsIn(sample)).toEqual(ENGLISH_LABELS);
    expect(T.es('templatePreview.sampleNote')).toMatch(/contenido de ejemplo en inglés/);
  });

  it('the Spanish app language and resume language resolve from storage, device lists and unknown values', () => {
    expect(toLanguage('es')).toBe('es');
    expect(toLanguage('ES')).toBe('en');
    expect(resolveLanguage(['es-MX'])).toBe('es');
    expect(resolveLanguage(['es_ES', 'fr'])).toBe('es');
    expect(resolveLanguage(['es-419'])).toBe('es');
    expect(LANGUAGES).toContain('es');
  });
});

// --- analysis messages ---

describe('Spanish analysis messages', () => {
  const codesIn = (value: unknown, out: AnalysisText[] = []): AnalysisText[] => {
    if (Array.isArray(value)) for (const v of value) codesIn(v, out);
    else if (value && typeof value === 'object') {
      if (typeof (value as AnalysisText).code === 'string') out.push(value as AnalysisText);
      else for (const v of Object.values(value)) codesIn(v, out);
    }
    return out;
  };

  it('every code the engines emit renders in Spanish (nested codes too), with every parameter filled', () => {
    const reports: unknown[] = [];
    for (const data of [SAMPLE_RESUME, emptyResume(), ...Object.values(ATS_STRONG), ...Object.values(ATS_WEAK), ...Object.values(ATS_EDGE)]) {
      reports.push(scoreResume(normalizeResumeData(data), 'es'));
      for (const t of TEMPLATES) reports.push(checkAtsReadability(data, t.id, 'es'));
    }
    for (const data of Object.values(JOB_RESUMES)) for (const jd of Object.values(JDS)) reports.push(analyzeJobMatch(data, jd, 'es'));
    for (const entry of COACH_WEAK) reports.push(analyzeText(entry.text, buildCoachContext(entry.field, 'en', entry.siblings ?? [])));
    const codes = codesIn(reports);
    expect(new Set(codes.map((c) => c.code)).size).toBeGreaterThan(80);
    for (const coded of codes) {
      const spanish = renderText(T.es, coded);
      expect(spanish, coded.code).not.toMatch(/\{\w+\}|analysis\.|templates\./);
      if (ES.get(coded.code) !== EN.get(coded.code)) expect(spanish, coded.code).not.toBe(renderText(T.en, coded));
    }
    // Nested codes follow the app language: the tense and the ATS template name.
    expect(renderText(T.es, { code: 'analysis.coach.tense', params: { theirs: { code: 'analysis.coach.tenses.past' }, word: 'Lead', mine: { code: 'analysis.coach.tenses.present' } } })).toBe(
      'Las demás viñetas de esta entrada están en pasado; esta empieza por «Lead» (en presente).',
    );
    expect(renderText(T.es, checkAtsReadability(SAMPLE_RESUME, 'trades-foreman', 'es').checks.find((c) => c.rule === 'template-text')!.titleText)).toBe(
      'Texto de la plantilla (El Capataz)',
    );
  });

  it('the rules are unchanged: a Spanish resume gets the same scores, statuses and findings as English', () => {
    for (const data of [SAMPLE_RESUME, ...Object.values(ATS_WEAK)]) {
      const score = (language: Language) => {
        const r = scoreResume(normalizeResumeData(data), language);
        return { score: r.score, warnings: r.warnings.map((w) => [w.id, w.messageText]), strengths: r.strengthTexts, categories: r.categories.map((c) => c.status) };
      };
      expect(score('es')).toEqual(score('en'));
      const ats = (language: Language) =>
        checkAtsReadability(data, 'tech-builder', language).checks.map((c) => [c.rule, c.status, c.findings.map((f) => [f.id, f.status, f.messageText.code])]);
      expect(ats('es')).toEqual(ats('en'));
    }
  });

  it('never claims Spanish language analysis: the English-rules limits are stated in Spanish', () => {
    for (const engine of ['resumeScore', 'ats', 'jobMatch', 'coverLetter', 'import'] as const) expect(analysisSupport(engine, 'es').kind).toBe('english-rules');
    expect(analysisSupport('writingCoach', 'es').kind).toBe('unavailable');
    expect(analyzeText('Helped with the launch', buildCoachContext('experienceBullet', 'es')).findings).toEqual([]);
    expect(T.es('tools.englishRules', { language: LANGUAGE_NAMES.es })).toBe(
      'Estas revisiones usan reglas y vocabulario en inglés. Con el idioma del currículum (Español), los resultados pueden ser incompletos.',
    );
    expect(T.es('editor.coachUnavailable')).toMatch(/solo funciona por ahora con currículums en inglés/);
    expect(T.es('letter.englishOnly')).toMatch(/se redacta en inglés/);
    expect(T.es('import.englishHeadings')).toMatch(/solo se reconocen en inglés/);
    expect(T.es('analysis.ats.dates.noEnd')).toMatch(/solo reconoce por ahora términos en inglés/);
    expect(T.es('analysis.coach.article', { article: 'an', next: 'analysis' })).toMatch(/^En inglés, usa/);
  });

  it('Job Match keeps the English taxonomy; only the UI around it is Spanish', () => {
    const report = analyzeJobMatch(SAMPLE_RESUME, JDS.softwareEngineer, 'es');
    expect(report.terms.map((term) => term.label)).toEqual(analyzeJobMatch(SAMPLE_RESUME, JDS.softwareEngineer, 'en').terms.map((term) => term.label));
    expect(T.es('match.sections.required')).toBe('Requisitos');
  });
});

// --- app UI and the free product ---

describe('Spanish app UI', () => {
  it('screens resolve Spanish text', () => {
    expect(T.es('home.create')).toBe('Crear mi currículum');
    expect(T.es('gallery.useTemplate')).toBe('Usar plantilla');
    expect(T.es('editor.sections.experience')).toBe('Experiencia');
    expect(T.es('preview.export', { format: T.es('preview.formats.pdf') })).toBe('PDF');
    expect(T.es('tools.tabs.match')).toBe('Adecuación');
    expect(T.es('home.deleteBody', { title: 'CV' })).toBe('«CV» se eliminará de este dispositivo.');
    expect(T.es('settings.appLanguage')).toBe('Idioma de la app');
  });

  it('the Language screen lists every language by its own name; Spanish is "Español" and persists', async () => {
    expect(LANGUAGES.map((l) => LANGUAGE_NAMES[l])).toEqual(['English', 'Deutsch', 'Français', 'Español', 'العربية']);
    const dir = tempDir();
    const db = openTestDatabase(dir.file('app.db'));
    const app = await initializeDatabase(db, { newId: testId });
    await app.settings.setAppLanguage('es');
    expect(await app.settings.getAppLanguage()).toBe('es');
    expect(read('features/settings/LanguageSettingsScreen.tsx')).toMatch(/setAppLanguage\(language\)/);
    expect(T.es('settings.restart')).toBe('Cierra y vuelve a abrir la app para cambiar la dirección del diseño.');
    await db.close();
    dir.cleanup();
  });

  it('has no monetization text or keys (My Resume is free)', () => {
    expect(es).not.toHaveProperty('paywall');
    expect(es.nav).not.toHaveProperty('premium');
    expect(es.coach).not.toHaveProperty('locked');
    expect(es.match).not.toHaveProperty('compareLocked');
    expect(es.preview).not.toHaveProperty('locked');
    expect(es.preview).not.toHaveProperty('devStore');
    const all = [...ES.values()].flatMap(forms).join('\n');
    expect(all).not.toMatch(/premium|suscri|\bcompr(a|ar|as)\b|\bpag(o|ar|os)\b|precio|tarifa|restaurar compras|bloquead|desbloque|de por vida|actualiza a|€|\$\s?\d|🔒/i);
  });

  it('a key missing from Spanish falls back to English, key by key', () => {
    const partial: Record<Language, PartialMessages> = { ...CATALOGS, es: { ...es, home: { ...es.home, seeAll: undefined } } };
    const { t } = createTranslator('es', partial);
    expect(t('home.seeAll')).toBe('See all');
    expect(t('home.create')).toBe('Crear mi currículum');
  });
});

// --- regression: the other languages and the free product are untouched ---

describe('other catalogs are unchanged by the Spanish work', () => {
  it('English, German and French keep exactly their previous text', () => {
    expect(leaves(en)).toHaveLength(445);
    expect(catalogHash(en)).toBe('bbd8860f9c6f7fc294f00b930f2808855ed2aa9fb7eb87626f10c317cc2fbd10');
    expect(catalogHash(de)).toBe('99a5cf244a82e7f666d671611812683c99c6873fd8640f248de9ba8fdf19dd7a');
    expect(catalogHash(fr)).toBe('333fc9f2ec87050ad4e0703142550697edaf9ed3998cc12bf7f9340d1db07ea6');
  });
});

// --- UI fit ---

describe('Spanish strings in narrow places', () => {
  // Budgets from Chromium measurements of each slot at 360 dp (Liberation Sans as a
  // stand-in for Roboto/SF, +8% margin): the Spanish text must be no longer than what fits,
  // or no longer than the English text that already fits there.
  const len = (s: string) => [...s].length;

  it('tabs, buttons, chips, badges and status labels stay within their measured budgets', () => {
    for (const key of ['check', 'ats', 'match', 'letter'] as const) {
      for (const word of es.tools.tabs[key].split(' ')) expect(len(word), `tab ${key}`).toBeLessThanOrEqual(11);
    }
    // Export buttons: the shown text is no longer than the English "Export Image" that fits at the shrink floor.
    for (const format of Object.values(es.preview.formats)) {
      expect(len(T.es('preview.export', { format }))).toBeLessThanOrEqual(len(T.en('preview.export', { format: en.preview.formats.image })));
    }
    expect(len(es.gallery.useTemplate)).toBeLessThanOrEqual(14);
    expect(len(es.gallery.atsReady)).toBeLessThanOrEqual(14);
    for (const id of Object.keys(es.templates).filter((k) => k !== 'categories') as (keyof typeof es.templates)[]) {
      const entry = es.templates[id] as { name: string; shortName: string };
      expect(len(entry.shortName), id).toBeLessThanOrEqual(13);
      expect(len(entry.name), id).toBeLessThanOrEqual(16);
    }
    for (const name of Object.values(es.templates.categories)) expect(len(name)).toBeLessThanOrEqual(12);
    for (const status of Object.values(es.check.status)) expect(len(status)).toBeLessThanOrEqual(12);
    expect(len(es.editor.add)).toBeLessThanOrEqual(13);
    expect(len(es.editor.moveUp) + len(es.editor.moveDown) + len(es.editor.remove)).toBeLessThanOrEqual(30);
    expect(len(es.match.detected)).toBeLessThanOrEqual(len(en.match.detected));
    expect(len(es.match.notDetected)).toBeLessThanOrEqual(len(en.match.notDetected));
    expect(len(es.ats.detected)).toBeLessThanOrEqual(10);
    expect(len(es.ats.notDetected)).toBeLessThanOrEqual(12);
    // The editor header links ("Herramientas", "Vista previa") are the widest pair; the title shrinks first.
    expect(len(es.editor.tools) + len(es.editor.preview)).toBeLessThanOrEqual(24);
  });

  it('the layouts that hold longer words can wrap or shrink locally (shared with German and French; English unchanged)', () => {
    const tools = read('features/tools/ToolsScreen.tsx');
    expect(tools).toMatch(/adjustsFontSizeToFit=\{oneWord\}/);
    expect(tools).toMatch(/numberOfLines=\{oneWord \? 1 : 2\}/);
    expect(read('features/library/HomeScreen.tsx')).toMatch(/flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center'/);
    expect(read('features/editor/EditorScreen.tsx')).toMatch(/flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'flex-end'/);
    expect(read('ui/components.tsx')).toMatch(/styles\.sectionTitle, \{ flexShrink: 1 \}/);
    expect(read('features/preview/PreviewScreen.tsx')).toMatch(/fit\n/);
    expect(read('features/templates/TemplateCard.tsx')).toMatch(/fit\n/);
  });
});

// --- file names ---

describe('Spanish file names', () => {
  it('keep accents and ñ, use hyphens, and are deterministic', () => {
    expect(fileSafeName('José García')).toBe('josé-garcía');
    expect(fileSafeName('María López')).toBe('maría-lópez');
    expect(fileSafeName('Ángel Núñez')).toBe('ángel-núñez');
    expect(fileSafeName('Iñaki Fernández')).toBe('iñaki-fernández');
    // The ordinal indicator in "Mª" (María) is not a letter, so the existing rules drop it
    // (the result is still safe and deterministic).
    expect(fileSafeName('Mª José  de la Peña-Ruiz')).toBe('m-josé-de-la-peña-ruiz');
    expect(fileSafeName('ÁNGEL NÚÑEZ')).toBe('ángel-núñez');
    expect(fileSafeName('Iñaki Fernández')).toBe(fileSafeName('Iñaki Fernández'));
    // NFD input (as some keyboards produce) gives the same name as NFC.
    expect(fileSafeName('José García')).toBe('josé-garcía');
    expect(fileSafeName('Ángel Núñez')).toBe('ángel-núñez');
    expect(fileSafeName('Iñaki Fernández')).toBe('iñaki-fernández');
    // Path and shell characters never survive; the 60-character cap and no trailing hyphen remain.
    expect(fileSafeName('../José/García:*?')).toBe('josé-garcía');
    expect(fileSafeName('¿Quién es José?')).toBe('quién-es-josé');
    const long = fileSafeName('José García '.repeat(8));
    expect([...long].length).toBeLessThanOrEqual(60);
    expect(long).toMatch(/^josé-garcía-josé-garcía/);
    expect(long).not.toMatch(/-$/);
    const exact = fileSafeName(`${'ñ'.repeat(59)} ñ`);
    expect([...exact].length).toBeLessThanOrEqual(60);
    expect(exact).not.toMatch(/-$/);
    const resume = stored('es', { data: { ...SAMPLE_RESUME, name: 'Ángel Núñez' } });
    expect(exportFileName(resume, 'pdf')).toBe('ángel-núñez.pdf');
    expect(exportFileName(resume, 'docx')).toBe('ángel-núñez.docx');
    expect(exportFileName(resume, 'png', { index: 1, count: 2 })).toBe('ángel-núñez-page-2.png');
    expect(exportFileName(resume, 'pdf')).not.toContain('_');
  });
});

// --- real PDFs and layout (Chromium + pdf.js) ---

const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CONTENT_PX: Record<PaperSize, number> = { letter: 672, a4: Math.round((210 / 25.4 - 1.5) * 96) };
const ACCENT_SENTENCE = '¿Qué pasó en el año 2023? ¡Éxito con pingüinos y cigüeñas en Perú! Rápido, fácil, atención, país.';
const SPANISH_DATA: ResumeData = {
  ...SAMPLE_RESUME,
  name: 'Ángel Núñez',
  summary: { ...SAMPLE_RESUME.summary, bullets: [ACCENT_SENTENCE, ...SAMPLE_RESUME.summary.bullets.slice(1)] },
};

describe.skipIf(!existsSync(CHROMIUM))('Spanish documents in a real engine', () => {
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

  it('every template, Letter and A4: the PDF text layer has the Spanish headings, the accented name and every accent as whole words', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    await page.emulateMedia({ media: 'print' });
    for (const t of TEMPLATES) {
      for (const paper of ['letter', 'a4'] as const) {
        await page.setContent(pdfHtml(stored('es', { templateId: t.id, accent: t.defaultAccent, data: SPANISH_DATA }), paper));
        const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
        const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
        let text = '';
        for (let n = 1; n <= doc.numPages; n++) {
          const content = await (await doc.getPage(n)).getTextContent();
          text += content.items.map((i) => ('str' in i ? i.str : '')).join(' ') + ' ';
        }
        const lower = text.replace(/\s+/g, ' ').toLowerCase();
        for (const label of SPANISH_LABELS) expect(lower, `${t.id} ${paper} ${label}`).toContain(label.toLowerCase());
        expect(lower, `${t.id} ${paper}`).toContain('ángel núñez');
        // á é í ó ú ü ñ ¿ ¡ in one sentence.
        expect(lower, `${t.id} ${paper}`).toContain(ACCENT_SENTENCE.toLowerCase());
        expect(lower, `${t.id} ${paper}`).not.toContain('vista previa');
      }
    }
  }, 180_000);

  it('Spanish headings fit on one line, stay inside the page and never touch a decorative mark (PDF and watermarked preview)', async () => {
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
          await page.setContent(render('es', t.id, mode, { paper, watermark: mode === 'preview', data: SPANISH_DATA }), { waitUntil: 'load' });
          const result = await page.evaluate(() => {
            const root = document.querySelector('.content')!.getBoundingClientRect();
            const headings = Array.from(document.querySelectorAll('.content h2')).map((h) => {
              const range = document.createRange();
              range.selectNodeContents(h);
              const lines = new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top)));
              const r = h.getBoundingClientRect();
              return { text: h.textContent, lines: lines.size, inside: r.left >= root.left - 0.5 && r.right <= root.right + 0.5, clipped: h.scrollWidth > h.clientWidth + 1 };
            });
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
            const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
            return { headings, touching, overflow };
          });
          const where = `${t.id} ${mode} ${paper}`;
          expect(result.headings.map((h) => h.text), where).toEqual(SPANISH_LABELS);
          for (const h of result.headings) {
            expect(h.lines, `${where} ${h.text}`).toBe(1);
            expect(h.inside, `${where} ${h.text}`).toBe(true);
            expect(h.clipped, `${where} ${h.text}`).toBe(false);
          }
          expect(result.touching, where).toBe(false);
          expect(result.overflow, where).toBeLessThanOrEqual(0);
        }
      }
    }
  }, 180_000);

  it('the watermark label fits its tile: "PREVIA" is not wider than the 300 px tile, so it is never cut', async () => {
    await page.setViewportSize({ width: 900, height: 1000 });
    const widths = await page.evaluate(() => {
      const measure = (label: string) => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
        text.setAttribute('font-size', '46');
        text.setAttribute('font-weight', '700');
        text.setAttribute('letter-spacing', '0');
        text.textContent = label;
        svg.appendChild(text);
        document.body.appendChild(svg);
        const width = text.getBBox().width;
        svg.remove();
        return width;
      };
      return { previa: measure('PREVIA'), preview: measure('PREVIEW'), vista: measure('VISTA PREVIA') };
    });
    expect(widths.previa).toBeLessThanOrEqual(300);
    expect(widths.preview).toBeLessThanOrEqual(300);
    // The reason for the short label: the full phrase would not fit the tile.
    expect(widths.vista).toBeGreaterThan(300);
  });
});

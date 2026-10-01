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
import { directionOf, LANGUAGE_NAMES, LANGUAGES, resolveLanguage, type Language } from '../domain/i18n/languages';
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

// Phase 13D: French (fr) localization. The analysis rules stay English; French is the
// app language and/or the resume's document language.

const SRC = join(__dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');
const T = { fr: createTranslator('fr').t, de: createTranslator('de').t, en: createTranslator('en').t };
const NBSP = ' ';
/** Intl uses narrow no-break spaces in French numbers; compare with plain spaces. */
const plain = (s: string) => s.replace(/[\s  ]/g, ' ');

type Leaf = string | Record<string, string>;
/** key → value (a string, or a plural object) for every message in a catalog. */
const leaves = (node: unknown, prefix = ''): [string, Leaf][] =>
  typeof node === 'object' && node !== null && !('other' in node)
    ? Object.entries(node).flatMap(([k, v]) => leaves(v, `${prefix}${k}.`))
    : [[prefix.slice(0, -1), node as Leaf]];
const EN = new Map(leaves(en));
const DE = new Map(leaves(de));
const FR = new Map(leaves(fr));
const forms = (value: Leaf) => (typeof value === 'string' ? [value] : Object.values(value));
const params = (value: Leaf) => new Set(forms(value).flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])));

const FRENCH_LABELS = ['Profil', 'Expérience professionnelle', 'Formation', 'Certifications', 'Projets', 'Distinctions'];
const ENGLISH_LABELS = ['Summary', 'Experience', 'Education', 'Certifications', 'Projects', 'Awards'];
const GERMAN_LABELS = ['Kurzprofil', 'Berufserfahrung', 'Ausbildung', 'Zertifikate', 'Projekte', 'Auszeichnungen'];
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
  title: 'Mon CV',
  templateId: 'corporate-boardroom',
  accent: '#1B2B47',
  language,
  data: SAMPLE_RESUME,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

// --- catalog ---

describe('French catalog', () => {
  it('has a French value for every English key, and no other keys', () => {
    expect([...FR.keys()].sort()).toEqual([...EN.keys()].sort());
    expect(FR.size).toBe(445);
    expect(EN.size).toBe(445);
    for (const [key, value] of FR) for (const form of forms(value)) expect(form.trim(), key).not.toBe('');
    // The runtime catalog is the complete file.
    expect(CATALOGS.fr).toBe(fr);
  });

  it('translates every key; the few identical values are names, cognates or pure formats', () => {
    const identical = [...FR].filter(([key, value]) => JSON.stringify(value) === JSON.stringify(EN.get(key))).map(([key]) => key).sort();
    expect(identical).toEqual([
      // Product and brand names (My Resume, Writing Coach's short name "Coach", LinkedIn).
      'analysis.location.linkedin', 'coach.open', 'editor.fields.personal.linkedin', 'nav.home',
      // Words that are the same in French: dates, structure, certifications, tech, image, "Export …".
      'analysis.ats.dates.title', 'analysis.location.entry.certification', 'analysis.location.field.date', 'analysis.score.categories.structure',
      'editor.fields.certifications.date', 'editor.sections.certifications', 'preview.export', 'preview.formats.image', 'resume.labels.certifications',
      'templates.categories.Tech',
      // Technical names.
      'preview.formats.docx', 'preview.formats.pdf', 'tools.tabs.ats',
      // Pure formats and separators: parameters and punctuation only.
      'analysis.location.inEntry', 'ats.separator', 'check.outOf', 'editor.listCount', 'editor.listItem', 'home.templateAndDate', 'match.charCount',
      'match.listSeparator', 'match.separator',
    ].sort());
  });

  it('is its own translation: never German text, never an English copy of a German key', () => {
    // Same in French and German on purpose: "Atelier" is a French word German borrowed, and
    // 03/2020 is a numeric date format that belongs to neither language.
    const SHARED_WITH_GERMAN = ['templates.creative-studio.shortName', 'editor.startPlaceholder'];
    for (const [key, value] of FR) {
      if (JSON.stringify(value) === JSON.stringify(DE.get(key)) && !SHARED_WITH_GERMAN.includes(key)) {
        expect(JSON.stringify(value), key).toBe(JSON.stringify(EN.get(key)));
      }
    }
    const all = [...FR.values()].flatMap(forms).join('\n');
    expect(all).not.toMatch(/Lebenslauf|Vorlage|Berufserfahrung|Zertifikate|Auszeichnungen|\bund\b|\bnicht\b/);
  });

  it('every message takes exactly the parameters of its English source', () => {
    for (const [key, value] of FR) expect([...params(value)].sort(), key).toEqual([...params(EN.get(key)!)].sort());
  });

  it('plural messages are the same 10 keys as English, with valid categories, and counted forms show the count', () => {
    const plurals = [...FR].filter(([, value]) => typeof value !== 'string');
    expect(plurals.map(([key]) => key).sort()).toEqual([...EN].filter(([, v]) => typeof v !== 'string').map(([k]) => k).sort());
    expect(plurals).toHaveLength(10);
    for (const [key, value] of plurals) {
      expect(Object.keys(value).sort(), key).toEqual(['one', 'other']);
      for (const form of forms(value)) expect(form, key).toContain('{count}');
    }
  });

  it('uses French typography: « … » with no-break spaces, no-break space before : ; ? !, typographic apostrophes', () => {
    for (const [key, value] of FR) {
      for (const form of forms(value)) {
        expect(form, key).not.toMatch(/["“”']/); // no straight or English quotes, no straight apostrophes
        expect((form.match(/«/g) ?? []).length, key).toBe((form.match(/»/g) ?? []).length);
        expect(form, key).not.toMatch(/«(?! )|(?<! )»/);
        expect(form, key).not.toMatch(/ [:;?!]|[^\s ][:;?!]/); // never a regular space, never nothing, before : ; ? !
      }
    }
    expect(NBSP).toBe(String.fromCharCode(160));
    expect(fr.home.deleteBody).toBe(`«${NBSP}{title}${NBSP}» sera supprimé de cet appareil.`);
    expect(fr.analysis.coach.measurable).toBe(`Pouvez-vous ajouter ici un résultat mesurable${NBSP}?`);
  });

  it('uses one term per concept (terminology map)', () => {
    const all = [...FR.values()].flatMap(forms).join('\n');
    // Rejected alternatives for the chosen terms.
    for (const avoid of [/Résumé\b(?! court)/, /Curriculum/, /Compétence clé/, /Lettre d’accompagnement|Lettre de présentation/, /Template|Gabarit/, /Prévisualisation|Preview/, /Bulletpoint|Pastille de liste/, /\btu\b|\bton\b|\bta\b|\btes\b/i]) {
      expect(all, String(avoid)).not.toMatch(avoid);
    }
    expect(fr.resume.labels.experience).toBe(fr.editor.sections.experience);
    expect(fr.resume.labels.education).toBe(fr.editor.sections.education);
    expect(fr.resume.labels.certifications).toBe(fr.editor.sections.certifications);
    expect(fr.resume.labels.projects).toBe(fr.editor.sections.projects);
    expect(fr.resume.labels.awards).toBe(fr.editor.sections.awards);
    expect(fr.analysis.location.section.skills).toBe(fr.editor.fields.summary.skills);
    expect(fr.nav.preview).toBe(fr.editor.preview);
    expect(fr.tools.tabs.letter).toBe('Lettre de motivation');
    expect(fr.resume.labels.resume).toBe('CV');
  });
});

// --- plurals, numbers, dates ---

describe('French plurals and formatting', () => {
  it('zero, one and several use the CLDR French forms (0 and 1 are singular)', () => {
    expect([0, 1, 1.5, 2, 5].map((n) => pluralCategory('fr', n))).toEqual(['one', 'one', 'one', 'other', 'other']);
    expect([0, 1, 3].map((count) => T.fr('ats.issues', { count }))).toEqual(['0 problème potentiel', '1 problème potentiel', '3 problèmes potentiels']);
    expect([0, 1, 2].map((count) => T.fr('match.mentionLines', { count }))).toEqual([' (0 ligne)', ' (1 ligne)', ' (2 lignes)']);
    expect([1, 4].map((count) => T.fr('match.termsDetected', { count }))).toEqual(['1 terme de l’offre détecté', '4 termes de l’offre détectés']);
    expect([1, 4].map((count) => T.fr('match.alsoFound', { count }))).toEqual(['1 aussi présent dans votre CV', '4 aussi présents dans votre CV']);
    expect([1, 3].map((count) => T.fr('ats.toCheck', { count }))).toEqual(['1 à vérifier', '3 à vérifier']);
    expect(plain(renderText(T.fr, { code: 'analysis.coach.longBullet', params: { count: 40, max: 32 } }))).toBe(
      'Cette puce compte 40 mots. Visez 32 mots ou moins pour que le résultat se repère facilement.',
    );
    expect(renderText(T.fr, { code: 'analysis.coach.longBullet', params: { count: 1, max: 32 } })).toContain('compte 1 mot.');
    expect(renderText(T.fr, { code: 'analysis.score.warnings.shortBullets', params: { count: 1 } })).toBe('1 puce d’expérience pourrait être plus percutante.');
    expect(renderText(T.fr, { code: 'analysis.score.warnings.shortBullets', params: { count: 3 } })).toBe('3 puces d’expérience pourraient être plus percutantes.');
    expect(renderText(T.fr, { code: 'analysis.coach.repeatedOpener', params: { count: 2, word: 'Led' } })).toContain('2 puces de cette entrée commencent par');
  });

  it('app-generated numbers and dates use French formats; user text is untouched', () => {
    expect(formatNumber('fr', 1234.5).replace(/[\s ]/g, ' ')).toBe('1 234,5');
    expect(plain(T.fr('match.charCount', { count: 1234, max: JOB_DESCRIPTION_MAX }))).toBe('1 234 / 25 000');
    expect(formatDate('fr', Date.UTC(2026, 2, 15, 12))).toMatch(/^15 mars 2026$/);
    expect(T.fr('share.page', { title: 'CV', index: 2, count: 3 })).toBe('CV (page 2 sur 3)');
    let message = '';
    try {
      analyzeJobMatch(SAMPLE_RESUME, 'x'.repeat(JOB_DESCRIPTION_MAX + 1), 'fr');
    } catch (error) {
      message = errorText(T.fr, error, 'match.failed');
    }
    expect(plain(message)).toBe('Cette offre d’emploi est trop longue (25 000 caractères maximum).');
    // A resume date the user typed is shown exactly as typed.
    const data = { ...SAMPLE_RESUME, experience: [{ ...SAMPLE_RESUME.experience[0], start: 'mars 2020', end: 'Aujourd’hui' }] };
    const page = render('fr', 'corporate-boardroom', 'pdf', { data });
    expect(page).toContain('mars 2020');
    expect(page).toContain('Aujourd’hui');
  });
});

// --- template metadata ---

describe('French template metadata', () => {
  it('names, short names, descriptions and categories are French for all 12 templates; ids unchanged', () => {
    expect(TEMPLATES).toHaveLength(12);
    const names = new Set<string>();
    const shortNames = new Set<string>();
    for (const template of TEMPLATES) {
      const french = templateText(T.fr, template.id);
      const english = templateText(T.en, template.id);
      const german = templateText(T.de, template.id);
      for (const field of ['name', 'shortName', 'description'] as const) {
        expect(french[field], `${template.id} ${field}`).not.toBe(english[field]);
        if (template.id !== 'creative-studio' || field !== 'shortName') expect(french[field], `${template.id} ${field}`).not.toBe(german[field]);
        expect(french[field]).not.toMatch(/^templates\./);
      }
      expect(french.category).toBe(fr.templates.categories[template.category as keyof typeof fr.templates.categories]);
      names.add(french.name);
      shortNames.add(french.shortName);
    }
    expect(names.size).toBe(12);
    expect(shortNames.size).toBe(12);
    expect(TEMPLATE_CATEGORIES.map((c) => categoryName(T.fr, c))).toEqual(['Entreprise', 'Tech', 'Créatif', 'Santé', 'Académique', 'Métiers']);
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

  it('the DOCX title uses the French template name for a French resume', async () => {
    expect((await docxXml('fr', 'trades-foreman')).core).toContain('Le Contremaître');
    expect((await docxXml('en', 'trades-foreman')).core).toContain('The Foreman');
    expect((await docxXml('de', 'trades-foreman')).core).toContain('Der Meisterbrief');
  });
});

// --- resume document ---

describe('French resume documents', () => {
  it('the canonical labels resolve to French (one source for PDF, preview and DOCX)', () => {
    expect(resumeLabels('fr')).toEqual({
      summary: 'Profil',
      experience: 'Expérience professionnelle',
      education: 'Formation',
      certifications: 'Certifications',
      projects: 'Projets',
      awards: 'Distinctions',
      resume: 'CV',
      previewWatermark: 'APERÇU',
    });
    expect(resumeLabels('fr')).toEqual(fr.resume.labels);
  });

  it('every template, PDF and preview, Letter and A4, with and without watermark: French headings, lang="fr", dir="ltr"', () => {
    for (const t of TEMPLATES) {
      for (const mode of ['pdf', 'preview'] as const) {
        for (const watermark of [false, true]) {
          for (const paper of ['letter', 'a4'] as const) {
            const page = render('fr', t.id, mode, { watermark, paper });
            const where = `${t.id} ${mode} ${watermark} ${paper}`;
            expect(page, where).toContain('<html lang="fr" dir="ltr">');
            expect(headingsIn(page), where).toEqual(FRENCH_LABELS);
            expect(page, where).not.toContain('/*rtl*/');
            // The renderer's watermark tile carries the French label; a PDF never has one.
            expect(page.includes(tileText('APERÇU')), where).toBe(mode === 'preview' && watermark);
            expect(page, where).not.toContain(tileText('PREVIEW'));
          }
        }
      }
    }
    // With no name, the document title is the French label.
    expect(render('fr', 'tech-builder', 'pdf', { data: { ...emptyResume() } })).toContain('<title>CV</title>');
  });

  it('the DOCX has the same French headings for every template, and no English or German labels', async () => {
    for (const t of TEMPLATES) {
      const { body } = await docxXml('fr', t.id);
      for (const label of FRENCH_LABELS) expect(body, `${t.id} ${label}`).toContain(`>${label.toUpperCase()}<`);
      for (const label of [...ENGLISH_LABELS.filter((l) => l !== 'Certifications'), ...GERMAN_LABELS]) {
        expect(body, `${t.id} ${label}`).not.toContain(`>${label.toUpperCase()}<`);
      }
    }
  });

  it('the app preview is clean (free product) and in the resume language; the PDF HTML too', () => {
    const shown = renderPreview(stored('fr'));
    expect(shown).toContain('<html lang="fr" dir="ltr">');
    expect(headingsIn(shown)).toEqual(FRENCH_LABELS);
    expect(shown).not.toContain('class="watermark"');
    expect(shown).not.toContain(tileText('APERÇU'));
    const printed = pdfHtml(stored('fr'), 'a4');
    expect(headingsIn(printed)).toEqual(FRENCH_LABELS);
    expect(printed).not.toContain('class="watermark"');
  });

  it('French is left-to-right with the Latin typography (no RTL rules)', () => {
    expect(directionOf('fr')).toBe('ltr');
    const page = render('fr', 'creative-editorial');
    expect(page).not.toContain('/*rtl*/');
    expect(page).not.toContain('<bdi');
  });
});

// --- language separation ---

describe('app language and resume language never leak into each other', () => {
  type Shown = 'en' | 'de' | 'fr';
  const combos: [Shown, Shown][] = [
    ['fr', 'fr'], // A: French UI + French document
    ['fr', 'en'], // B: French UI + English document
    ['en', 'fr'], // C: English UI + French document
    ['de', 'fr'], // D: German UI + French document
  ];
  const UI = {
    en: { create: 'Create my resume', preview: 'Preview', builder: 'The Builder', content: 'Content' },
    de: { create: 'Lebenslauf erstellen', preview: 'Vorschau', builder: 'Der Baustein', content: 'Inhalt' },
    fr: { create: 'Créer mon CV', preview: 'Aperçu', builder: 'Le Bâtisseur', content: 'Contenu' },
  } as const;
  const DOC = {
    en: { headings: ENGLISH_LABELS, experience: 'EXPERIENCE', builder: 'The Builder' },
    de: { headings: GERMAN_LABELS, experience: 'BERUFSERFAHRUNG', builder: 'Der Baustein' },
    fr: { headings: FRENCH_LABELS, experience: 'EXPÉRIENCE PROFESSIONNELLE', builder: 'Le Bâtisseur' },
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

  it('template discovery shows the English sample with English labels, and French UI says so', () => {
    const sample = templateSampleHtml('corporate-boardroom');
    expect(sample).toContain('<html lang="en" dir="ltr">');
    expect(headingsIn(sample)).toEqual(ENGLISH_LABELS);
    expect(T.fr('templatePreview.sampleNote')).toMatch(/exemple en anglais/);
  });
});

// --- analysis messages ---

describe('French analysis messages', () => {
  const codesIn = (value: unknown, out: AnalysisText[] = []): AnalysisText[] => {
    if (Array.isArray(value)) for (const v of value) codesIn(v, out);
    else if (value && typeof value === 'object') {
      if (typeof (value as AnalysisText).code === 'string') out.push(value as AnalysisText);
      else for (const v of Object.values(value)) codesIn(v, out);
    }
    return out;
  };

  it('every code the engines emit renders in French (nested codes too), with every parameter filled', () => {
    const reports: unknown[] = [];
    for (const data of [SAMPLE_RESUME, emptyResume(), ...Object.values(ATS_STRONG), ...Object.values(ATS_WEAK), ...Object.values(ATS_EDGE)]) {
      reports.push(scoreResume(normalizeResumeData(data), 'fr'));
      for (const t of TEMPLATES) reports.push(checkAtsReadability(data, t.id, 'fr'));
    }
    for (const data of Object.values(JOB_RESUMES)) for (const jd of Object.values(JDS)) reports.push(analyzeJobMatch(data, jd, 'fr'));
    for (const entry of COACH_WEAK) reports.push(analyzeText(entry.text, buildCoachContext(entry.field, 'en', entry.siblings ?? [])));
    const codes = codesIn(reports);
    expect(new Set(codes.map((c) => c.code)).size).toBeGreaterThan(80);
    for (const coded of codes) {
      const french = renderText(T.fr, coded);
      expect(french, coded.code).not.toMatch(/\{\w+\}|analysis\.|templates\./);
      if (FR.get(coded.code) !== EN.get(coded.code)) expect(french, coded.code).not.toBe(renderText(T.en, coded));
    }
    // Nested codes follow the app language: the tense and the ATS template name.
    expect(renderText(T.fr, { code: 'analysis.coach.tense', params: { theirs: { code: 'analysis.coach.tenses.past' }, word: 'Lead', mine: { code: 'analysis.coach.tenses.present' } } })).toBe(
      `Les autres puces de cette entrée sont au passé${NBSP}; celle-ci commence par «${NBSP}Lead${NBSP}» (au présent).`,
    );
    expect(renderText(T.fr, checkAtsReadability(SAMPLE_RESUME, 'trades-foreman', 'fr').checks.find((c) => c.rule === 'template-text')!.titleText)).toBe(
      'Texte du modèle (Le Contremaître)',
    );
  });

  it('the rules are unchanged: a French resume gets the same scores, statuses and findings as English', () => {
    for (const data of [SAMPLE_RESUME, ...Object.values(ATS_WEAK)]) {
      const score = (language: Language) => {
        const r = scoreResume(normalizeResumeData(data), language);
        return { score: r.score, warnings: r.warnings.map((w) => [w.id, w.messageText]), strengths: r.strengthTexts, categories: r.categories.map((c) => c.status) };
      };
      expect(score('fr')).toEqual(score('en'));
      const ats = (language: Language) =>
        checkAtsReadability(data, 'tech-builder', language).checks.map((c) => [c.rule, c.status, c.findings.map((f) => [f.id, f.status, f.messageText.code])]);
      expect(ats('fr')).toEqual(ats('en'));
    }
  });

  it('never claims French language analysis: the English-rules limits are stated in French', () => {
    for (const engine of ['resumeScore', 'ats', 'jobMatch', 'coverLetter', 'import'] as const) expect(analysisSupport(engine, 'fr').kind).toBe('english-rules');
    expect(analysisSupport('writingCoach', 'fr').kind).toBe('unavailable');
    expect(analyzeText('Helped with the launch', buildCoachContext('experienceBullet', 'fr')).findings).toEqual([]);
    expect(T.fr('tools.englishRules', { language: LANGUAGE_NAMES.fr })).toBe(
      'Ces vérifications utilisent des règles et un vocabulaire anglais. Pour la langue du CV (Français), les résultats peuvent être incomplets.',
    );
    expect(T.fr('editor.coachUnavailable')).toMatch(/que sur les CV en anglais/);
    expect(T.fr('letter.englishOnly')).toMatch(/rédigé en anglais/);
    expect(T.fr('import.englishHeadings')).toMatch(/qu’en anglais/);
    expect(T.fr('analysis.ats.dates.noEnd')).toMatch(/que des termes anglais/);
    expect(T.fr('analysis.coach.article', { article: 'an', next: 'analysis' })).toMatch(/^En anglais, utilisez/);
  });

  it('Job Match keeps the English taxonomy; only the UI around it is French', () => {
    const report = analyzeJobMatch(SAMPLE_RESUME, JDS.softwareEngineer, 'fr');
    expect(report.terms.map((term) => term.label)).toEqual(analyzeJobMatch(SAMPLE_RESUME, JDS.softwareEngineer, 'en').terms.map((term) => term.label));
    expect(T.fr('match.sections.required')).toBe('Exigences');
  });
});

// --- app UI and the free product ---

describe('French app UI', () => {
  it('screens resolve French text', () => {
    expect(T.fr('home.create')).toBe('Créer mon CV');
    expect(T.fr('gallery.useTemplate')).toBe('Utiliser ce modèle');
    expect(T.fr('editor.sections.experience')).toBe('Expérience professionnelle');
    expect(T.fr('preview.export', { format: T.fr('preview.formats.pdf') })).toBe('Export PDF');
    expect(T.fr('tools.tabs.match')).toBe('Adéquation');
    expect(T.fr('home.deleteBody', { title: 'CV' })).toBe(`«${NBSP}CV${NBSP}» sera supprimé de cet appareil.`);
    expect(T.fr('settings.appLanguage')).toBe('Langue de l’application');
  });

  it('the Language screen lists every language by its own name; French is "Français" and persists', async () => {
    expect(LANGUAGES.map((l) => LANGUAGE_NAMES[l])).toEqual(['English', 'Deutsch', 'Français', 'Español', 'العربية']);
    expect(resolveLanguage(['fr-CA'])).toBe('fr');
    expect(resolveLanguage(['fr_FR', 'de'])).toBe('fr');
    const dir = tempDir();
    const db = openTestDatabase(dir.file('app.db'));
    const app = await initializeDatabase(db, { newId: testId });
    await app.settings.setAppLanguage('fr');
    expect(await app.settings.getAppLanguage()).toBe('fr');
    expect(read('features/settings/LanguageSettingsScreen.tsx')).toMatch(/setAppLanguage\(language\)/);
    expect(T.fr('settings.restart')).toBe('Fermez puis rouvrez l’application pour changer le sens de la mise en page.');
    await db.close();
    dir.cleanup();
  });

  it('has no monetization text or keys (My Resume is free)', () => {
    expect(fr).not.toHaveProperty('paywall');
    expect(fr.nav).not.toHaveProperty('premium');
    expect(fr.coach).not.toHaveProperty('locked');
    expect(fr.match).not.toHaveProperty('compareLocked');
    expect(fr.preview).not.toHaveProperty('locked');
    expect(fr.preview).not.toHaveProperty('devStore');
    const all = [...FR.values()].flatMap(forms).join('\n');
    expect(all).not.toMatch(/premium|abonnement|abonner|achat|acheter|payer|paiement|prix|tarif|restaurer|rétablir les achats|verrouill|débloquer|déverrouill|passer à la version|mise à niveau|à vie|€|\$\s?\d|🔒/i);
  });

  it('a key missing from French falls back to English, key by key', () => {
    const partial: Record<Language, PartialMessages> = { ...CATALOGS, fr: { ...fr, home: { ...fr.home, seeAll: undefined } } };
    const { t } = createTranslator('fr', partial);
    expect(t('home.seeAll')).toBe('See all');
    expect(t('home.create')).toBe('Créer mon CV');
  });
});

// --- UI fit ---

describe('French strings in narrow places', () => {
  // Budgets from Chromium measurements of each slot at 360 dp (Liberation Sans as a
  // stand-in for Roboto/SF, +8% margin): the French text must be no longer than what fits,
  // or no longer than the English text that already fits there.
  const len = (s: string) => [...s].length;

  it('tabs, buttons, chips, badges and status labels stay within their measured budgets', () => {
    for (const key of ['check', 'ats', 'match', 'letter'] as const) {
      for (const word of fr.tools.tabs[key].split(' ')) expect(len(word), `tab ${key}`).toBeLessThanOrEqual(11);
    }
    for (const format of Object.values(fr.preview.formats)) {
      expect(len(T.fr('preview.export', { format }))).toBeLessThanOrEqual(len(T.en('preview.export', { format: en.preview.formats.image })));
    }
    expect(len(fr.gallery.useTemplate)).toBeLessThanOrEqual(18); // fits at the button's 0.8 shrink floor
    expect(len(fr.gallery.atsReady)).toBeLessThanOrEqual(14);
    for (const id of Object.keys(fr.templates).filter((k) => k !== 'categories') as (keyof typeof fr.templates)[]) {
      const entry = fr.templates[id] as { name: string; shortName: string };
      expect(len(entry.shortName), id).toBeLessThanOrEqual(13);
      expect(len(entry.name), id).toBeLessThanOrEqual(16);
    }
    for (const name of Object.values(fr.templates.categories)) expect(len(name)).toBeLessThanOrEqual(12);
    for (const status of Object.values(fr.check.status)) expect(len(status)).toBeLessThanOrEqual(12);
    expect(len(fr.editor.add)).toBeLessThanOrEqual(13);
    expect(len(fr.editor.moveUp) + len(fr.editor.moveDown) + len(fr.editor.remove)).toBeLessThanOrEqual(30);
    expect(len(fr.match.detected)).toBeLessThanOrEqual(len(en.match.detected));
    expect(len(fr.match.notDetected)).toBeLessThanOrEqual(len(en.match.notDetected));
    expect(len(fr.editor.tools) + len(fr.editor.preview)).toBeLessThanOrEqual(16);
    expect(len(fr.ats.detected)).toBeLessThanOrEqual(10);
    expect(len(fr.ats.notDetected)).toBeLessThanOrEqual(12);
  });

  it('the layouts that hold longer words can wrap or shrink locally (shared with German; English unchanged)', () => {
    const tools = read('features/tools/ToolsScreen.tsx');
    expect(tools).toMatch(/adjustsFontSizeToFit=\{oneWord\}/);
    expect(tools).toMatch(/numberOfLines=\{oneWord \? 1 : 2\}/);
    expect(read('features/library/HomeScreen.tsx')).toMatch(/flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center'/);
    expect(read('features/editor/EditorScreen.tsx')).toMatch(/flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'flex-end'/);
    expect(read('ui/components.tsx')).toMatch(/SectionTitle style=\{\{ flexShrink: 1 \}\}/);
    expect(read('features/preview/PreviewScreen.tsx')).toMatch(/fit\n/);
    expect(read('features/templates/TemplateCard.tsx')).toMatch(/fit\n/);
  });
});

// --- file names ---

describe('French file names', () => {
  it('keep accents, use hyphens, and are deterministic', () => {
    expect(fileSafeName('Élodie Müller')).toBe('élodie-müller');
    expect(fileSafeName('François Dupont')).toBe('françois-dupont');
    expect(fileSafeName('Chloé Noël')).toBe('chloé-noël');
    expect(fileSafeName('Jean-Étienne  de La Fontaine')).toBe('jean-étienne-de-la-fontaine');
    expect(fileSafeName('ÉLODIE MÜLLER')).toBe('élodie-müller');
    expect(fileSafeName('Chloé Noël')).toBe(fileSafeName('Chloé Noël'));
    // NFD input (as some keyboards produce) gives the same name as NFC.
    expect(fileSafeName('Élodie Müller')).toBe('élodie-müller');
    expect(fileSafeName('François Dupont')).toBe('françois-dupont');
    expect(fileSafeName('Chloé Noël')).toBe('chloé-noël');
    // Path and shell characters never survive; the 60-character cap and no trailing hyphen remain.
    expect(fileSafeName('../Élodie/Müller:*?')).toBe('élodie-müller');
    const long = fileSafeName('Élodie Müller '.repeat(8));
    expect([...long].length).toBeLessThanOrEqual(60);
    expect(long).toMatch(/^élodie-müller-élodie/);
    expect(long).not.toMatch(/-$/);
    const resume = stored('fr', { data: { ...SAMPLE_RESUME, name: 'Élodie Müller' } });
    expect(exportFileName(resume, 'pdf')).toBe('élodie-müller.pdf');
    expect(exportFileName(resume, 'docx')).toBe('élodie-müller.docx');
    expect(exportFileName(resume, 'png', { index: 1, count: 2 })).toBe('élodie-müller-page-2.png');
    expect(exportFileName(resume, 'pdf')).not.toContain('_');
  });
});

// --- real PDFs and layout (Chromium + pdf.js) ---

const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CONTENT_PX: Record<PaperSize, number> = { letter: 672, a4: Math.round((210 / 25.4 - 1.5) * 96) };
const FRENCH_DATA: ResumeData = {
  ...SAMPLE_RESUME,
  name: 'Élodie Müller',
  summary: { ...SAMPLE_RESUME.summary, bullets: ['Ponts et chaussées pour grands projets à Besançon', ...SAMPLE_RESUME.summary.bullets.slice(1)] },
};

describe.skipIf(!existsSync(CHROMIUM))('French documents in a real engine', () => {
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

  it('every template, Letter and A4: the PDF text layer has the French headings and the accented name as whole words', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    await page.emulateMedia({ media: 'print' });
    for (const t of TEMPLATES) {
      for (const paper of ['letter', 'a4'] as const) {
        await page.setContent(pdfHtml(stored('fr', { templateId: t.id, accent: t.defaultAccent, data: FRENCH_DATA }), paper));
        const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
        const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
        let text = '';
        for (let n = 1; n <= doc.numPages; n++) {
          const content = await (await doc.getPage(n)).getTextContent();
          text += content.items.map((i) => ('str' in i ? i.str : '')).join(' ') + ' ';
        }
        const lower = text.replace(/\s+/g, ' ').toLowerCase();
        for (const label of FRENCH_LABELS) expect(lower, `${t.id} ${paper} ${label}`).toContain(label.toLowerCase());
        expect(lower, `${t.id} ${paper}`).toContain('élodie müller');
        expect(lower, `${t.id} ${paper}`).toContain('ponts et chaussées pour grands projets à besançon');
        expect(lower, `${t.id} ${paper}`).not.toContain('aperçu');
      }
    }
  }, 180_000);

  it('French headings fit on one line, stay inside the page and never touch a decorative mark (PDF and watermarked preview)', async () => {
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
          await page.setContent(render('fr', t.id, mode, { paper, watermark: mode === 'preview', data: FRENCH_DATA }), { waitUntil: 'load' });
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
          expect(result.headings.map((h) => h.text), where).toEqual(FRENCH_LABELS);
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
});

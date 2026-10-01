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
import { directionOf, LANGUAGE_NAMES, LANGUAGES, type Language } from '../domain/i18n/languages';
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

// Phase 13B: German (de) localization. The analysis rules stay English; German is the
// app language and/or the resume's document language.

const SRC = join(__dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');
const T = { de: createTranslator('de').t, en: createTranslator('en').t };

type Leaf = string | Record<string, string>;
/** key → value (a string, or a plural object) for every message in a catalog. */
const leaves = (node: unknown, prefix = ''): [string, Leaf][] =>
  typeof node === 'object' && node !== null && !('other' in node)
    ? Object.entries(node).flatMap(([k, v]) => leaves(v, `${prefix}${k}.`))
    : [[prefix.slice(0, -1), node as Leaf]];
const EN = new Map(leaves(en));
const DE = new Map(leaves(de));
const forms = (value: Leaf) => (typeof value === 'string' ? [value] : Object.values(value));
const params = (value: Leaf) => new Set(forms(value).flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])));

const GERMAN_LABELS = ['Kurzprofil', 'Berufserfahrung', 'Ausbildung', 'Zertifikate', 'Projekte', 'Auszeichnungen'];
const ENGLISH_LABELS = ['Summary', 'Experience', 'Education', 'Certifications', 'Projects', 'Awards'];
const headingsIn = (page: string) => [...page.matchAll(/<h2 class="[^"]*">([^<]*)<\/h2>/g)].map((m) => m[1]);
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
/** The watermark label as it appears inside the encoded SVG tile. */
const tileText = (label: string) => encodeURIComponent(`>${label}<`);
const stored = (language: Language, overrides: Partial<StoredResume> = {}): StoredResume => ({
  id: 'r1',
  title: 'Mein Lebenslauf',
  templateId: 'corporate-boardroom',
  accent: '#1B2B47',
  language,
  data: SAMPLE_RESUME,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

// --- catalog ---

describe('German catalog', () => {
  it('has a German value for every English key, and no other keys', () => {
    expect([...DE.keys()].sort()).toEqual([...EN.keys()].sort());
    // 474 before phase 13C, minus the 29 monetization keys removed with the paywall.
    expect(DE.size).toBe(445);
    for (const [key, value] of DE) for (const form of forms(value)) expect(form.trim(), key).not.toBe('');
    // The runtime catalog is the complete file.
    expect(CATALOGS.de).toBe(de);
  });

  it('translates every key; the few identical values are names, symbols or pure formats', () => {
    const identical = [...DE].filter(([key, value]) => JSON.stringify(value) === JSON.stringify(EN.get(key))).map(([key]) => key).sort();
    expect(identical).toEqual([
      // Product and brand names (My Resume, Writing Coach's short name "Coach", LinkedIn).
      'analysis.location.linkedin', 'coach.open', 'editor.fields.personal.linkedin', 'nav.home',
      // Established German loanwords used as-is in German UI.
      'analysis.ats.detected.name', 'analysis.ats.layout.title', 'analysis.location.field.name', 'analysis.location.website',
      'editor.fields.personal.website', 'editor.tools', 'nav.tools', 'templates.categories.Tech',
      // Technical names.
      'preview.formats.docx', 'preview.formats.pdf', 'tools.tabs.ats',
      // Pure formats and separators: parameters and punctuation only.
      'analysis.location.inEntry', 'ats.separator', 'ats.statusPrefix', 'check.improveA11y', 'check.outOf', 'editor.listCount',
      'editor.listItem', 'home.templateAndDate', 'match.charCount', 'match.listSeparator', 'match.separator',
    ].sort());
  });

  it('every message takes exactly the parameters of its English source', () => {
    for (const [key, value] of DE) expect([...params(value)].sort(), key).toEqual([...params(EN.get(key)!)].sort());
  });

  it('plural messages have the German categories (one, other), and counted forms show the count', () => {
    const plurals = [...DE].filter(([, value]) => typeof value !== 'string');
    expect(plurals.map(([key]) => key).sort()).toEqual([...EN].filter(([, v]) => typeof v !== 'string').map(([k]) => k).sort());
    expect(plurals).toHaveLength(10);
    for (const [key, value] of plurals) {
      expect(Object.keys(value).sort(), key).toEqual(['one', 'other']);
      for (const form of forms(value)) expect(form, key).toContain('{count}');
    }
  });

  it('uses German quotation marks („…“) and never English ones', () => {
    for (const [key, value] of DE) {
      for (const form of forms(value)) {
        expect(form, key).not.toMatch(/["”]/);
        // „ opens and “ closes: they come in pairs.
        expect((form.match(/„/g) ?? []).length, key).toBe((form.match(/“/g) ?? []).length);
      }
    }
  });

  it('uses one term per concept (terminology map)', () => {
    const all = [...DE.values()].flatMap(forms).join('\n');
    // Rejected alternatives for the chosen terms.
    for (const avoid of [/\bCV\b/, /Zusammenfassung(?!en)/, /Fähigkeiten/, /Zertifizierung/, /Bildungsweg/, /Jobabgleich|Job-Abgleich/, /Motivationsschreiben/, /Bulletpoint/, /\bdu\b|\bdein/i]) {
      expect(all, String(avoid)).not.toMatch(avoid);
    }
    expect(de.resume.labels.experience).toBe(de.editor.sections.experience);
    expect(de.resume.labels.education).toBe(de.editor.sections.education);
    expect(de.resume.labels.certifications).toBe(de.editor.sections.certifications);
    expect(de.analysis.location.section.skills).toBe(de.editor.fields.summary.skills);
    expect(de.tools.tabs.letter).toBe('Anschreiben');
  });
});

// --- plurals, numbers, dates ---

describe('German plurals and formatting', () => {
  it('zero, one and several use the CLDR German forms', () => {
    expect([0, 1, 2, 5, 1.5].map((n) => pluralCategory('de', n))).toEqual(['other', 'one', 'other', 'other', 'other']);
    expect([0, 1, 3].map((count) => T.de('ats.issues', { count }))).toEqual(['0 mögliche Probleme', '1 mögliches Problem', '3 mögliche Probleme']);
    expect([0, 1, 2].map((count) => T.de('match.mentionLines', { count }))).toEqual([' (0 Zeilen)', ' (1 Zeile)', ' (2 Zeilen)']);
    expect([1, 4].map((count) => T.de('match.termsDetected', { count }))).toEqual(['1 Begriff aus der Anzeige erkannt', '4 Begriffe aus der Anzeige erkannt']);
    expect(renderText(T.de, { code: 'analysis.coach.longBullet', params: { count: 40, max: 32 } })).toBe(
      'Dieser Aufzählungspunkt hat 40 Wörter. Bleiben Sie bei höchstens 32, damit das Ergebnis schnell erfassbar ist.',
    );
    expect(renderText(T.de, { code: 'analysis.score.warnings.shortBullets', params: { count: 1 } })).toBe(
      '1 Aufzählungspunkt in der Berufserfahrung könnte aussagekräftiger sein.',
    );
  });

  it('app-generated numbers and dates use German formats; user text is untouched', () => {
    expect(T.de('match.charCount', { count: 1234, max: JOB_DESCRIPTION_MAX })).toBe('1.234 / 25.000');
    expect(formatNumber('de', 87)).toBe('87');
    expect(formatDate('de', Date.UTC(2026, 2, 15, 12))).toMatch(/^15\. März 2026$/);
    expect(T.de('share.page', { title: 'Lebenslauf', index: 2, count: 3 })).toBe('Lebenslauf (Seite 2 von 3)');
    let message = '';
    try {
      analyzeJobMatch(SAMPLE_RESUME, 'x'.repeat(JOB_DESCRIPTION_MAX + 1), 'de');
    } catch (error) {
      message = errorText(T.de, error, 'match.failed');
    }
    expect(message).toBe('Diese Stellenanzeige ist zu lang (höchstens 25.000 Zeichen).');
    // A resume date the user typed is shown exactly as typed.
    expect(render('de', 'corporate-boardroom', 'pdf', { data: { ...SAMPLE_RESUME, experience: [{ ...SAMPLE_RESUME.experience[0], start: '03/2020', end: 'heute' }] } })).toContain('03/2020');
  });
});

// --- template metadata ---

describe('German template metadata', () => {
  it('names, short names, descriptions and categories are German for all 12 templates; ids unchanged', () => {
    expect(TEMPLATES).toHaveLength(12);
    const names = new Set<string>();
    for (const template of TEMPLATES) {
      const german = templateText(T.de, template.id);
      const english = templateText(T.en, template.id);
      for (const field of ['name', 'shortName', 'description'] as const) {
        expect(german[field], `${template.id} ${field}`).not.toBe(english[field]);
        expect(german[field]).not.toMatch(/^templates\./);
      }
      expect(german.category).toBe(de.templates.categories[template.category as keyof typeof de.templates.categories]);
      names.add(german.name);
    }
    expect(names.size).toBe(12);
    expect(TEMPLATE_CATEGORIES.map((c) => categoryName(T.de, c))).toEqual(['Wirtschaft', 'Tech', 'Kreativ', 'Gesundheit', 'Wissenschaft', 'Handwerk']);
  });

  it('gallery, template preview, switcher, Home and filters read template text through the catalog', () => {
    for (const file of ['features/templates/TemplateCard.tsx', 'features/templates/TemplatePreviewScreen.tsx', 'features/preview/PreviewScreen.tsx', 'features/library/HomeScreen.tsx']) {
      expect(read(file), file).toMatch(/templateText\(t, /);
    }
    expect(read('features/templates/TemplateGalleryScreen.tsx')).toMatch(/categoryName\(t, f\)/);
  });

  it('the DOCX title uses the German template name for a German resume', async () => {
    expect((await docxXml('de', 'trades-foreman')).core).toContain('Der Meisterbrief');
    expect((await docxXml('en', 'trades-foreman')).core).toContain('The Foreman');
  });
});

// --- resume document ---

describe('German resume documents', () => {
  it('the canonical labels resolve to German (one source for PDF, preview and DOCX)', () => {
    expect(resumeLabels('de')).toEqual({
      summary: 'Kurzprofil',
      experience: 'Berufserfahrung',
      education: 'Ausbildung',
      certifications: 'Zertifikate',
      projects: 'Projekte',
      awards: 'Auszeichnungen',
      resume: 'Lebenslauf',
      previewWatermark: 'VORSCHAU',
    });
    expect(resumeLabels('de')).toEqual(de.resume.labels);
  });

  it('every template, PDF and preview, Letter and A4, with and without watermark: German headings, lang="de", dir="ltr"', () => {
    for (const t of TEMPLATES) {
      for (const mode of ['pdf', 'preview'] as const) {
        for (const watermark of [false, true]) {
          for (const paper of ['letter', 'a4'] as const) {
            const page = render('de', t.id, mode, { watermark, paper });
            const where = `${t.id} ${mode} ${watermark} ${paper}`;
            expect(page, where).toContain('<html lang="de" dir="ltr">');
            expect(headingsIn(page), where).toEqual(GERMAN_LABELS);
            expect(page, where).not.toContain('/*rtl*/');
            // The watermark tile carries the German label; the PDF never has one.
            expect(page.includes(tileText('VORSCHAU')), where).toBe(mode === 'preview' && watermark);
            expect(page, where).not.toContain(tileText('PREVIEW'));
          }
        }
      }
    }
    // With no name, the document title is the German label.
    expect(render('de', 'tech-builder', 'pdf', { data: { ...emptyResume() } })).toContain('<title>Lebenslauf</title>');
  });

  it('the DOCX has the same German headings for every template, and no English labels', async () => {
    for (const t of TEMPLATES) {
      const { body } = await docxXml('de', t.id);
      for (const label of GERMAN_LABELS) expect(body, `${t.id} ${label}`).toContain(`>${label.toUpperCase()}<`);
      for (const label of ENGLISH_LABELS) expect(body, `${t.id} ${label}`).not.toContain(`>${label.toUpperCase()}<`);
    }
  });

  it('PDF (print HTML) and the app preview use the resume language', () => {
    const shown = renderPreview(stored('de'));
    expect(shown).toContain('<html lang="de" dir="ltr">');
    expect(headingsIn(shown)).toEqual(GERMAN_LABELS);
    // The app preview is clean (free product); the German watermark label is the renderer's.
    expect(shown).not.toContain(tileText('VORSCHAU'));
    const printed = pdfHtml(stored('de'), 'a4');
    expect(headingsIn(printed)).toEqual(GERMAN_LABELS);
    expect(printed).not.toContain(tileText('VORSCHAU'));
  });

  it('German is left-to-right with the Latin typography (no RTL rules)', () => {
    expect(directionOf('de')).toBe('ltr');
    const page = render('de', 'creative-editorial');
    expect(page).not.toContain('/*rtl*/');
    expect(page).not.toContain('<bdi');
  });
});

// --- language separation ---

describe('app language and resume language never leak into each other', () => {
  const combos: [Language, Language][] = [
    ['de', 'de'], // A: German UI + German document
    ['de', 'en'], // B: German UI + English document
    ['en', 'de'], // C: English UI + German document
    ['en', 'en'], // D: English UI + English document
  ];

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
    expect(t('home.create')).toBe(app === 'de' ? 'Lebenslauf erstellen' : 'Create my resume');
    expect(t('nav.preview')).toBe(app === 'de' ? 'Vorschau' : 'Preview');
    expect(templateText(t, 'tech-builder').name).toBe(app === 'de' ? 'Der Baustein' : 'The Builder');
    // Analysis of the resume is shown in the app language.
    const score = scoreResume(resume.data, resume.language);
    expect(renderText(t, score.categories[0].labelText)).toBe(app === 'de' ? 'Inhalt' : 'Content');

    // Document: the resume language only.
    const saved = (await store.resumes.get(resume.id))!;
    expect(saved.language).toBe(resumeLanguage);
    const page = pdfHtml(saved, 'letter');
    expect(page).toContain(`<html lang="${resumeLanguage}" dir="ltr">`);
    expect(headingsIn(page)).toEqual(resumeLanguage === 'de' ? GERMAN_LABELS : ENGLISH_LABELS);
    const { body, core } = await docxXml(resumeLanguage, 'tech-builder');
    expect(body).toContain(resumeLanguage === 'de' ? '>BERUFSERFAHRUNG<' : '>EXPERIENCE<');
    expect(core).toContain(resumeLanguage === 'de' ? 'Der Baustein' : 'The Builder');

    // Neither setting moved.
    expect(await store.settings.getAppLanguage()).toBe(app);
    expect((await store.resumes.get(resume.id))!.language).toBe(resumeLanguage);
    await db.close();
    dir.cleanup();
  });

  it('template discovery shows the English sample with English labels, and German UI says so', () => {
    const sample = templateSampleHtml('corporate-boardroom');
    expect(sample).toContain('<html lang="en" dir="ltr">');
    expect(headingsIn(sample)).toEqual(ENGLISH_LABELS);
    expect(T.de('templatePreview.sampleNote')).toMatch(/englischem Beispielinhalt/);
  });
});

// --- analysis messages ---

describe('German analysis messages', () => {
  const codesIn = (value: unknown, out: AnalysisText[] = []): AnalysisText[] => {
    if (Array.isArray(value)) for (const v of value) codesIn(v, out);
    else if (value && typeof value === 'object') {
      if (typeof (value as AnalysisText).code === 'string') out.push(value as AnalysisText);
      else for (const v of Object.values(value)) codesIn(v, out);
    }
    return out;
  };

  it('every code the engines emit renders in German (nested codes too), with every parameter filled', () => {
    const reports: unknown[] = [];
    for (const data of [SAMPLE_RESUME, emptyResume(), ...Object.values(ATS_STRONG), ...Object.values(ATS_WEAK), ...Object.values(ATS_EDGE)]) {
      reports.push(scoreResume(normalizeResumeData(data), 'de'));
      for (const t of TEMPLATES) reports.push(checkAtsReadability(data, t.id, 'de'));
    }
    for (const data of Object.values(JOB_RESUMES)) for (const jd of Object.values(JDS)) reports.push(analyzeJobMatch(data, jd, 'de'));
    for (const entry of COACH_WEAK) reports.push(analyzeText(entry.text, buildCoachContext(entry.field, 'en', entry.siblings ?? [])));
    const codes = codesIn(reports);
    expect(new Set(codes.map((c) => c.code)).size).toBeGreaterThan(80);
    for (const coded of codes) {
      const german = renderText(T.de, coded);
      expect(german, coded.code).not.toMatch(/\{\w+\}|analysis\.|templates\./);
      if (DE.get(coded.code) !== EN.get(coded.code)) expect(german, coded.code).not.toBe(renderText(T.en, coded));
    }
    // Nested codes follow the app language: the tense and the ATS template name.
    expect(renderText(T.de, { code: 'analysis.coach.tense', params: { theirs: { code: 'analysis.coach.tenses.past' }, word: 'Lead', mine: { code: 'analysis.coach.tenses.present' } } })).toBe(
      'Die anderen Aufzählungspunkte in diesem Eintrag stehen in der Vergangenheitsform; dieser beginnt mit „Lead“ (Gegenwartsform).',
    );
    expect(renderText(T.de, checkAtsReadability(SAMPLE_RESUME, 'trades-foreman', 'de').checks.find((c) => c.rule === 'template-text')!.titleText)).toBe(
      'Vorlagentext (Der Meisterbrief)',
    );
  });

  it('the rules are unchanged: a German resume gets the same scores, statuses and findings as English', () => {
    // Only the export's heading text differs (the ATS reads the German headings it exports).
    for (const data of [SAMPLE_RESUME, ...Object.values(ATS_WEAK)]) {
      const score = (language: Language) => {
        const r = scoreResume(normalizeResumeData(data), language);
        return { score: r.score, warnings: r.warnings.map((w) => [w.id, w.messageText]), strengths: r.strengthTexts, categories: r.categories.map((c) => c.status) };
      };
      expect(score('de')).toEqual(score('en'));
      const ats = (language: Language) =>
        checkAtsReadability(data, 'tech-builder', language).checks.map((c) => [c.rule, c.status, c.findings.map((f) => [f.id, f.status, f.messageText.code])]);
      expect(ats('de')).toEqual(ats('en'));
    }
  });

  it('never claims German language analysis: the English-rules limits are stated in German', () => {
    expect(analysisSupport('resumeScore', 'de').kind).toBe('english-rules');
    expect(analysisSupport('ats', 'de').kind).toBe('english-rules');
    expect(analysisSupport('jobMatch', 'de').kind).toBe('english-rules');
    expect(analysisSupport('coverLetter', 'de').kind).toBe('english-rules');
    expect(analysisSupport('import', 'de').kind).toBe('english-rules');
    expect(analysisSupport('writingCoach', 'de').kind).toBe('unavailable');
    expect(analyzeText('Helped with the launch', buildCoachContext('experienceBullet', 'de')).findings).toEqual([]);
    expect(T.de('tools.englishRules', { language: LANGUAGE_NAMES.de })).toBe(
      'Diese Prüfungen arbeiten mit englischen Regeln und englischem Wortschatz. Bei der Lebenslaufsprache Deutsch können die Ergebnisse unvollständig sein.',
    );
    expect(T.de('editor.coachUnavailable')).toMatch(/nur für englische Lebensläufe/);
    expect(T.de('letter.englishOnly')).toMatch(/auf Englisch/);
    expect(T.de('import.englishHeadings')).toMatch(/nur auf Englisch/);
    expect(T.de('analysis.ats.dates.noEnd')).toMatch(/nur englische Begriffe/);
  });

  it('Job Match keeps the English taxonomy; only the UI around it is German', () => {
    const report = analyzeJobMatch(SAMPLE_RESUME, JDS.softwareEngineer, 'de');
    expect(report.terms.map((term) => term.label)).toEqual(analyzeJobMatch(SAMPLE_RESUME, JDS.softwareEngineer, 'en').terms.map((term) => term.label));
    expect(T.de('match.sections.required')).toBe('Anforderungen');
  });
});

// --- app UI ---

describe('German app UI', () => {
  it('screens resolve German text', () => {
    expect(T.de('home.create')).toBe('Lebenslauf erstellen');
    expect(T.de('gallery.useTemplate')).toBe('Vorlage nutzen');
    expect(T.de('editor.sections.experience')).toBe('Berufserfahrung');
    expect(T.de('preview.export', { format: T.de('preview.formats.pdf') })).toBe('PDF-Export');
    expect(T.de('tools.tabs.match')).toBe('Abgleich');
    expect(T.de('home.deleteBody', { title: 'CV' })).toBe('„CV“ wird von diesem Gerät entfernt.');
    expect(T.de('settings.appLanguage')).toBe('App-Sprache');
  });

  it('the Language screen lists every language by its own name; German is "Deutsch"', () => {
    expect(LANGUAGES.map((l) => LANGUAGE_NAMES[l])).toEqual(['English', 'Deutsch', 'Français', 'Español', 'العربية']);
  });

  it('has no paywall, price or purchase text (My Resume is free)', () => {
    expect(de).not.toHaveProperty('paywall');
    expect(de.nav).not.toHaveProperty('premium');
    const all = [...DE.values()].flatMap(forms).join('\n');
    expect(all).not.toMatch(/Premium|Abo\b|Abonn|Kauf|kaufen|Preis|\$\d|€|🔒|freischalten|wiederherstellen/i);
  });

  it('a key missing from German falls back to English, key by key', () => {
    const partial: Record<Language, PartialMessages> = { ...CATALOGS, de: { ...de, home: { ...de.home, seeAll: undefined } } };
    const { t } = createTranslator('de', partial);
    expect(t('home.seeAll')).toBe('See all');
    expect(t('home.create')).toBe('Lebenslauf erstellen');
  });
});

// --- UI fit ---

describe('German strings in narrow places', () => {
  // Budgets from Chromium measurements of each slot at 360 dp (Liberation Sans as a
  // stand-in for Roboto/SF, +8% margin): the German text must be no longer than what
  // fits, or no longer than the English text that already fits there.
  const len = (s: string) => [...s].length;

  it('tabs, buttons, chips, badges and status labels stay within their measured budgets', () => {
    for (const key of ['check', 'ats', 'match', 'letter'] as const) {
      for (const word of de.tools.tabs[key].split(' ')) expect(len(word), `tab ${key}`).toBeLessThanOrEqual(11);
    }
    for (const format of Object.values(de.preview.formats)) {
      expect(len(T.de('preview.export', { format })), format).toBeLessThanOrEqual(len(T.en('preview.export', { format: en.preview.formats.docx })));
    }
    expect(len(de.gallery.useTemplate)).toBeLessThanOrEqual(14);
    expect(len(de.gallery.atsReady)).toBeLessThanOrEqual(14);
    for (const id of Object.keys(de.templates).filter((k) => k !== 'categories') as (keyof typeof de.templates)[]) {
      const entry = de.templates[id] as { name: string; shortName: string };
      expect(len(entry.shortName), id).toBeLessThanOrEqual(12);
      expect(len(entry.name), id).toBeLessThanOrEqual(18);
    }
    for (const name of Object.values(de.templates.categories)) expect(len(name)).toBeLessThanOrEqual(12);
    for (const status of Object.values(de.check.status)) expect(len(status)).toBeLessThanOrEqual(12);
    expect(len(de.editor.add)).toBeLessThanOrEqual(13);
    expect(len(de.editor.moveUp) + len(de.editor.moveDown) + len(de.editor.remove)).toBeLessThanOrEqual(30);
    expect(len(de.match.detected)).toBeLessThanOrEqual(len(en.match.detected));
    expect(len(de.match.notDetected)).toBeLessThanOrEqual(len(en.match.notDetected));
    expect(len(de.editor.tools) + len(de.editor.preview)).toBeLessThanOrEqual(16);
  });

  it('the layouts that hold longer words can wrap or shrink locally (English unchanged)', () => {
    const tools = read('features/tools/ToolsScreen.tsx');
    expect(tools).toMatch(/adjustsFontSizeToFit=\{oneWord\}/);
    expect(tools).toMatch(/numberOfLines=\{oneWord \? 1 : 2\}/);
    expect(read('features/library/HomeScreen.tsx')).toMatch(/flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center'/);
    expect(read('features/editor/EditorScreen.tsx')).toMatch(/flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'flex-end'/);
    expect(read('ui/components.tsx')).toMatch(/SectionTitle style=\{\{ flexShrink: 1 \}\}/);
    // The export buttons and the gallery button already shrink to fit on one line.
    expect(read('features/preview/PreviewScreen.tsx')).toMatch(/fit\n/);
    expect(read('features/templates/TemplateCard.tsx')).toMatch(/fit\n/);
  });
});

// --- file names ---

describe('German file names', () => {
  it('keep umlauts and ß, use hyphens, and are deterministic', () => {
    expect(fileSafeName('Müller')).toBe('müller');
    expect(fileSafeName('Jürgen Müller')).toBe('jürgen-müller');
    expect(fileSafeName('François Müller')).toBe('françois-müller');
    expect(fileSafeName('Günther Weiß-Öztürk')).toBe('günther-weiß-öztürk');
    expect(fileSafeName('ÄNNE GROSS')).toBe('änne-gross');
    expect(fileSafeName('Jürgen Müller')).toBe(fileSafeName('Jürgen Müller'));
    // NFD input (as some keyboards produce) gives the same name as NFC.
    expect(fileSafeName('Jürgen Müller')).toBe('jürgen-müller');
    const resume = stored('de', { data: { ...SAMPLE_RESUME, name: 'Jürgen Müller' } });
    expect(exportFileName(resume, 'pdf')).toBe('jürgen-müller.pdf');
    expect(exportFileName(resume, 'docx')).toBe('jürgen-müller.docx');
    expect(exportFileName(resume, 'png', { index: 1, count: 2 })).toBe('jürgen-müller-page-2.png');
    expect(exportFileName(resume, 'pdf')).not.toContain('_');
  });
});

// --- real PDFs and layout (Chromium + pdf.js) ---

const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CONTENT_PX: Record<PaperSize, number> = { letter: 672, a4: Math.round((210 / 25.4 - 1.5) * 96) };
const GERMAN_DATA: ResumeData = {
  ...SAMPLE_RESUME,
  name: 'Jürgen Müller',
  summary: { ...SAMPLE_RESUME.summary, bullets: ['Straßenbau und Brückenprüfung für Großprojekte in Köln', ...SAMPLE_RESUME.summary.bullets.slice(1)] },
};

describe.skipIf(!existsSync(CHROMIUM))('German documents in a real engine', () => {
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

  it('every template, Letter and A4: the PDF text layer has the German headings and the umlaut name as whole words', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    await page.emulateMedia({ media: 'print' });
    for (const t of TEMPLATES) {
      for (const paper of ['letter', 'a4'] as const) {
        await page.setContent(pdfHtml(stored('de', { templateId: t.id, accent: t.defaultAccent, data: GERMAN_DATA }), paper));
        const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
        const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
        let text = '';
        for (let n = 1; n <= doc.numPages; n++) {
          const content = await (await doc.getPage(n)).getTextContent();
          text += content.items.map((i) => ('str' in i ? i.str : '')).join(' ') + ' ';
        }
        const lower = text.replace(/\s+/g, ' ').toLowerCase();
        for (const label of GERMAN_LABELS) expect(lower, `${t.id} ${paper} ${label}`).toContain(label.toLowerCase());
        expect(lower, `${t.id} ${paper}`).toContain('jürgen müller');
        expect(lower, `${t.id} ${paper}`).toContain('straßenbau und brückenprüfung für großprojekte in köln');
        expect(lower, `${t.id} ${paper}`).not.toContain('vorschau');
      }
    }
  }, 180_000);

  it('German headings fit on one line, stay inside the page and never touch a decorative mark (PDF and watermarked preview)', async () => {
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
          await page.setContent(render('de', t.id, mode, { paper, watermark: mode === 'preview', data: GERMAN_DATA }), { waitUntil: 'load' });
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
          expect(result.headings.map((h) => h.text), where).toEqual(GERMAN_LABELS);
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

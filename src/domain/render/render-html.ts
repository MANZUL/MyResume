import type { Language } from '../i18n/languages';
import { resumeLabels, type ResumeLabels } from '../i18n/resume-labels';
import { mapLatinRuns } from '../i18n/bidi';
import { ARABIC_FONT_FAMILIES, typographyFor, type Typography } from '../i18n/typography';
import { normalizeResumeData } from '../resume/normalize';
import { getTemplate, type TemplateConfig } from '../templates/templates';
import { escapeHtml, isHexColor, tintHex } from '../shared/text';
import type { ResumeData } from '../resume/types';

// One renderer feeds both the on-screen preview (WebView) and the exported PDF
// (expo-print), so what the user sees is exactly what they get.

const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "-apple-system, 'Helvetica Neue', Helvetica, Roboto, Arial, sans-serif";
const MONO = "Menlo, 'Courier New', monospace";

export type RenderMode = 'preview' | 'pdf';
export type PaperSize = 'letter' | 'a4';

/** Page sizes in PDF points (72 per inch). */
export const PAPER_POINTS: Record<PaperSize, { width: number; height: number }> = {
  letter: { width: 612, height: 792 }, // 8.5 × 11 in
  a4: { width: 595, height: 842 }, // 210 × 297 mm
};

/** Page margin used by both the preview (as page padding) and the PDF (as print margins). */
export const PAGE_MARGIN_IN = 0.75;
const PAPER_CSS: Record<PaperSize, { width: string; height: string; name: string }> = {
  letter: { width: '8.5in', height: '11in', name: 'letter' },
  a4: { width: '210mm', height: '297mm', name: 'A4' },
};

/**
 * Letter-spacing (em). Wide tracking splits words into letters in a PDF text layer
 * ("S U M M A R Y"): measured in Chromium PDFs with pdf.js and pdfminer.six, words stay
 * whole up to 0.10em and split from 0.12em. Headings and upper-case names use 0.08em
 * (step 9a), which keeps a margin below that limit.
 */
export const HEADING_TRACKING_EM = { banner: 0.06, underline: 0.08, 'small-caps': 0.08, 'small-caps-rule': 0.08, plain: 0.04 } as const;
export const NAME_TRACKING_EM = 0.08;

/** Size of the quarter-circle mark and the room kept free around it. */
export const QUARTER_CIRCLE_PX = 96;
const MARK_GAP_PX = 8;
const RULE_PX = 8;

/**
 * Repeating diagonal "PREVIEW" tile for the FREE preview. It is an overlay
 * above the content (so no screenshot crop is clean) at low opacity (so the
 * resume stays readable). It exists only in preview mode, never in a PDF.
 */
function watermarkTileUrl(label: string, typography: Typography): string {
  const latin = typography.script === 'latin';
  const tile =
    "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='190'>" +
    "<text x='150' y='95' text-anchor='middle' dominant-baseline='middle' transform='rotate(-30 150 95)' " +
    (typography.direction === 'rtl' ? "direction='rtl' " : '') +
    `font-family='${latin ? 'Helvetica, Arial, sans-serif' : `${ARABIC_FONT_FAMILIES.replace(/'/g, '')}, sans-serif`}' ` +
    `font-size='46' font-weight='700' letter-spacing='${typography.letterSpacing ? 6 : 0}' ` +
    `fill='#111111' fill-opacity='0.08'>${escapeHtml(label)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(tile)}`;
}

/** The English watermark tile (the resume-language tile is built per render). */
export const WATERMARK_TILE_URL = watermarkTileUrl(resumeLabels('en').previewWatermark, typographyFor('en'));

export interface RenderOptions {
  templateId: string;
  accent: string;
  mode: RenderMode;
  /**
   * The resume's own language (not the app language). It selects the document labels,
   * the text direction (dir/lang on the page) and the typography rules.
   */
  language: Language;
  /**
   * Adds the repeating "PREVIEW" watermark. Honored only in preview mode; a PDF is
   * never watermarked. Decided by PreviewService, not by screens.
   */
  watermark?: boolean;
  /** Page size for the preview sheet and the PDF. Defaults to US Letter. */
  paper?: PaperSize;
}

/** Per-document language context: labels, direction and typography. */
interface DocContext {
  labels: ResumeLabels;
  typography: Typography;
}

function docContext(language: Language): DocContext {
  return { labels: resumeLabels(language), typography: typographyFor(language) };
}

const e = escapeHtml;
const nonEmpty = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);

export function renderResumeHtml(input: ResumeData, options: RenderOptions): string {
  // Repair malformed data (missing lists, wrong types) so rendering never throws.
  const data = normalizeResumeData(input);
  const config = getTemplate(options.templateId);
  const accent = isHexColor(options.accent) ? options.accent : config.defaultAccent;
  const paper: PaperSize = options.paper === 'a4' ? 'a4' : 'letter';
  const preview = options.mode === 'preview';
  const watermark = preview && options.watermark === true;
  const doc = docContext(options.language);
  const { typography } = doc;

  const css = [
    `/*shared*/${sharedCss(config, accent)}/*/shared*/`,
    `/*geometry*/${geometryCss(options.mode, paper)}/*/geometry*/`,
    watermark ? `/*watermark*/${watermarkCss(watermarkTileUrl(doc.labels.previewWatermark, typography))}/*/watermark*/` : '',
    // Only for non-Latin scripts and right-to-left documents; Latin LTR output is unchanged.
    ...(typography.script !== 'latin' ? [`/*script*/${scriptCss(config)}/*/script*/`] : []),
    ...(typography.direction === 'rtl' ? [`/*rtl*/${RTL_CSS}/*/rtl*/`] : []),
  ].join('\n');

  // Preview: a fixed-width viewport (page + gutter) makes iOS and Android WebViews
  // scale the page to fit the screen width, with pinch-zoom for detail.
  const viewport = preview ? '<meta name="viewport" content="width=848, maximum-scale=4">' : '';
  const overlay = watermark ? '<div class="watermark" aria-hidden="true"></div>' : '';

  return `<!DOCTYPE html><html lang="${options.language}" dir="${typography.direction}"><head><meta charset="utf-8">${viewport}<title>${e(data.name || doc.labels.resume)}</title><style>${css}</style></head><body${
    preview ? ' style="padding:16px"' : ''
  }><div class="page"><!--content-->${renderContent(data, config, options.language)}<!--/content-->${overlay}</div></body></html>`;
}

/** Everything inside the page margins. Identical in the preview and the PDF. */
export function renderContent(data: ResumeData, config: TemplateConfig, language: Language): string {
  const doc = docContext(language);
  const { labels } = doc;
  const parts: string[] = [];
  const markClass =
    config.decorativeMark === 'quarter-circle' ? ' has-qc' : config.decorativeMark === 'rule' ? ' has-rule' : '';
  parts.push(`<div class="content${markClass}${config.nameAlign === 'center' ? ' centered' : ''}">`);
  if (config.decorativeMark === 'quarter-circle') parts.push('<div class="mark-qc" aria-hidden="true"></div>');
  if (config.decorativeMark === 'rule') parts.push('<div class="mark-rule" aria-hidden="true"></div>');

  parts.push('<div class="stack">');
  parts.push(renderHeader(data, config, doc));
  const summaryBullets = nonEmpty(data.summary.bullets);
  const skills = nonEmpty(data.summary.skills);
  if (data.summary.tagline.trim() || summaryBullets.length || skills.length) {
    parts.push(
      section(labels.summary, config, [
        data.summary.tagline.trim() ? `<p class="italic" style="font-size:11pt;font-weight:500">${isolate(doc, data.summary.tagline)}</p>` : '',
        list(summaryBullets, doc),
        skills.length ? `<div style="margin-top:4px">${renderSkills(skills, config, doc)}</div>` : '',
      ].join('')),
    );
  }

  if (data.experience.length) {
    parts.push(
      section(labels.experience, config, `<div class="entries">${data.experience.map((exp) => {
        const dates = [exp.start, exp.end].filter((v) => v.trim()).map((v) => isolate(doc, v)).join(' – ');
        const titleWeight = config.jobTitleWeight === 'bold' ? 700 : 600;
        const where = [exp.company, exp.location].filter((v) => v.trim()).map((v) => isolate(doc, v)).join(doc.typography.listSeparator);
        return `<div class="entry">
          <div class="row">
            <span><span style="font-weight:${titleWeight};font-size:11pt">${isolate(doc, exp.title)}</span>${
              config.dateAlign === 'inline' && dates ? ` <span class="soft small">| ${dates}</span>` : ''
            }</span>
            ${config.dateAlign === 'right' && dates ? `<span class="date">${dates}</span>` : ''}
          </div>
          ${where ? `<div class="muted ${config.companyStyle === 'italic' ? 'italic' : ''}" style="${config.companyStyle === 'italic' ? '' : 'font-weight:500;'}margin-bottom:2px">${where}</div>` : ''}
          ${exp.summary.trim() ? `<p class="small">${isolate(doc, exp.summary)}</p>` : ''}
          ${list(nonEmpty(exp.bullets), doc)}
        </div>`;
      }).join('')}</div>`),
    );
  }

  if (data.education.length) {
    parts.push(
      section(labels.education, config, `<div class="entries">${data.education.map((edu) => `
        <div class="entry">
          <div class="row"><span style="font-weight:700;font-size:10.5pt">${isolate(doc, edu.degree)}</span><span class="date">${isolate(doc, edu.date)}</span></div>
          <div>${[edu.school, edu.location].filter((v) => v.trim()).map((v) => isolate(doc, v)).join(doc.typography.listSeparator)}</div>
          ${edu.honors.trim() ? `<p class="italic small soft">${isolate(doc, edu.honors)}</p>` : ''}
        </div>`).join('')}</div>`),
    );
  }

  if (data.certifications.length) {
    parts.push(
      section(labels.certifications, config, `<div class="entries" style="gap:6px">${data.certifications.map((cert) => `
        <div class="row">
          <span style="font-weight:500">${isolate(doc, cert.name)}${cert.org.trim() ? ` <span class="soft" style="font-weight:400">— ${isolate(doc, cert.org)}</span>` : ''}</span>
          <span class="date">${isolate(doc, cert.date)}</span>
        </div>`).join('')}</div>`),
    );
  }

  if (data.projects.length) {
    parts.push(
      section(labels.projects, config, `<div class="entries">${data.projects.map((project) => `
        <div class="entry">
          <span style="font-weight:700;font-size:10.5pt">${isolate(doc, project.name)}</span>
          ${project.description.trim() ? `<p class="italic small muted">${isolate(doc, project.description)}</p>` : ''}
          ${list(nonEmpty(project.bullets), doc)}
        </div>`).join('')}</div>`),
    );
  }

  const awards = nonEmpty(data.awards);
  if (awards.length) parts.push(section(labels.awards, config, list(awards, doc)));

  parts.push('</div>');
  parts.push('</div>');
  return parts.join('');
}

function sharedCss(config: TemplateConfig, accent: string): string {
  const font = (kind: 'serif' | 'sans') => (kind === 'serif' ? SERIF : SANS);
  const qcRoom = QUARTER_CIRCLE_PX + MARK_GAP_PX;
  return `
    :root {
      --accent: ${accent};
      --tint: ${tintHex(accent, 0.1)};
      --tint-strong: ${tintHex(accent, 0.15)};
    }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .stack { display: flex; flex-direction: column; gap: 18px; position: relative; z-index: 1; }
    h1 { margin: 0 0 4px; font-size: 28pt; font-weight: 700; line-height: 1.15; font-family: ${font(config.fontName)}; }
    h2 { margin: 0 0 10px; font-size: 11pt; font-family: ${font(config.fontHeadings)}; color: var(--accent); }
    .h-banner { padding: 3px 8px; font-weight: 700; background: var(--tint); letter-spacing: ${HEADING_TRACKING_EM.banner}em; }
    .h-underline { padding-bottom: 3px; font-weight: 700; border-bottom: ${config.headerRuleVariant === 'thick' ? 2 : 1}px solid var(--accent); letter-spacing: ${HEADING_TRACKING_EM.underline}em; }
    .h-small-caps { padding-bottom: 3px; font-weight: 600; font-variant: small-caps; letter-spacing: ${HEADING_TRACKING_EM['small-caps']}em; }
    .h-small-caps-rule { padding-bottom: 3px; font-weight: 600; font-variant: small-caps; letter-spacing: ${HEADING_TRACKING_EM['small-caps-rule']}em; border-bottom: ${config.headerRuleVariant === 'hairline' ? 0.5 : 1}px solid var(--accent); }
    .h-plain { font-weight: 700; font-size: 12pt; letter-spacing: ${HEADING_TRACKING_EM.plain}em; }
    .upper { text-transform: uppercase; }
    .row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .date { font-size: 9.5pt; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .muted { color: #444; }
    .soft { color: #666; }
    .italic { font-style: italic; }
    .small { font-size: 9.5pt; }
    ul { margin: 4px 0 0; padding-left: 18px; }
    li { margin: 0 0 2px; font-size: 9.5pt; }
    p { margin: 0 0 4px; }
    section { break-inside: avoid-page; page-break-inside: avoid; }
    .entry { display: flex; flex-direction: column; break-inside: avoid; page-break-inside: avoid; }
    .entries { display: flex; flex-direction: column; gap: 12px; }
    .pill { display: inline-block; font-size: 8.5pt; padding: 1px 8px; border-radius: 999px; background: var(--tint-strong); color: var(--accent); margin: 0 4px 4px 0; }
    html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    .content {
      position: relative; color: #111;
      font-family: ${font(config.fontBody)}; font-size: 10pt; line-height: 1.5;
      overflow-wrap: anywhere; word-break: normal;
    }
    .row > :first-child { min-width: 0; }
    /* Decorative marks sit in a reserved band inside the content box, so they never
       overlap text and render the same in the preview and in every print engine. */
    .mark-qc { position: absolute; top: 0; right: 0; width: ${QUARTER_CIRCLE_PX}px; height: ${QUARTER_CIRCLE_PX}px; background: var(--accent); border-bottom-left-radius: 100%; }
    .has-qc header { padding-right: ${qcRoom}px; min-height: ${QUARTER_CIRCLE_PX}px; }
    .has-qc.centered header { padding-left: ${qcRoom}px; }
    .mark-rule { position: absolute; top: 0; left: 0; right: 0; height: ${RULE_PX}px; background: var(--accent); }
    .has-rule header { padding-top: ${RULE_PX + MARK_GAP_PX * 2}px; }
  `;
}

/** The only part that differs between preview and PDF: how the page frames the content. */
function geometryCss(mode: RenderMode, paper: PaperSize): string {
  const size = PAPER_CSS[paper];
  const margin = `${PAGE_MARGIN_IN}in`;
  if (mode === 'preview') {
    return `
    html, body { margin: 0; padding: 0; background: #E9E7E2; }
    @page { size: ${size.name}; margin: ${margin}; }
    .page { position: relative; overflow: hidden; background: #fff; width: ${size.width}; min-height: ${size.height}; padding: ${margin}; margin: 0 auto; box-shadow: 0 6px 24px rgba(0,0,0,.18); }
  `;
  }
  return `
    html, body { margin: 0; padding: 0; background: #fff; }
    @page { size: ${size.name}; margin: ${margin}; }
    .page { position: relative; background: #fff; }
  `;
}

const watermarkCss = (tileUrl: string) => `
    .watermark {
      position: absolute; inset: 0; z-index: 5; pointer-events: none;
      background-image: url("${tileUrl}"); background-repeat: repeat; background-size: 300px 190px;
    }
    .content { -webkit-user-select: none; user-select: none; }
  `;

/**
 * Non-Latin scripts (Arabic): no template uppercase, small caps, tracking or italics (they
 * break cursive joins or do not exist in the script), and a named Arabic font ahead of each
 * template font. `!important` also overrides the inline name tracking.
 */
function scriptCss(config: TemplateConfig): string {
  const arabicFirst = (kind: 'serif' | 'sans') => `${ARABIC_FONT_FAMILIES}, ${kind === 'serif' ? SERIF : SANS}`;
  return `
    .upper, h1, h2 { text-transform: none !important; }
    .italic { font-style: normal !important; }
    h1, h2, .h-banner, .h-underline, .h-small-caps, .h-small-caps-rule, .h-plain { letter-spacing: 0 !important; font-variant: normal !important; }
    .content { font-family: ${arabicFirst(config.fontBody)}; }
    h1 { font-family: ${arabicFirst(config.fontName)}; }
    h2 { font-family: ${arabicFirst(config.fontHeadings)}; }
  `;
}

/**
 * Right-to-left documents. Reading-order properties follow the direction (list indent,
 * pill spacing; flex rows and start/end text alignment follow dir="rtl" by themselves, so
 * dates sit at the end of their row). Decorative marks are NOT mirrored: they are part of
 * each template's identity and keep their reserved band, which never overlaps text.
 */
const RTL_CSS = `
    ul { padding-left: 0; padding-right: 18px; }
    .pill { margin: 0 0 4px 4px; }
  `;

/**
 * Text whose direction can differ from the document's is isolated in a right-to-left
 * document, so its punctuation and digits keep their order: every user-entered value (name,
 * titles, companies, bullets, paragraphs, skills, dates, contact parts). Without it an
 * English bullet's final period, or the "++" of "C++", lands on the wrong side of the line.
 * Plain `<bdi>` infers the direction from the first strong letter, so an Arabic value is
 * unchanged and an English one reads left-to-right as a unit. `dir` forces a direction for
 * strings that are always left-to-right (email, URL, phone). Left-to-right documents are
 * rendered exactly as before.
 */
function isolate(doc: DocContext, text: string, dir?: 'ltr'): string {
  if (doc.typography.direction === 'ltr') return e(text);
  // Arabic-first text with Latin runs inside ("C++", "AWS Lambda"): each run is its own
  // left-to-right isolate, so its symbols and punctuation keep their side.
  const body = dir ? e(text) : mapLatinRuns(text, e, (run) => `<bdi dir="ltr">${e(run)}</bdi>`);
  return `<bdi${dir ? ` dir="${dir}"` : ''}>${body}</bdi>`;
}

/** The start and end sides of a line in this document's direction. */
const startSide = (doc: DocContext) => (doc.typography.direction === 'rtl' ? 'right' : 'left');
const endSide = (doc: DocContext) => (doc.typography.direction === 'rtl' ? 'left' : 'right');

function renderHeader(data: ResumeData, config: TemplateConfig, doc: DocContext): string {
  const contact = contactParts(data, doc);
  const upper = config.nameCase === 'uppercase';
  if (config.nameAlign === 'split') {
    return `<header class="row" style="border-bottom:1px solid var(--accent);padding-bottom:8px">
      <h1 style="color:var(--accent);${upper ? 'text-transform:uppercase;' : ''}">${isolate(doc, data.name)}</h1>
      <div style="text-align:${endSide(doc)};font-size:8.5pt;display:flex;flex-direction:column;gap:1px">${contact.map((p) => `<span>${p}</span>`).join('')}</div>
    </header>`;
  }
  const align = config.nameAlign === 'center' ? 'center' : startSide(doc);
  const rule = config.id === 'corporate-partner' || config.id === 'healthcare-educator'
    ? '<div style="height:1px;background:var(--accent);margin-bottom:6px"></div>'
    : '';
  return `<header style="text-align:${align}">
    <h1 style="${upper ? `text-transform:uppercase;letter-spacing:${NAME_TRACKING_EM}em;` : ''}">${isolate(doc, data.name)}</h1>
    ${rule}
    <div style="font-size:9.5pt;text-align:${config.contactAlign === 'center' ? 'center' : startSide(doc)}">${contact.join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</div>
  </header>`;
}

/** Contact parts as escaped HTML; phone, email and links are always left-to-right. */
function contactParts(data: ResumeData, doc: DocContext): string[] {
  const c = data.contact;
  const parts: [string, 'ltr' | undefined][] = [
    [c.phone, 'ltr'],
    [c.email, 'ltr'],
    [c.location, undefined],
    [c.linkedin.replace(/^https?:\/\//, ''), 'ltr'],
    [c.website.replace(/^https?:\/\//, ''), 'ltr'],
  ];
  return parts
    .map(([value, dir]) => [value.trim(), dir] as const)
    .filter(([value]) => value)
    .map(([value, dir]) => isolate(doc, value, dir));
}

function section(title: string, config: TemplateConfig, body: string): string {
  const upper = config.sectionHeaderCase === 'uppercase' ? ' upper' : '';
  return `<section><h2 class="h-${config.sectionHeaderStyle}${upper}">${e(title)}</h2><div>${body}</div></section>`;
}

function list(items: string[], doc: DocContext): string {
  if (!items.length) return '';
  return `<ul>${items.map((item) => `<li>${isolate(doc, item)}</li>`).join('')}</ul>`;
}

function renderSkills(skills: string[], config: TemplateConfig, doc: DocContext): string {
  const items = skills.map((skill) => isolate(doc, skill));
  switch (config.skillsStyle) {
    case 'dash':
      return `<span class="small" style="font-weight:500">${items.join(' - ')}</span>`;
    case 'comma':
      return `<span class="small">${items.join(doc.typography.listSeparator)}</span>`;
    case 'mono':
      return `<span style="font-size:8.5pt;font-family:${MONO};color:#444">${items.join(' • ')}</span>`;
    case 'pills':
      return `<div>${items.map((s) => `<span class="pill">${s}</span>`).join('')}</div>`;
  }
}

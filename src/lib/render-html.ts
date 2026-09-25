import { getTemplate, type TemplateConfig } from './templates';
import { escapeHtml, isHexColor, tintHex } from './text';
import type { ResumeData } from './types';

// One renderer feeds both the on-screen preview (WebView) and the exported PDF
// (expo-print), so what the user sees is exactly what they get.

const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "-apple-system, 'Helvetica Neue', Helvetica, Roboto, Arial, sans-serif";
const MONO = "Menlo, 'Courier New', monospace";

export type RenderMode = 'preview' | 'pdf';

export interface RenderOptions {
  templateId: string;
  accent: string;
  mode: RenderMode;
  /** Adds a diagonal "PREVIEW" watermark. Used in the on-screen preview until exports are unlocked. */
  watermark?: boolean;
}

const e = escapeHtml;
const nonEmpty = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);

export function renderResumeHtml(data: ResumeData, options: RenderOptions): string {
  const config = getTemplate(options.templateId);
  const accent = isHexColor(options.accent) ? options.accent : config.defaultAccent;
  const font = (kind: 'serif' | 'sans') => (kind === 'serif' ? SERIF : SANS);

  const css = `
    :root {
      --accent: ${accent};
      --tint: ${tintHex(accent, 0.1)};
      --tint-strong: ${tintHex(accent, 0.15)};
    }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    html, body { margin: 0; padding: 0; background: ${options.mode === 'preview' ? '#E9E7E2' : '#fff'}; }
    @page { size: letter; margin: 0.75in; }
    .page {
      position: relative; overflow: hidden; background: #fff; color: #111;
      font-family: ${font(config.fontBody)}; font-size: 10pt; line-height: 1.5;
      ${options.mode === 'preview' ? 'width: 8.5in; min-height: 11in; padding: 0.75in; margin: 0 auto; box-shadow: 0 6px 24px rgba(0,0,0,.18);' : ''}
    }
    .stack { display: flex; flex-direction: column; gap: 18px; position: relative; z-index: 1; }
    .mark-qc { position: absolute; top: 0; right: 0; width: 96px; height: 96px; background: var(--accent); border-bottom-left-radius: 100%; }
    .mark-rule { position: absolute; top: 0; left: 0; right: 0; height: 8px; background: var(--accent); }
    h1 { margin: 0 0 4px; font-size: 28pt; font-weight: 700; line-height: 1.15; font-family: ${font(config.fontName)}; }
    h2 { margin: 0 0 10px; font-size: 11pt; font-family: ${font(config.fontHeadings)}; color: var(--accent); }
    .h-banner { padding: 3px 8px; font-weight: 700; background: var(--tint); letter-spacing: .06em; }
    .h-underline { padding-bottom: 3px; font-weight: 700; border-bottom: ${config.headerRuleVariant === 'thick' ? 2 : 1}px solid var(--accent); letter-spacing: .12em; }
    .h-small-caps { padding-bottom: 3px; font-weight: 600; font-variant: small-caps; letter-spacing: .12em; }
    .h-small-caps-rule { padding-bottom: 3px; font-weight: 600; font-variant: small-caps; letter-spacing: .12em; border-bottom: ${config.headerRuleVariant === 'hairline' ? 0.5 : 1}px solid var(--accent); }
    .h-plain { font-weight: 700; font-size: 12pt; letter-spacing: .04em; }
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
    .watermark {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      pointer-events: none; z-index: 5; font: 700 96pt ${SANS}; color: rgba(0,0,0,.07);
      transform: rotate(-30deg); letter-spacing: .1em;
    }
  `;

  const parts: string[] = [];

  if (config.decorativeMark === 'quarter-circle') parts.push('<div class="mark-qc"></div>');
  if (config.decorativeMark === 'rule') parts.push('<div class="mark-rule"></div>');
  if (options.watermark) parts.push('<div class="watermark">PREVIEW</div>');

  parts.push('<div class="stack">');
  parts.push(renderHeader(data, config));

  const summaryBullets = nonEmpty(data.summary.bullets);
  const skills = nonEmpty(data.summary.skills);
  if (data.summary.tagline.trim() || summaryBullets.length || skills.length) {
    parts.push(
      section('Summary', config, [
        data.summary.tagline.trim() ? `<p class="italic" style="font-size:11pt;font-weight:500">${e(data.summary.tagline)}</p>` : '',
        list(summaryBullets),
        skills.length ? `<div style="margin-top:4px">${renderSkills(skills, config)}</div>` : '',
      ].join('')),
    );
  }

  if (data.experience.length) {
    parts.push(
      section('Experience', config, `<div class="entries">${data.experience.map((exp) => {
        const dates = [exp.start, exp.end].filter((v) => v.trim()).map(e).join(' – ');
        const titleWeight = config.jobTitleWeight === 'bold' ? 700 : 600;
        const where = [exp.company, exp.location].filter((v) => v.trim()).map(e).join(', ');
        return `<div class="entry">
          <div class="row">
            <span><span style="font-weight:${titleWeight};font-size:11pt">${e(exp.title)}</span>${
              config.dateAlign === 'inline' && dates ? ` <span class="soft small">| ${dates}</span>` : ''
            }</span>
            ${config.dateAlign === 'right' && dates ? `<span class="date">${dates}</span>` : ''}
          </div>
          ${where ? `<div class="muted ${config.companyStyle === 'italic' ? 'italic' : ''}" style="${config.companyStyle === 'italic' ? '' : 'font-weight:500;'}margin-bottom:2px">${where}</div>` : ''}
          ${exp.summary.trim() ? `<p class="small">${e(exp.summary)}</p>` : ''}
          ${list(nonEmpty(exp.bullets))}
        </div>`;
      }).join('')}</div>`),
    );
  }

  if (data.education.length) {
    parts.push(
      section('Education', config, `<div class="entries">${data.education.map((edu) => `
        <div class="entry">
          <div class="row"><span style="font-weight:700;font-size:10.5pt">${e(edu.degree)}</span><span class="date">${e(edu.date)}</span></div>
          <div>${[edu.school, edu.location].filter((v) => v.trim()).map(e).join(', ')}</div>
          ${edu.honors.trim() ? `<p class="italic small soft">${e(edu.honors)}</p>` : ''}
        </div>`).join('')}</div>`),
    );
  }

  if (data.certifications.length) {
    parts.push(
      section('Certifications', config, `<div class="entries" style="gap:6px">${data.certifications.map((cert) => `
        <div class="row">
          <span style="font-weight:500">${e(cert.name)}${cert.org.trim() ? ` <span class="soft" style="font-weight:400">— ${e(cert.org)}</span>` : ''}</span>
          <span class="date">${e(cert.date)}</span>
        </div>`).join('')}</div>`),
    );
  }

  if (data.projects.length) {
    parts.push(
      section('Projects', config, `<div class="entries">${data.projects.map((project) => `
        <div class="entry">
          <span style="font-weight:700;font-size:10.5pt">${e(project.name)}</span>
          ${project.description.trim() ? `<p class="italic small muted">${e(project.description)}</p>` : ''}
          ${list(nonEmpty(project.bullets))}
        </div>`).join('')}</div>`),
    );
  }

  const awards = nonEmpty(data.awards);
  if (awards.length) parts.push(section('Awards', config, list(awards)));

  parts.push('</div>');

  // Preview: a fixed-width viewport (page + gutter) makes iOS and Android WebViews
  // scale the letter-size page to fit the screen width, with pinch-zoom for detail.
  const viewport = options.mode === 'preview'
    ? '<meta name="viewport" content="width=848, maximum-scale=4">'
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${viewport}<title>${e(data.name || 'Resume')}</title><style>${css}</style></head><body${
    options.mode === 'preview' ? ' style="padding:16px"' : ''
  }><div class="page">${parts.join('')}</div></body></html>`;
}

function renderHeader(data: ResumeData, config: TemplateConfig): string {
  const contact = contactParts(data);
  const upper = config.nameCase === 'uppercase';
  if (config.nameAlign === 'split') {
    return `<header class="row" style="border-bottom:1px solid var(--accent);padding-bottom:8px">
      <h1 style="color:var(--accent);${upper ? 'text-transform:uppercase;' : ''}">${e(data.name)}</h1>
      <div style="text-align:right;font-size:8.5pt;display:flex;flex-direction:column;gap:1px">${contact.map((p) => `<span>${e(p)}</span>`).join('')}</div>
    </header>`;
  }
  const align = config.nameAlign === 'center' ? 'center' : 'left';
  const rule = config.id === 'corporate-partner' || config.id === 'healthcare-educator'
    ? '<div style="height:1px;background:var(--accent);margin-bottom:6px"></div>'
    : '';
  return `<header style="text-align:${align}">
    <h1 style="${upper ? 'text-transform:uppercase;letter-spacing:.15em;' : ''}">${e(data.name)}</h1>
    ${rule}
    <div style="font-size:9.5pt;text-align:${config.contactAlign === 'center' ? 'center' : 'left'}">${contact.map(e).join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</div>
  </header>`;
}

function contactParts(data: ResumeData): string[] {
  const c = data.contact;
  return [c.phone, c.email, c.location, c.linkedin.replace(/^https?:\/\//, ''), c.website.replace(/^https?:\/\//, '')]
    .map((v) => v.trim())
    .filter(Boolean);
}

function section(title: string, config: TemplateConfig, body: string): string {
  const upper = config.sectionHeaderCase === 'uppercase' ? ' upper' : '';
  return `<section><h2 class="h-${config.sectionHeaderStyle}${upper}">${e(title)}</h2><div>${body}</div></section>`;
}

function list(items: string[]): string {
  if (!items.length) return '';
  return `<ul>${items.map((item) => `<li>${e(item)}</li>`).join('')}</ul>`;
}

function renderSkills(skills: string[], config: TemplateConfig): string {
  switch (config.skillsStyle) {
    case 'dash':
      return `<span class="small" style="font-weight:500">${skills.map(e).join(' - ')}</span>`;
    case 'comma':
      return `<span class="small">${skills.map(e).join(', ')}</span>`;
    case 'mono':
      return `<span style="font-size:8.5pt;font-family:${MONO};color:#444">${skills.map(e).join(' • ')}</span>`;
    case 'pills':
      return `<div>${skills.map((s) => `<span class="pill">${e(s)}</span>`).join('')}</div>`;
  }
}

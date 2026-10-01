import { describe, expect, it } from 'vitest';
import {
  PAGE_MARGIN_IN,
  renderResumeHtml,
  WATERMARK_TILE_URL,
  type PaperSize,
  type RenderOptions,
} from '../domain/render/render-html';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import type { ResumeData, StoredResume } from '../domain/resume/types';
import { TEMPLATES } from '../domain/templates/templates';
import { MARGIN_PT, pdfHtml } from '../services/export/file-export-platform';
import { renderPreview } from '../services/preview/preview-service';

const between = (html: string, open: string, close: string) => {
  const start = html.indexOf(open);
  const end = html.indexOf(close);
  expect(start, open).toBeGreaterThanOrEqual(0);
  expect(end, close).toBeGreaterThan(start);
  return html.slice(start + open.length, end);
};
const content = (html: string) => between(html, '<!--content-->', '<!--/content-->');
const shared = (html: string) => between(html, '/*shared*/', '/*/shared*/');
const geometry = (html: string) => between(html, '/*geometry*/', '/*/geometry*/');
const render = (options: Partial<RenderOptions> & { mode: RenderOptions['mode'] }, data: ResumeData = SAMPLE_RESUME) =>
  renderResumeHtml(data, { templateId: 'corporate-boardroom', accent: '#1B2B47', language: 'en', ...options });

const stored = (overrides: Partial<StoredResume> = {}): StoredResume => ({
  id: 'r1', title: 'Mine', templateId: 'corporate-boardroom', accent: '#1B2B47', language: 'en', data: SAMPLE_RESUME, createdAt: 1, updatedAt: 1, ...overrides,
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

describe('preview/export parity: one rendering path', () => {
  it('the resume content block is byte-identical in preview and PDF for every template and paper size', () => {
    for (const template of TEMPLATES) {
      for (const paper of ['letter', 'a4'] as PaperSize[]) {
        const options = { templateId: template.id, accent: template.defaultAccent, paper };
        const preview = render({ ...options, mode: 'preview', watermark: true });
        const pdf = render({ ...options, mode: 'pdf' });
        expect(content(preview), `${template.id} ${paper}`).toBe(content(pdf));
        expect(shared(preview), `${template.id} ${paper}`).toBe(shared(pdf));
      }
    }
  });

  it('only the page framing differs, and both use the same 0.75 in margin and paper size', () => {
    for (const [paper, width, height, name] of [['letter', '8.5in', '11in', 'letter'], ['a4', '210mm', '297mm', 'A4']] as const) {
      const preview = geometry(render({ mode: 'preview', paper }));
      const pdf = geometry(render({ mode: 'pdf', paper }));
      expect(preview).toContain(`width: ${width}`);
      expect(preview).toContain(`min-height: ${height}`);
      expect(preview).toContain(`padding: ${PAGE_MARGIN_IN}in`);
      expect(pdf).toContain(`@page { size: ${name}; margin: ${PAGE_MARGIN_IN}in; }`);
      expect(preview).toContain(`@page { size: ${name}; margin: ${PAGE_MARGIN_IN}in; }`);
    }
    // The device print margin (points) matches the renderer margin (inches).
    expect(MARGIN_PT).toBe(PAGE_MARGIN_IN * 72);
  });

  it('typography, colors, spacing, sections and ordering come from the shared block only', () => {
    const preview = render({ mode: 'preview', templateId: 'tech-architect', accent: '#0F766E' });
    const pdf = render({ mode: 'pdf', templateId: 'tech-architect', accent: '#0F766E' });
    for (const html of [preview, pdf]) {
      expect(shared(html)).toContain('--accent: #0F766E');
      expect(geometry(html)).not.toMatch(/font|color: #|--accent|gap|line-height/);
    }
    const order = (html: string) => [...content(html).matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);
    expect(order(preview)).toEqual(['Summary', 'Experience', 'Education', 'Certifications', 'Projects', 'Awards']);
    expect(order(pdf)).toEqual(order(preview));
  });
});

describe('preview watermark (renderer capability) and the clean app preview', () => {
  it('the renderer can draw a repeating diagonal PREVIEW overlay above the content, over the whole page', () => {
    const html = render({ mode: 'preview', watermark: true });
    expect(html).toContain('</div><!--/content--><div class="watermark" aria-hidden="true"></div></div>');
    const css = between(html, '/*watermark*/', '/*/watermark*/');
    expect(css).toContain('inset: 0');
    expect(css).toContain('pointer-events: none');
    expect(css).toContain('background-repeat: repeat');
    expect(Number(/z-index: (\d+)/.exec(css)![1])).toBeGreaterThan(Number(/\.stack \{[^}]*z-index: (\d+)/.exec(html)![1]));
    const tile = decodeURIComponent(WATERMARK_TILE_URL.replace('data:image/svg+xml,', ''));
    expect(tile).toContain('>PREVIEW<');
    expect(tile).toMatch(/rotate\(-30/);
    const opacity = Number(/fill-opacity='([\d.]+)'/.exec(tile)![1]);
    expect(opacity).toBeGreaterThan(0.05); // clearly visible
    expect(opacity).toBeLessThanOrEqual(0.15); // the resume stays readable
  });

  it('the app preview is clean for everyone (My Resume is free)', () => {
    for (const template of TEMPLATES) {
      const html = renderPreview(stored({ templateId: template.id, accent: template.defaultAccent }));
      expect(html, template.id).not.toContain('class="watermark"');
      expect(html, template.id).not.toContain('/*watermark*/');
      expect(html, template.id).not.toContain('PREVIEW');
    }
  });

  it('the PDF renderer never draws a watermark, even if asked', () => {
    const pdf = render({ mode: 'pdf', watermark: true });
    expect(pdf).not.toContain('class="watermark"');
    expect(pdf).not.toContain(WATERMARK_TILE_URL);
    expect(pdf).not.toContain('PREVIEW');
    for (const paper of ['letter', 'a4'] as PaperSize[]) expect(pdfHtml(stored(), paper)).not.toContain('PREVIEW');
  });

  it('extra arguments and resume fields cannot change the preview', () => {
    const anyPreview = renderPreview as unknown as (...args: unknown[]) => string;
    const clean = renderPreview(stored());
    for (const extra of [{ watermark: true }, { mode: 'pdf' }, true, 'watermark']) expect(anyPreview(stored(), extra)).toBe(clean);
    const sneaky = { ...stored(), watermark: true, data: { ...SAMPLE_RESUME, watermark: true } } as StoredResume;
    expect(renderPreview(sneaky)).toBe(clean);
  });

  it('is never part of the resume data: rendering does not modify the resume, and content is the same with or without a watermark', () => {
    const resume = deepFreeze(stored({ data: JSON.parse(JSON.stringify(SAMPLE_RESUME)) as ResumeData }));
    const before = JSON.stringify(resume);
    const app = renderPreview(resume);
    const marked = render({ mode: 'preview', watermark: true }, resume.data);
    expect(JSON.stringify(resume)).toBe(before);
    expect(JSON.stringify(resume)).not.toMatch(/watermark|PREVIEW/i);
    expect(content(app)).toBe(content(marked));
  });
});

describe('decorative marks never share space with text', () => {
  it('Boardroom and Foreman: the quarter-circle has a reserved band on both sides of the centered header', () => {
    for (const templateId of ['corporate-boardroom', 'trades-foreman']) {
      const html = render({ mode: 'pdf', templateId });
      expect(content(html)).toMatch(/^<div class="content has-qc centered"><div class="mark-qc" aria-hidden="true"><\/div>/);
      expect(shared(html)).toMatch(/\.has-qc header \{ padding-right: 104px; min-height: 96px; \}/);
      expect(shared(html)).toMatch(/\.has-qc\.centered header \{ padding-left: 104px; \}/);
    }
  });

  it('top-rule templates keep the bar above the header', () => {
    for (const template of TEMPLATES.filter((t) => t.decorativeMark === 'rule')) {
      const html = render({ mode: 'pdf', templateId: template.id });
      expect(content(html)).toContain('<div class="mark-rule" aria-hidden="true"></div>');
      expect(shared(html)).toContain('.has-rule header { padding-top: 24px; }');
    }
  });
});

describe('corrupted, missing and edge-case data', () => {
  it('renders malformed data without throwing', () => {
    const broken = {
      name: 42, contact: null, summary: { bullets: 'nope', skills: [1, 'SQL'] },
      experience: [{ title: 'Dev' }, null, 'x'], education: {}, awards: [null, 'Award'],
    } as unknown as ResumeData;
    for (const mode of ['preview', 'pdf'] as const) {
      const html = render({ mode }, broken);
      expect(html).toContain('Dev');
      expect(html).toContain('SQL');
      expect(html).toContain('Award');
    }
    expect(() => render({ mode: 'pdf' }, undefined as unknown as ResumeData)).not.toThrow();
  });

  it('empty resume, unknown template and invalid color fall back safely', () => {
    const html = renderResumeHtml({ ...SAMPLE_RESUME, name: '', experience: [], summary: { tagline: '', bullets: [], skills: [] } }, {
      templateId: 'does-not-exist', accent: 'red;}</style><script>', mode: 'pdf', language: 'en',
    });
    expect(html).toContain('mark-qc'); // fell back to The Boardroom
    expect(html).toContain('--accent: #1B2B47');
    expect(html).not.toContain('<script>');
  });

  it('long names, contact details and company names are escaped and allowed to wrap', () => {
    const long = {
      ...SAMPLE_RESUME,
      name: 'Maximiliana Alexandrovna Konstantinopolous-Van Der Westhuizen',
      contact: { ...SAMPLE_RESUME.contact, email: 'a.very.long.email.address.without.any.breaks@an-extremely-long-domain-name-example.com' },
    };
    const html = render({ mode: 'pdf' }, long);
    expect(html).toContain(long.contact.email);
    expect(shared(html)).toContain('overflow-wrap: anywhere');
  });
});

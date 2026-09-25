import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { PAPER_POINTS, renderResumeHtml, type PaperSize, type RenderMode } from '../domain/render/render-html';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import type { ResumeData } from '../domain/resume/types';
import { TEMPLATES } from '../domain/templates/templates';

// Real layout checks in a browser engine (Chromium via playwright-core, a dev-only
// dependency). The rendered HTML is laid out the way the WebView preview and the
// print engine lay it out, and geometry is measured instead of string-matched.
// Skipped when no Chromium is installed.

const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const hasChromium = existsSync(CHROMIUM);

/** Letter content box: 8.5in − 2 × 0.75in = 7in = 672 CSS px (what the print engine lays out). */
const CONTENT_PX: Record<PaperSize, number> = { letter: 672, a4: Math.round((210 / 25.4 - 1.5) * 96) };

const MARK_TEMPLATES = TEMPLATES.filter((t) => t.decorativeMark !== 'none').map((t) => t.id);

const LONG: ResumeData = {
  ...SAMPLE_RESUME,
  name: 'Maximiliana Alexandrovna Konstantinopolous-Van Der Westhuizen',
  contact: {
    ...SAMPLE_RESUME.contact,
    email: 'a.very.long.email.address.without.any.breaks@an-extremely-long-domain-name-example.com',
    website: 'www.an-unreasonably-long-personal-website-domain-name-for-testing.example.org',
  },
  experience: SAMPLE_RESUME.experience.map((exp) => ({
    ...exp,
    company: 'International Consolidated Amalgamated Holdings and Subsidiaries Incorporated Worldwide',
    title: `${exp.title} and Principal Strategic Transformation Programme Lead`,
  })),
};

/** Long enough for several printed pages. */
const MULTI_PAGE: ResumeData = {
  ...SAMPLE_RESUME,
  experience: [...SAMPLE_RESUME.experience, ...SAMPLE_RESUME.experience, ...SAMPLE_RESUME.experience, ...SAMPLE_RESUME.experience],
};

const html = (templateId: string, mode: RenderMode, data: ResumeData = SAMPLE_RESUME, extra: { watermark?: boolean; paper?: PaperSize } = {}) =>
  renderResumeHtml(data, { templateId, accent: TEMPLATES.find((t) => t.id === templateId)!.defaultAccent, mode, ...extra });

interface Box { x: number; y: number; w: number; h: number }

/** Loads a render the way it is displayed: preview on screen, PDF as print media at the content width. */
async function load(page: Page, content: string, mode: RenderMode, paper: PaperSize = 'letter') {
  if (mode === 'pdf') {
    await page.setViewportSize({ width: CONTENT_PX[paper], height: 1000 });
    await page.emulateMedia({ media: 'print' });
  } else {
    await page.setViewportSize({ width: 900, height: 1000 });
    await page.emulateMedia({ media: 'screen' });
  }
  await page.setContent(content, { waitUntil: 'load' });
}

/** Every text fragment's rect and the decorative marks' rects, relative to `.content`. */
function measureText(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('.content')!.getBoundingClientRect();
    const rel = (r: DOMRect) => ({ x: r.left - root.left, y: r.top - root.top, w: r.width, h: r.height });
    const texts: { text: string; box: { x: number; y: number; w: number; h: number } }[] = [];
    const walker = document.createTreeWalker(document.querySelector('.content')!, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) if (r.width > 0 && r.height > 0) texts.push({ text: node.textContent.trim(), box: rel(r) });
    }
    const marks = Array.from(document.querySelectorAll('.mark-qc, .mark-rule')).map((el) => rel(el.getBoundingClientRect()));
    return { texts, marks, width: root.width };
  });
}

const intersects = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe.skipIf(!hasChromium)('layout in a real browser engine', () => {
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

  it('Boardroom, Foreman and the top-rule templates: no text touches a decorative mark (preview and PDF, sample and long data)', async () => {
    expect(MARK_TEMPLATES.sort()).toEqual(
      ['academic-researcher', 'corporate-boardroom', 'corporate-partner', 'creative-editorial', 'healthcare-educator', 'trades-foreman'].sort(),
    );
    for (const templateId of MARK_TEMPLATES) {
      for (const mode of ['pdf', 'preview'] as RenderMode[]) {
        for (const [label, data] of [['sample', SAMPLE_RESUME], ['long', LONG]] as const) {
          await load(page, html(templateId, mode, data), mode);
          const { texts, marks } = await measureText(page);
          expect(marks.length, templateId).toBe(1);
          for (const mark of marks) {
            const hits = texts.filter((t) => intersects(t.box, mark)).map((t) => t.text);
            expect(hits, `${templateId} ${mode} ${label}`).toEqual([]);
          }
        }
      }
    }
  }, 60_000);

  it('the quarter-circle keeps its size and sits in the top-right corner of the content box', async () => {
    for (const templateId of ['corporate-boardroom', 'trades-foreman']) {
      for (const mode of ['pdf', 'preview'] as RenderMode[]) {
        await load(page, html(templateId, mode), mode);
        const { marks, width } = await measureText(page);
        expect(marks[0]).toEqual({ x: width - 96, y: 0, w: 96, h: 96 });
      }
    }
  });

  it('preview and PDF lay out every element at the same position and size, for all 12 templates', async () => {
    const boxes = () =>
      page.evaluate(() => {
        const root = document.querySelector('.content')!;
        const origin = root.getBoundingClientRect();
        return Array.from(root.querySelectorAll('*')).map((el) => {
          const r = el.getBoundingClientRect();
          return { tag: el.tagName, box: [r.left - origin.left, r.top - origin.top, r.width, r.height] };
        });
      });
    for (const template of TEMPLATES) {
      for (const paper of ['letter', 'a4'] as PaperSize[]) {
        await load(page, html(template.id, 'pdf', SAMPLE_RESUME, { paper }), 'pdf', paper);
        const pdf = await boxes();
        await load(page, html(template.id, 'preview', SAMPLE_RESUME, { paper, watermark: true }), 'preview', paper);
        const preview = await boxes();
        expect(pdf.length).toBeGreaterThan(20);
        // A4's content box is 649.7 px; the print viewport can only be whole pixels.
        const tolerance = paper === 'letter' ? 0.01 : 1;
        expect(preview.map((b) => b.tag), `${template.id} ${paper}`).toEqual(pdf.map((b) => b.tag));
        preview.forEach((b, i) =>
          b.box.forEach((v, k) => expect(Math.abs(v - pdf[i].box[k]), `${template.id} ${paper} ${b.tag}#${i}`).toBeLessThanOrEqual(tolerance)),
        );
      }
    }
  }, 60_000);

  it('long names, emails and company names wrap inside the page (no horizontal overflow)', async () => {
    for (const template of TEMPLATES) {
      for (const mode of ['pdf', 'preview'] as RenderMode[]) {
        await load(page, html(template.id, mode, LONG), mode);
        const { texts, width } = await measureText(page);
        const outside = texts.filter((t) => t.box.x < -0.5 || t.box.x + t.box.w > width + 0.5).map((t) => t.text);
        expect(outside, `${template.id} ${mode}`).toEqual([]);
        const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(scroll, `${template.id} ${mode}`).toBeLessThanOrEqual(0);
      }
    }
  }, 60_000);

  it('FREE preview: the watermark covers the whole page and the resume stays readable; PREMIUM is clean', async () => {
    const shot = async (watermark: boolean) => {
      await load(page, html('corporate-boardroom', 'preview', SAMPLE_RESUME, { watermark }), 'preview');
      return (await page.locator('.page').screenshot()).toString('base64');
    };
    const free = await shot(true);
    const premium = await shot(false);
    // Decode both PNGs in the browser and compare them block by block.
    const blank = await browser.newPage();
    const result = await blank.evaluate(async ([a, b]) => {
      const decode = async (data: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height);
      };
      const [free, clean] = [await decode(a), await decode(b)];
      // A block at least one tile (300×190) in size always contains a full "PREVIEW".
      const BW = 320;
      const BH = 210;
      const blocks: { changed: number; maxDarkening: number }[] = [];
      for (let by = 0; by + BH <= free.height; by += BH) {
        for (let bx = 0; bx + BW <= free.width; bx += BW) {
          let changed = 0;
          let maxDarkening = 0;
          for (let y = by; y < by + BH; y++) {
            for (let x = bx; x < bx + BW; x++) {
              const i = (y * free.width + x) * 4;
              const lumFree = free.data[i] * 0.299 + free.data[i + 1] * 0.587 + free.data[i + 2] * 0.114;
              const lumClean = clean.data[i] * 0.299 + clean.data[i + 1] * 0.587 + clean.data[i + 2] * 0.114;
              const d = lumClean - lumFree;
              if (d > 4) changed++;
              maxDarkening = Math.max(maxDarkening, d);
            }
          }
          blocks.push({ changed, maxDarkening });
        }
      }
      return { size: [free.width, free.height, clean.width, clean.height], blocks };
    }, [free, premium]);
    await blank.close();

    expect(result.size[0]).toBe(result.size[2]);
    expect(result.size[1]).toBe(result.size[3]);
    expect(result.blocks.length).toBeGreaterThanOrEqual(8);
    for (const [index, block] of result.blocks.entries()) {
      expect(block.changed, `block ${index} has no watermark`).toBeGreaterThan(300);
      // Low opacity: nothing is darkened by more than ~15% of full scale.
      expect(block.maxDarkening, `block ${index} too dark`).toBeLessThan(40);
    }
  }, 60_000);

  it('a long resume prints on several pages of the chosen paper size, without a watermark', async () => {
    for (const paper of ['letter', 'a4'] as PaperSize[]) {
      await page.emulateMedia({ media: 'print' });
      await page.setContent(html('corporate-boardroom', 'pdf', MULTI_PAGE, { paper, watermark: true }), { waitUntil: 'load' });
      const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');
      const pages = pdf.match(/\/Type\s*\/Page\b/g) ?? [];
      expect(pages.length, paper).toBeGreaterThanOrEqual(2);
      const sizes = new Set(
        [...pdf.matchAll(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => `${Math.round(Number(m[1]))}x${Math.round(Number(m[2]))}`),
      );
      expect([...sizes], paper).toEqual([`${PAPER_POINTS[paper].width}x${PAPER_POINTS[paper].height}`]);
      expect(await page.$('.watermark')).toBeNull();
    }
  }, 60_000);
});

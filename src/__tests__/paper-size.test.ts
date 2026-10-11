import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { defaultPaperSize, regionOf } from '../domain/export/paper-default';
import { buildResumeDocxBase64, DOCX_PAGE_TWIPS } from '../domain/render/export-docx';
import { PAPER_POINTS, type PaperSize } from '../domain/render/render-html';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import type { StoredResume } from '../domain/resume/types';
import { TEMPLATES } from '../domain/templates/templates';
import { ar } from '../i18n/messages/ar';
import { de } from '../i18n/messages/de';
import { en } from '../i18n/messages/en';
import { es } from '../i18n/messages/es';
import { fr } from '../i18n/messages/fr';
import { ExportService, type ExportArtifact, type ExportPlatform } from '../services/export/export-service';
import { createFileExportPlatform, docxBase64, pdfHtml, type ExportFileSystem, type FileRef } from '../services/export/file-export-platform';
import { getPaperSize, setPaperSize } from '../services/export/paper-size';
import { renderPreview } from '../services/preview/preview-service';
import { SCHEMA_VERSION } from '../services/storage/sqlite/schema';
import { ARABIC_RESUME } from './fixtures/arabic-resume';

// Phase 16: one paper size (Letter or A4) for PDF, Word and image export.

const SRC = join(__dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');
const SIZES: PaperSize[] = ['letter', 'a4'];

const stored = (overrides: Partial<StoredResume> = {}): StoredResume => ({
  id: 'r1', title: 'Mine', templateId: 'corporate-boardroom', accent: '#1B2B47', language: 'en', data: SAMPLE_RESUME, createdAt: 1, updatedAt: 1, ...overrides,
});

const docxXml = async (paper: PaperSize | undefined, resume = stored()) => {
  const zip = await JSZip.loadAsync(Buffer.from(await docxBase64(resume, paper), 'base64'));
  return zip.file('word/document.xml')!.async('string');
};
const pgSz = (xml: string) => {
  const tag = /<w:pgSz\b[^>]*\/>/.exec(xml)?.[0] ?? '';
  return { tag, w: Number(/w:w="(\d+)"/.exec(tag)?.[1]), h: Number(/w:h="(\d+)"/.exec(tag)?.[1]), orient: /w:orient="(\w+)"/.exec(tag)?.[1] };
};

describe('the default paper size', () => {
  it('reads the region of a locale tag', () => {
    expect(regionOf('en-US')).toBe('US');
    expect(regionOf('de_DE')).toBe('DE');
    expect(regionOf('zh-Hans-CN')).toBe('CN');
    expect(regionOf('ar-SA')).toBe('SA');
    expect(regionOf('es-419')).toBeNull(); // a region group, not a country
    expect(regionOf('en')).toBeNull();
    expect(regionOf('ar')).toBeNull();
    expect(regionOf('')).toBeNull();
  });

  it('Letter in the United States, Canada and the other Letter countries; A4 elsewhere', () => {
    for (const tag of ['en-US', 'en-CA', 'fr-CA', 'es-MX', 'es-CL', 'es-CO', 'en-PH']) expect(defaultPaperSize([tag]), tag).toBe('letter');
    for (const tag of ['de-DE', 'de-AT', 'fr-FR', 'es-ES', 'ar-SA', 'ar-EG', 'ar-SD', 'en-GB', 'en-AU', 'ja-JP']) expect(defaultPaperSize([tag]), tag).toBe('a4');
  });

  it('without a region the default is Letter (what the PDF always used), and the first tag with a region decides', () => {
    expect(defaultPaperSize([])).toBe('letter');
    expect(defaultPaperSize(['en'])).toBe('letter');
    expect(defaultPaperSize(['ar'])).toBe('letter');
    expect(defaultPaperSize(['de', 'de-DE'])).toBe('a4');
  });

  it('the in-session choice wins over the default, is never written to the database, and the schema is unchanged', () => {
    const before = getPaperSize();
    expect(SIZES).toContain(before);
    setPaperSize('a4');
    expect(getPaperSize()).toBe('a4');
    setPaperSize('letter');
    expect(getPaperSize()).toBe('letter');
    const module = read('services/export/paper-size.ts');
    expect(module.replace(/\/\/.*$/gm, '')).not.toMatch(/sqlite|SettingsRepository|useDatabase/);
    expect(SCHEMA_VERSION).toBe(4);
  });
});

describe('Word: the page size is written explicitly (w:pgSz)', () => {
  it('Letter is 12240 × 15840 twips (8.5 × 11 in), portrait', async () => {
    for (const template of TEMPLATES) {
      const size = pgSz(await docxXml('letter', stored({ templateId: template.id })));
      expect({ w: size.w, h: size.h, orient: size.orient }, template.id).toEqual({ w: 12240, h: 15840, orient: 'portrait' });
    }
    expect(DOCX_PAGE_TWIPS.letter).toEqual({ width: PAPER_POINTS.letter.width * 20, height: PAPER_POINTS.letter.height * 20 });
  });

  it('A4 is 11906 × 16838 twips (210 × 297 mm), portrait', async () => {
    for (const template of TEMPLATES) {
      const size = pgSz(await docxXml('a4', stored({ templateId: template.id })));
      expect({ w: size.w, h: size.h, orient: size.orient }, template.id).toEqual({ w: 11906, h: 16838, orient: 'portrait' });
    }
    // 1 twip = 1/1440 in: 11906 twips = 209.99 mm, 16838 = 296.99 mm.
    expect(Math.abs((DOCX_PAGE_TWIPS.a4.width / 1440) * 25.4 - 210)).toBeLessThan(0.05);
    expect(Math.abs((DOCX_PAGE_TWIPS.a4.height / 1440) * 25.4 - 297)).toBeLessThan(0.05);
  });

  it('no silent fallback in either direction: Letter is not A4, A4 is not Letter, and the default is Letter', async () => {
    const letter = pgSz(await docxXml('letter'));
    const a4 = pgSz(await docxXml('a4'));
    expect(letter.w).not.toBe(a4.w);
    expect(letter.h).not.toBe(a4.h);
    expect(pgSz(await docxXml(undefined))).toEqual(letter);
  });

  it('an Arabic (right-to-left) document gets the same sizes, and the margins are unchanged', async () => {
    for (const paper of SIZES) {
      const xml = await docxXml(paper, stored({ language: 'ar', data: ARABIC_RESUME }));
      expect(pgSz(xml).w).toBe(DOCX_PAGE_TWIPS[paper].width);
      expect(pgSz(xml).h).toBe(DOCX_PAGE_TWIPS[paper].height);
      expect(/<w:pgMar\b[^>]*\/>/.exec(xml)![0]).toMatch(/w:top="1080".*w:right="1080"|w:right="1080".*w:top="1080"/);
    }
  });

  it('the paper size does not change the document content', async () => {
    const strip = (xml: string) => xml.replace(/<w:pgSz\b[^>]*\/>/, '');
    expect(strip(await docxXml('a4'))).toBe(strip(await docxXml('letter')));
  });

  it('the exporter itself takes the size (domain level)', async () => {
    const zip = await JSZip.loadAsync(Buffer.from(await buildResumeDocxBase64({ data: SAMPLE_RESUME, accent: '#1B2B47', templateName: 'x', language: 'en', paper: 'a4' }), 'base64'));
    expect(pgSz(await zip.file('word/document.xml')!.async('string')).w).toBe(11906);
  });
});

describe('the selected size reaches the real export path for PDF, Word and image', () => {
  class MemoryFs implements ExportFileSystem {
    files = new Map<string, string>();
    prepareFile(artifactId: string, name: string): FileRef {
      return { uri: `mem://exports/${artifactId}/${name}` };
    }
    writeBase64(file: FileRef, base64: string) {
      this.files.set(file.uri, base64);
    }
    async readBase64(uri: string) {
      return this.files.get(uri) ?? '';
    }
    async moveInto(source: string, target: FileRef) {
      this.files.set(target.uri, this.files.get(source) ?? '');
      this.files.delete(source);
    }
    deleteUri(uri: string) {
      this.files.delete(uri);
    }
    deleteArtifactDir(id: string) {
      for (const uri of [...this.files.keys()]) if (uri.includes(`/${id}/`)) this.files.delete(uri);
    }
    exists(file: FileRef) {
      return this.files.has(file.uri);
    }
    purge() {
      this.files.clear();
    }
  }

  function wired() {
    const fs = new MemoryFs();
    const printed: { html: string; width: number; height: number; marginPt: number }[] = [];
    const rasterized: string[] = [];
    const platform = createFileExportPlatform({
      fs,
      print: {
        async printToFile(options) {
          printed.push(options);
          const uri = `mem://tmp/${printed.length}.pdf`;
          fs.files.set(uri, Buffer.from('%PDF-fake').toString('base64'));
          return { uri };
        },
      },
      share: { isAvailable: async () => true, share: async () => 'unknown' },
      rasterizer: {
        async rasterize(pdf) {
          rasterized.push(pdf);
          return [{ index: 0, width: 1, height: 1, pngBase64: 'png' }];
        },
      },
    });
    return { fs, printed, rasterized, service: new ExportService(platform) };
  }

  it('PDF: the print adapter gets the points of the selected size and HTML laid out for it', async () => {
    const w = wired();
    await w.service.exportPdf(stored(), 'letter');
    await w.service.exportPdf(stored(), 'a4');
    expect(w.printed.map((p) => [p.width, p.height])).toEqual([[612, 792], [595, 842]]);
    expect(w.printed[0].html).toContain('size: letter');
    expect(w.printed[1].html).toContain('size: A4');
    // 595 × 842 pt is A4 (595.28 × 841.89) to within 0.3 pt.
    expect(Math.abs(PAPER_POINTS.a4.width - 595.28)).toBeLessThan(0.3);
    expect(Math.abs(PAPER_POINTS.a4.height - 841.89)).toBeLessThan(0.3);
  });

  it('image: the print intermediate uses the same size as the PDF, and the page images come from it', async () => {
    const w = wired();
    await w.service.exportImage(stored(), 'letter');
    await w.service.exportImage(stored(), 'a4');
    expect(w.printed.map((p) => [p.width, p.height])).toEqual([[612, 792], [595, 842]]);
    expect(w.rasterized).toHaveLength(2);
    // The same HTML a PDF export prints for that size (one renderer, no separate image renderer).
    expect(w.printed[0].html).toBe(pdfHtml(stored(), 'letter'));
    expect(w.printed[1].html).toBe(pdfHtml(stored(), 'a4'));
    expect([...w.fs.files.keys()].filter((uri) => uri.startsWith('mem://tmp/'))).toEqual([]);
  });

  it('Word: the exported file has the selected size', async () => {
    const w = wired();
    await w.service.exportDocx(stored(), 'a4');
    await w.service.exportDocx(stored(), 'letter');
    const files = [...w.fs.files.entries()].filter(([uri]) => uri.endsWith('.docx'));
    const sizes: number[] = [];
    for (const [, base64] of files) {
      const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'));
      sizes.push(pgSz(await zip.file('word/document.xml')!.async('string')).w);
    }
    expect(sizes.sort()).toEqual([11906, 12240]);
  });

  it('the service hands the selected size to the platform for every format, and the default is Letter', async () => {
    const calls: string[] = [];
    let next = 0;
    const platform: ExportPlatform = {
      generatePdf: async (_r, paper) => (calls.push(`pdf:${paper}`), { id: `a${++next}` } as ExportArtifact),
      generatePng: async (_r, paper) => (calls.push(`png:${paper}`), { id: `a${++next}` } as ExportArtifact),
      generateDocx: async (_r, paper) => (calls.push(`docx:${paper}`), { id: `a${++next}` } as ExportArtifact),
      share: async () => 'unknown',
      discard: async () => undefined,
    };
    const service = new ExportService(platform);
    for (const paper of SIZES) {
      await service.exportPdf(stored(), paper);
      await service.exportDocx(stored(), paper);
      await service.exportImage(stored(), paper);
    }
    await service.exportPdf(stored());
    await service.exportDocx(stored());
    await service.exportImage(stored());
    expect(calls).toEqual(['pdf:letter', 'docx:letter', 'png:letter', 'pdf:a4', 'docx:a4', 'png:a4', 'pdf:letter', 'docx:letter', 'png:letter']);
  });

  it('prepare/share: the size is fixed at prepare time; the handle stays opaque and single-use', async () => {
    const w = wired();
    const handle = await w.service.prepare(stored(), { format: 'docx', paper: 'a4' });
    expect(Object.keys(handle).sort()).toEqual(['format', 'id']);
    expect(Object.isFrozen(handle)).toBe(true);
    await w.service.share(handle);
    await expect(w.service.share(handle)).rejects.toThrow(/no longer available/);
  });

  it('changing the size never changes the resume', () => {
    const resume = stored();
    const before = JSON.stringify(resume);
    renderPreview(resume, 'a4');
    renderPreview(resume, 'letter');
    pdfHtml(resume, 'a4');
    expect(JSON.stringify(resume)).toBe(before);
  });
});

describe('Preview: one selector drives the page shown and every export', () => {
  it('the preview page has the selected size', () => {
    expect(renderPreview(stored(), 'letter')).toContain('width: 8.5in; min-height: 11in');
    expect(renderPreview(stored(), 'a4')).toContain('width: 210mm; min-height: 297mm');
    expect(renderPreview(stored())).toContain('width: 8.5in'); // default unchanged
  });

  it('the screen passes the selected size to PDF, Word and image, and offers both sizes with radio semantics', () => {
    const screen = read('features/preview/PreviewScreen.tsx');
    expect(screen).toMatch(/exporter\.exportPdf\(resume, paper\)/);
    expect(screen).toMatch(/exporter\.exportDocx\(resume, paper\)/);
    expect(screen).toMatch(/exporter\.exportImage\(resume, paper\)/);
    expect(screen).toMatch(/renderPreview\(resume, paper\)/);
    expect(screen).toMatch(/const PAPER_SIZES = \['letter', 'a4'\] as const;/);
    expect(screen).toMatch(/accessibilityRole="radiogroup"/);
    expect(screen).toMatch(/accessibilityRole="radio"/);
    expect(screen).toMatch(/accessibilityState=\{\{ selected, disabled: busy !== null \}\}/);
    expect(screen).toMatch(/useState<PaperSize>\(getPaperSize\)/);
    expect(screen).not.toMatch(/exportPdf\(resume\)|exportDocx\(resume\)|exportImage\(resume\)/);
  });

  it('works offline: the size logic has no network or platform dependency beyond the device locale', () => {
    for (const file of ['domain/export/paper-default.ts', 'services/export/paper-size.ts']) {
      expect(read(file).replace(/\/\/.*$/gm, '')).not.toMatch(/fetch\(|XMLHttpRequest|https?:\/\//);
    }
  });
});

describe('paper-size messages in all five languages', () => {
  const catalogs = { en, de, fr, es, ar };
  it('the same four keys exist everywhere, with no parameters', () => {
    for (const [language, catalog] of Object.entries(catalogs)) {
      expect(Object.keys(catalog.preview.paper).sort(), language).toEqual(['a4', 'hint', 'label', 'letter']);
      for (const value of Object.values(catalog.preview.paper)) {
        expect(value.trim(), language).not.toBe('');
        expect(value, language).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('are translated (A4 is a technical name), and Arabic stays right-to-left text', () => {
    for (const language of ['de', 'fr', 'es', 'ar'] as const) {
      const p = catalogs[language].preview.paper;
      expect(p.label, language).not.toBe(en.preview.paper.label);
      expect(p.hint, language).not.toBe(en.preview.paper.hint);
      expect(p.a4).toBe('A4');
    }
    expect(de.preview.paper.letter).toBe('US-Letter');
    expect(fr.preview.paper.letter).toBe('Lettre US');
    expect(es.preview.paper.letter).toBe('Carta');
    expect(ar.preview.paper.label).toMatch(/[؀-ۿ]/);
    expect(ar.preview.paper.hint).toMatch(/[؀-ۿ]/);
    expect(ar.preview.paper.letter).toMatch(/[؀-ۿ]/);
  });
});

// --- real PDF page dimensions (Chromium + pdf.js) ---

const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

describe.skipIf(!existsSync(CHROMIUM))('PDF page dimensions in a real engine', () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: CHROMIUM });
    page = await browser.newPage();
    await page.emulateMedia({ media: 'print' });
  }, 30_000);
  afterAll(async () => {
    await browser?.close();
  });

  it('every template: Letter pages are 612 × 792 pt and A4 pages 595.28 × 841.89 pt (within 0.5 pt: Chromium rounds 210 × 297 mm to whole CSS pixels), every page', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    for (const template of TEMPLATES) {
      for (const paper of SIZES) {
        await page.setContent(pdfHtml(stored({ templateId: template.id, accent: template.defaultAccent }), paper));
        const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
        const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
        expect(doc.numPages, `${template.id} ${paper}`).toBeGreaterThanOrEqual(1);
        for (let n = 1; n <= doc.numPages; n++) {
          const [x0, y0, x1, y1] = (await doc.getPage(n)).view;
          const [width, height] = [x1 - x0, y1 - y0];
          const expected = paper === 'letter' ? { width: 612, height: 792 } : { width: 595.28, height: 841.89 };
          expect(Math.abs(width - expected.width), `${template.id} ${paper} p${n} width ${width}`).toBeLessThan(0.5);
          expect(Math.abs(height - expected.height), `${template.id} ${paper} p${n} height ${height}`).toBeLessThan(0.5);
        }
      }
    }
  }, 180_000);

  it('the on-device print call (width and height in points) produces the same sizes', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    for (const paper of SIZES) {
      const { width, height } = PAPER_POINTS[paper];
      await page.setContent(pdfHtml(stored(), paper));
      const pdf = await page.pdf({ width: `${width / 72}in`, height: `${height / 72}in`, margin: { top: '0.75in', bottom: '0.75in', left: '0.75in', right: '0.75in' }, printBackground: true });
      const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
      const [x0, y0, x1, y1] = (await doc.getPage(1)).view;
      expect(Math.abs(x1 - x0 - (paper === 'letter' ? 612 : 595.28))).toBeLessThan(0.5);
      expect(Math.abs(y1 - y0 - (paper === 'letter' ? 792 : 841.89))).toBeLessThan(0.5);
    }
  }, 60_000);
});

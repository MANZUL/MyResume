import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { asciiOnly, buildPdfjsSource, OUTPUT } from '../../scripts/pdfjs-source.mjs';
import { WATERMARK_TILE_URL } from '../domain/render/render-html';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import type { StoredResume } from '../domain/resume/types';
import { MemoryEntitlementCacheStore } from '../services/entitlement/cache-store';
import { EntitlementService } from '../services/entitlement/entitlement-service';
import { FakeStoreProvider } from '../services/entitlement/fake-store';
import { PremiumGate } from '../services/entitlement/premium-gate';
import { ExportService } from '../services/export/export-service';
import { createFileExportPlatform, pdfHtml, type ExportFileSystem, type FileRef } from '../services/export/file-export-platform';
import { RasterizerBridge, RasterizerError, type RasterizerHostPort } from '../services/export/rasterizer/rasterizer-bridge';
import { loadRasterizerHtml, RASTER_LIMITS, RASTERIZER_CSP } from '../services/export/rasterizer/rasterizer-page';

const T = 1_700_000_000_000;
const PNG = 'iVBORw0KGgoAAAANSUhEUg';

// --- bridge protocol (no browser) ---

function bridgeWorld(timeoutMs = 1_000) {
  const bridge = new RasterizerBridge({ timeoutMs, newId: () => 'job-1' });
  const scripts: string[] = [];
  const port: RasterizerHostPort = { run: (script) => void scripts.push(script) };
  const send = (message: object) => bridge.handleMessage(JSON.stringify(message));
  const page = (index: number, extra: object = {}) => ({ type: 'page', id: 'job-1', index, count: 2, width: 1836, height: 2376, png: PNG, ...extra });
  return { bridge, scripts, port, send, page };
}

describe('rasterizer bridge', () => {
  it('asks the host to mount, waits for the page to be ready, then sends one job with the limits', async () => {
    const w = bridgeWorld();
    const seen: boolean[] = [];
    w.bridge.subscribe(() => seen.push(w.bridge.active));
    const result = w.bridge.rasterize('JVBERi0=');
    expect(w.bridge.active).toBe(true);
    w.bridge.attach(w.port);
    expect(w.scripts).toEqual([]); // not before "ready"
    w.send({ type: 'ready' });
    expect(w.scripts).toHaveLength(1);
    expect(w.scripts[0]).toBe(
      `window.__rasterize(${JSON.stringify({ id: 'job-1', pdfBase64: 'JVBERi0=', ...RASTER_LIMITS })});true;`,
    );
    w.send(w.page(0));
    w.send(w.page(1));
    w.send({ type: 'done', id: 'job-1', count: 2 });
    expect((await result).map((p) => p.index)).toEqual([0, 1]);
    expect(w.bridge.active).toBe(false); // the host unmounts the WebView
    expect(seen).toEqual([true, false]);
  });

  it('ignores malformed, foreign and stale messages', async () => {
    const w = bridgeWorld();
    const result = w.bridge.rasterize('JVBERi0=');
    w.bridge.attach(w.port);
    w.send({ type: 'ready' });
    w.bridge.handleMessage('{not json');
    w.bridge.handleMessage(42);
    w.send({ ...w.page(0), id: 'other-job' });
    w.send({ type: 'done', id: 'other-job', count: 0 });
    w.send(w.page(0));
    w.send(w.page(1));
    w.send({ type: 'done', id: 'job-1', count: 2 });
    expect(await result).toHaveLength(2);
  });

  for (const [label, bad] of [
    ['out of order', { index: 1 }],
    ['not a PNG', { png: 'R0lGODlhAQABAAAAACw=' }],
    ['oversized', { width: 5000 }],
    ['too many pages', { count: 11 }],
    ['non-integer size', { height: 10.5 }],
  ] as const) {
    it(`fails the job on an invalid page (${label})`, async () => {
      const w = bridgeWorld();
      const result = w.bridge.rasterize('JVBERi0=');
      w.bridge.attach(w.port);
      w.send({ type: 'ready' });
      w.send(w.page(0, bad));
      await expect(result).rejects.toEqual(new RasterizerError('invalid_page'));
      expect(w.bridge.active).toBe(false);
    });
  }

  it('fails on a page-count mismatch, a page error, a timeout, a lost host, and when busy', async () => {
    const a = bridgeWorld();
    const mismatch = a.bridge.rasterize('JVBERi0=');
    a.bridge.attach(a.port);
    a.send({ type: 'ready' });
    a.send(a.page(0));
    a.send({ type: 'done', id: 'job-1', count: 2 });
    await expect(mismatch).rejects.toEqual(new RasterizerError('page_count_mismatch'));

    const b = bridgeWorld();
    const failed = b.bridge.rasterize('JVBERi0=');
    b.bridge.attach(b.port);
    b.send({ type: 'ready' });
    b.send({ type: 'error', id: 'job-1', message: 'page_limit:12' });
    await expect(failed).rejects.toEqual(new RasterizerError('page_limit:12'));

    const c = bridgeWorld(20);
    await expect(c.bridge.rasterize('JVBERi0=')).rejects.toEqual(new RasterizerError('timeout')); // no host ever mounted

    const d = bridgeWorld();
    const gone = d.bridge.rasterize('JVBERi0=');
    d.bridge.attach(d.port);
    d.send({ type: 'ready' });
    d.bridge.detach();
    await expect(gone).rejects.toEqual(new RasterizerError('host_gone'));

    const e = bridgeWorld();
    const first = e.bridge.rasterize('JVBERi0=');
    await expect(e.bridge.rasterize('JVBERi0=')).rejects.toEqual(new RasterizerError('busy'));
    e.bridge.fail('webview_terminated');
    await expect(first).rejects.toEqual(new RasterizerError('webview_terminated'));
    await expect(e.bridge.rasterize('')).rejects.toEqual(new RasterizerError('empty_pdf'));
  });
});

describe('rasterizer bridge: a failing host never leaves a job stuck', () => {
  it('a host that throws while mounting fails the job, and the next export can run', async () => {
    const w = bridgeWorld();
    const unsubscribe = w.bridge.subscribe(() => {
      if (w.bridge.active) throw new Error('mount failed');
    });
    const first = w.bridge.rasterize('JVBERi0=');
    unsubscribe();
    // A throwing listener is isolated, so the job waits for a host (and times out) instead of wedging.
    w.bridge.fail('page_unavailable');
    await expect(first).rejects.toEqual(new RasterizerError('page_unavailable'));
    expect(w.bridge.active).toBe(false);
    const second = w.bridge.rasterize('JVBERi0=');
    w.bridge.attach(w.port);
    w.send({ type: 'ready' });
    w.send({ ...w.page(0), count: 1 });
    w.send({ type: 'done', id: 'job-1', count: 1 });
    expect(await second).toHaveLength(1);
  });
});

// --- bundled pdf.js ---

describe('bundled pdf.js page', () => {
  it('the generated source is exactly what the generator builds from the installed pdfjs-dist', () => {
    expect(readFileSync(OUTPUT, 'utf8')).toBe(buildPdfjsSource());
  });

  it('is pure ASCII (so Hermes keeps it at one byte per character)', () => {
    expect(/[^\x00-\x7f]/.test(readFileSync(OUTPUT, 'utf8'))).toBe(false);
    expect(asciiOnly('a©b\u{1F600}')).toBe('a\\u00a9b\\ud83d\\ude00');
  });

  it('is offline: the page policy allows no network, frames, workers or remote scripts', async () => {
    const html = await loadRasterizerHtml();
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${RASTERIZER_CSP}">`);
    for (const directive of ["default-src 'none'", "connect-src 'none'", "worker-src 'none'", "frame-src 'none'"]) {
      expect(RASTERIZER_CSP).toContain(directive);
    }
    expect(html).not.toMatch(/<script[^>]+src=/);
  });
});

// --- end to end in a real engine: ExportService → shared renderer → PDF → pdf.js → PNG ---

const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

class BinaryFs implements ExportFileSystem {
  files = new Map<string, Buffer>();
  prepareFile(artifactId: string, name: string): FileRef {
    return { uri: `mem://cache/exports/${artifactId}/${name}` };
  }
  writeBase64(file: FileRef, base64: string) {
    this.files.set(file.uri, Buffer.from(base64, 'base64'));
  }
  async readBase64(uri: string) {
    const content = this.files.get(uri);
    if (!content) throw new Error('missing');
    return content.toString('base64');
  }
  async moveInto(source: string, target: FileRef) {
    this.files.set(target.uri, this.files.get(source)!);
    this.files.delete(source);
  }
  deleteUri(uri: string) {
    this.files.delete(uri);
  }
  deleteArtifactDir(id: string) {
    for (const uri of [...this.files.keys()]) if (uri.includes(`/exports/${id}/`)) this.files.delete(uri);
  }
  exists(file: FileRef) {
    return this.files.has(file.uri);
  }
  purge() {
    for (const uri of [...this.files.keys()]) if (uri.includes('/exports/')) this.files.delete(uri);
  }
}

const pngSize = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

const stored = (overrides: Partial<StoredResume> = {}): StoredResume => ({
  id: 'r1', title: 'Mine', templateId: 'corporate-boardroom', accent: '#1B2B47', data: SAMPLE_RESUME, createdAt: 1, updatedAt: 1, ...overrides,
});

describe.skipIf(!existsSync(CHROMIUM))('image export end to end (Chromium stands in for expo-print and the WebView)', () => {
  let browser: Browser;
  let printer: Page;
  let host: Page;
  let decoder: Page;
  const external: string[] = [];
  const bridge = new RasterizerBridge({ timeoutMs: 30_000 });
  const fs = new BinaryFs();
  const printed: Buffer[] = [];
  const shared: { uri: string; mimeType: string }[] = [];
  let service: ExportService;

  /** Prints like expo-print: the given HTML at the given page size and margins. */
  async function printToFile({ html, width, height, marginPt }: { html: string; width: number; height: number; marginPt: number }) {
    await printer.setContent(html, { waitUntil: 'load' });
    const margin = `${marginPt / 72}in`;
    const pdf = await printer.pdf({ width: `${width / 72}in`, height: `${height / 72}in`, margin: { top: margin, bottom: margin, left: margin, right: margin }, printBackground: true });
    printed.push(pdf);
    const uri = `mem://tmp/print-${printed.length}.pdf`;
    fs.files.set(uri, pdf);
    return { uri };
  }

  /** Samples pixels of a PNG: the average color of a small box, and the share of near-white pixels in a region. */
  function inspect(png: Buffer, probes: { box?: [number, number, number, number]; region?: [number, number, number, number] }[]) {
    return decoder.evaluate(
      async ([data, list]) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return list.map(({ box, region }) => {
          const [x, y, w, h] = (box ?? region)!;
          const px = ctx.getImageData(x, y, w, h).data;
          let r = 0, g = 0, b = 0, white = 0, dark = 0;
          const n = px.length / 4;
          for (let i = 0; i < px.length; i += 4) {
            r += px[i]; g += px[i + 1]; b += px[i + 2];
            if (px[i] > 245 && px[i + 1] > 245 && px[i + 2] > 245) white++;
            if (px[i] < 100 && px[i + 1] < 100 && px[i + 2] < 100) dark++;
          }
          return { avg: [r / n, g / n, b / n].map(Math.round), white: white / n, dark: dark / n };
        });
      },
      [png.toString('base64'), probes] as const,
    );
  }

  const pngsOf = (from: number) => shared.slice(from).map((s) => fs.files.get(s.uri)!);

  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: CHROMIUM });
    const context = await browser.newContext();
    context.on('request', (request) => {
      if (!/^(about:|data:|blob:)/.test(request.url())) external.push(request.url());
    });
    printer = await context.newPage();
    await printer.emulateMedia({ media: 'print' });
    decoder = await context.newPage();
    host = await context.newPage();
    await host.goto('about:blank');
    await host.exposeFunction('__toApp', (message: string) => bridge.handleMessage(message));
    await host.evaluate(() => {
      (window as unknown as { ReactNativeWebView: object }).ReactNativeWebView = {
        postMessage: (message: string) => (window as unknown as { __toApp: (m: string) => void }).__toApp(message),
      };
    });
    // Emulates RasterizerHost: load the page while a job runs.
    const page = await loadRasterizerHtml();
    let attached = false;
    bridge.subscribe(() => {
      if (bridge.active && !attached) {
        attached = true;
        bridge.attach({ run: (script) => void host.evaluate(script) });
        void host.setContent(page);
      } else if (!bridge.active && attached) {
        attached = false;
        bridge.detach();
      }
    });

    const store = new FakeStoreProvider({ storeNow: () => T });
    store.setSubscription('active', T + 86_400_000);
    const gate = new PremiumGate(new EntitlementService(store, new MemoryEntitlementCacheStore(), () => T));
    const platform = createFileExportPlatform({
      fs,
      print: { printToFile },
      rasterizer: bridge,
      share: {
        isAvailable: async () => true,
        share: async (uri, { mimeType }) => {
          shared.push({ uri, mimeType });
          return 'unknown';
        },
      },
    });
    service = new ExportService(gate, platform, { now: () => T });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('Boardroom, Letter: one 216 dpi PNG per PDF page, exactly the export PDF', async () => {
    const from = shared.length;
    await service.exportImage(stored());
    const pdf = printed.at(-1)!;
    expect(pdf.toString('latin1', 0, 5)).toBe('%PDF-');
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
    const pngs = pngsOf(from);
    expect(pngs.length).toBe(pages);
    expect(pngs.length).toBeGreaterThanOrEqual(2);
    for (const png of pngs) {
      expect(png.subarray(0, 8).toString('base64')).toBe('iVBORw0KGgo=');
      expect(pngSize(png)).toEqual({ width: 612 * 3, height: 792 * 3 });
    }
    expect(shared.slice(from).map((s) => s.uri.split('/').pop())).toEqual(pngs.map((_, i) => `eleanor_vance_page-${i + 1}.png`));
    expect(shared.slice(from).every((s) => s.mimeType === 'image/png')).toBe(true);
    expect([...fs.files.keys()].filter((uri) => uri.startsWith('mem://tmp/'))).toEqual([]); // intermediate PDF removed
  }, 60_000);

  it('keeps the design: the quarter-circle in the accent color, the name drawn in the header, clean margins', async () => {
    const from = shared.length;
    await service.exportImage(stored());
    const [page1] = pngsOf(from);
    const s = 3; // px per pt
    const [mark, name, margin] = await inspect(page1, [
      { box: [(612 - 54 - 8) * s, (54 + 2) * s, 12, 12] }, // inside the quarter-circle (top-right of the content box)
      { region: [150 * s, 60 * s, 312 * s, 30 * s] }, // the name line
      { region: [0, 0, 612 * s, 40 * s] }, // top page margin
    ]);
    const accent = [0x1b, 0x2b, 0x47];
    mark.avg.forEach((v, i) => expect(Math.abs(v - accent[i])).toBeLessThanOrEqual(12));
    expect(name.dark).toBeGreaterThan(0.05);
    expect(margin.white).toBe(1);
  }, 60_000);

  it('Editorial keeps its top rule in its own accent; Foreman its quarter-circle', async () => {
    let from = shared.length;
    await service.exportImage(stored({ templateId: 'creative-editorial', accent: '#A85432' }));
    const [rule] = await inspect(pngsOf(from)[0], [{ box: [300 * 3, (54 + 2) * 3, 30, 8] }]);
    [0xa8, 0x54, 0x32].forEach((v, i) => expect(Math.abs(rule.avg[i] - v)).toBeLessThanOrEqual(12));
    from = shared.length;
    await service.exportImage(stored({ templateId: 'trades-foreman', accent: '#2D2D2D' }));
    const [mark] = await inspect(pngsOf(from)[0], [{ box: [(612 - 54 - 8) * 3, (54 + 2) * 3, 12, 12] }]);
    [0x2d, 0x2d, 0x2d].forEach((v, i) => expect(Math.abs(mark.avg[i] - v)).toBeLessThanOrEqual(12));
  }, 60_000);

  it('has the resume content and no PREVIEW watermark (text of the rasterized PDF, and pixels)', async () => {
    const from = shared.length;
    await service.exportImage(stored());
    const text = await host.evaluate(async (base64) => {
      const lib = (globalThis as unknown as { pdfjsLib: { getDocument: (o: object) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str: string }[] }> }> }> } } }).pdfjsLib;
      const doc = await lib.getDocument({ data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)), isEvalSupported: false }).promise;
      let all = '';
      for (let n = 1; n <= doc.numPages; n++) all += (await (await doc.getPage(n)).getTextContent()).items.map((i) => i.str).join(' ') + '\n';
      return all;
    }, printed.at(-1)!.toString('base64'));
    expect(text.replace(/\s+/g, '')).toMatch(/ELEANORVANCE/i); // letter-spaced in the template
    expect(text).toContain('eleanor.vance@example.com');
    const order = ['Summary', 'Experience', 'Education', 'Certifications', 'Projects', 'Awards'].map((h) => text.search(new RegExp(`\\b${h}\\b`, 'i')));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).not.toMatch(/PREVIEW/i);

    // Pixels: the empty lower part of the last page is pure white (a watermark would tint it).
    const last = pngsOf(from).at(-1)!;
    const [empty] = await inspect(last, [{ region: [54 * 3, 560 * 3, 504 * 3, 170 * 3] }]);
    expect(empty.white).toBe(1);
  }, 60_000);

  it('the pixel check does detect a watermark (positive control)', async () => {
    const html = pdfHtml(stored(), 'letter').replace(
      '</body>',
      `<div style="position:fixed;inset:0;background-image:url(&quot;${WATERMARK_TILE_URL}&quot;);background-size:300px 190px"></div></body>`,
    );
    const { uri } = await printToFile({ html, width: 612, height: 792, marginPt: 54 });
    const pages = await bridge.rasterize(await fs.readBase64(uri));
    fs.deleteUri(uri);
    const [empty] = await inspect(Buffer.from(pages.at(-1)!.pngBase64, 'base64'), [{ region: [54 * 3, 560 * 3, 504 * 3, 170 * 3] }]);
    expect(empty.white).toBeLessThan(0.99);
  }, 60_000);

  it('A4: the longest side is capped at 2400 px', async () => {
    const from = shared.length;
    await service.exportImage(stored(), 'a4');
    for (const png of pngsOf(from)) {
      const { width, height } = pngSize(png);
      expect(height).toBe(RASTER_LIMITS.maxSidePx);
      expect(width).toBeGreaterThanOrEqual(1690);
      expect(width).toBeLessThanOrEqual(1700);
    }
  }, 60_000);

  it('refuses a PDF over the page cap', async () => {
    const { uri } = await printToFile({ html: pdfHtml(stored(), 'letter'), width: 612, height: 792, marginPt: 54 });
    await expect(bridge.rasterize(await fs.readBase64(uri), { maxPages: 1 })).rejects.toEqual(new RasterizerError('page_limit:2'));
    fs.deleteUri(uri);
    expect(bridge.active).toBe(false);
  }, 60_000);

  it('makes no network request, and the page cannot make one', async () => {
    await host.setContent(await loadRasterizerHtml());
    const attempt = await host.evaluate(() =>
      fetch('https://example.com/steal').then(
        () => 'sent',
        () => 'blocked',
      ),
    );
    expect(attempt).toBe('blocked');
    expect(external).toEqual([]);
  }, 60_000);
});

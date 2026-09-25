import JSZip from 'jszip';
import { beforeEach, describe, expect, it } from 'vitest';
import { PremiumRequiredError } from '../domain/entitlement/features';
import type { ExportRecord, NewExportRecord } from '../domain/export/export-record';
import type { ExportRecordRepository } from '../domain/ports/repositories';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import type { StoredResume } from '../domain/resume/types';
import { MemoryEntitlementCacheStore } from '../services/entitlement/cache-store';
import { EntitlementService } from '../services/entitlement/entitlement-service';
import { FakeStoreProvider } from '../services/entitlement/fake-store';
import { PaywallCoordinator } from '../services/entitlement/paywall';
import { PremiumGate } from '../services/entitlement/premium-gate';
import {
  ExportCancelledError,
  ExportHandleInvalidError,
  ExportInProgressError,
  ExportInterruptedError,
  ExportService,
  type ExportHandle,
  type ShareResult,
} from '../services/export/export-service';
import {
  createFileExportPlatform,
  DOCX_MIME,
  pdfHtml,
  PNG_MIME,
  type ExportFileSystem,
  type FileRef,
  type PrintAdapter,
  type ShareAdapter,
} from '../services/export/file-export-platform';
import { RasterizerError, type RasterPage, type Rasterizer } from '../services/export/rasterizer/rasterizer-bridge';
import { renderResumeHtml } from '../domain/render/render-html';

const T = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

// --- in-memory device doubles ---

class MemoryFs implements ExportFileSystem {
  files = new Map<string, string>();
  fail: { prepare?: Error; write?: Error; move?: Error } = {};
  prepareFile(artifactId: string, name: string): FileRef {
    if (this.fail.prepare) throw this.fail.prepare;
    return { uri: `mem://cache/exports/${artifactId}/${name}` };
  }
  writeBase64(file: FileRef, base64: string) {
    if (this.fail.write) {
      this.files.set(file.uri, 'PARTIAL'); // a partial file, as a full disk would leave
      throw this.fail.write;
    }
    this.files.set(file.uri, base64);
  }
  async readBase64(uri: string) {
    const content = this.files.get(uri);
    if (content === undefined) throw new Error('source missing');
    return Buffer.from(content).toString('base64');
  }
  async moveInto(sourceUri: string, target: FileRef) {
    if (this.fail.move) throw this.fail.move;
    const content = this.files.get(sourceUri);
    if (content === undefined) throw new Error('source missing');
    this.files.set(target.uri, content);
    this.files.delete(sourceUri);
  }
  deleteUri(uri: string) {
    this.files.delete(uri);
  }
  deleteArtifactDir(artifactId: string) {
    for (const uri of [...this.files.keys()]) if (uri.startsWith(`mem://cache/exports/${artifactId}/`)) this.files.delete(uri);
  }
  exists(file: FileRef) {
    return this.files.has(file.uri);
  }
  purge() {
    for (const uri of [...this.files.keys()]) if (uri.startsWith('mem://cache/exports/')) this.files.delete(uri);
  }
  exportFiles() {
    return [...this.files.keys()].filter((uri) => uri.startsWith('mem://cache/exports/'));
  }
  tempFiles() {
    return [...this.files.keys()].filter((uri) => uri.startsWith('mem://tmp/'));
  }
}

class FakePrint implements PrintAdapter {
  calls: { html: string; width: number; height: number; marginPt: number }[] = [];
  fail: Error | null = null;
  constructor(private readonly fs: MemoryFs) {}
  async printToFile(options: { html: string; width: number; height: number; marginPt: number }) {
    this.calls.push(options);
    if (this.fail) throw this.fail;
    const uri = `mem://tmp/print-${this.calls.length}.pdf`;
    this.fs.files.set(uri, `%PDF-fake ${options.width}x${options.height}`);
    return { uri };
  }
}

class FakeShare implements ShareAdapter {
  shared: { uri: string; mimeType: string }[] = [];
  result: ShareResult = 'unknown';
  fail: Error | null = null;
  available = true;
  onShare: (() => void) | null = null;
  async isAvailable() {
    return this.available;
  }
  async share(uri: string, options: { mimeType: string }) {
    this.onShare?.();
    if (this.fail) throw this.fail;
    this.shared.push({ uri, mimeType: options.mimeType });
    return this.result;
  }
}

/** Stands in for the pdf.js WebView: records the PDF it was given and returns N fake PNG pages. */
class FakeRasterizer implements Rasterizer {
  inputs: string[] = [];
  pageCount = 2;
  fail: Error | null = null;
  async rasterize(pdfBase64: string): Promise<RasterPage[]> {
    this.inputs.push(Buffer.from(pdfBase64, 'base64').toString());
    if (this.fail) throw this.fail;
    return Array.from({ length: this.pageCount }, (_, index) => ({
      index,
      width: 1836,
      height: 2376,
      pngBase64: `iVBORw0KGgo-page-${index + 1}`,
    }));
  }
}

class MemoryRecords implements ExportRecordRepository {
  added: NewExportRecord[] = [];
  reads = 0;
  constructor(private readonly seed: ExportRecord[] = []) {}
  async add(record: NewExportRecord) {
    this.added.push(record);
    return { ...record, id: `rec-${this.added.length}`, createdAt: T };
  }
  async listRecent() {
    this.reads += 1;
    return this.seed;
  }
  async listForResume() {
    this.reads += 1;
    return this.seed;
  }
}

function setup(options: { premium?: boolean; seedRecords?: ExportRecord[] } = {}) {
  const clock = { now: T };
  const store = new FakeStoreProvider({ storeNow: () => clock.now });
  if (options.premium ?? true) store.setSubscription('active', T + 30 * DAY);
  const entitlements = new EntitlementService(store, new MemoryEntitlementCacheStore(), () => clock.now);
  const gate = new PremiumGate(entitlements);
  const fs = new MemoryFs();
  const print = new FakePrint(fs);
  const share = new FakeShare();
  const rasterizer = new FakeRasterizer();
  const platform = createFileExportPlatform({ fs, print, share, rasterizer });
  const records = new MemoryRecords(options.seedRecords);
  const foreground = { value: true };
  const service = new ExportService(gate, platform, {
    records,
    isForeground: () => foreground.value,
    now: () => clock.now,
    handleLifetimeMs: 60_000,
  });
  const paywall = new PaywallCoordinator(entitlements);
  return { clock, store, entitlements, gate, fs, print, share, rasterizer, platform, records, foreground, service, paywall };
}

const resume = (overrides: Partial<StoredResume> = {}): StoredResume => ({
  id: 'r1', title: 'Mine', templateId: 'corporate-boardroom', accent: '#1B2B47', data: SAMPLE_RESUME, createdAt: 1, updatedAt: 1, ...overrides,
});

const outcomes = (records: MemoryRecords) => records.added.map((r) => `${r.exportType}:${r.outcome}`);

async function readDocx(base64: string) {
  const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'));
  const text: Record<string, string> = {};
  for (const name of Object.keys(zip.files)) if (!zip.files[name].dir) text[name] = await zip.files[name].async('string');
  return text;
}

// --- tests ---

describe('FREE users', () => {
  it('are refused before anything is rendered, written or shared; the denial is recorded', async () => {
    const w = setup({ premium: false });
    await expect(w.service.exportPdf(resume())).rejects.toBeInstanceOf(PremiumRequiredError);
    await expect(w.service.exportDocx(resume())).rejects.toBeInstanceOf(PremiumRequiredError);
    await expect(w.service.prepare(resume(), { format: 'pdf' })).rejects.toBeInstanceOf(PremiumRequiredError);
    expect(w.print.calls).toHaveLength(0);
    expect(w.fs.files.size).toBe(0);
    expect(w.share.shared).toHaveLength(0);
    expect(outcomes(w.records)).toEqual(['pdf:denied', 'docx:denied', 'pdf:denied']);
    expect(w.records.added.every((r) => r.accessReason === 'not_premium')).toBe(true);
  });

  it('a history of successful exports is never treated as proof of entitlement', async () => {
    const past: ExportRecord = {
      id: 'old', resumeId: 'r1', templateId: 'corporate-boardroom', exportType: 'pdf', outcome: 'succeeded',
      accessReason: 'verified', errorMessage: null, createdAt: T - DAY,
    };
    const w = setup({ premium: false, seedRecords: [past, past] });
    await expect(w.service.exportPdf(resume())).rejects.toBeInstanceOf(PremiumRequiredError);
    expect(w.records.reads).toBe(0);
  });
});

describe('PREMIUM PDF', () => {
  it('Letter: renders the shared renderer in PDF mode at 612×792 pt, clean, then shares the private file', async () => {
    const w = setup();
    await w.service.exportPdf(resume(), 'letter');
    expect(w.print.calls).toHaveLength(1);
    const call = w.print.calls[0];
    expect({ width: call.width, height: call.height, marginPt: call.marginPt }).toEqual({ width: 612, height: 792, marginPt: 54 });
    expect(call.html).toContain('size: letter');
    expect(call.html).toContain('Eleanor Vance');
    expect(call.html).not.toContain('class="watermark"');
    expect(call.html).not.toContain('PREVIEW');
    expect(w.share.shared).toHaveLength(1);
    expect(w.share.shared[0].mimeType).toBe('application/pdf');
    expect(w.share.shared[0].uri).toMatch(/^mem:\/\/cache\/exports\/[^/]+\/eleanor_vance\.pdf$/);
    expect(w.fs.tempFiles()).toEqual([]); // print temp file was moved, not copied
    expect(outcomes(w.records)).toEqual(['pdf:succeeded']);
    expect(w.records.added[0].accessReason).toBe('verified');
  });

  it('A4: 595×842 pt and an A4 page rule', async () => {
    const w = setup();
    await w.service.exportPdf(resume(), 'a4');
    expect(w.print.calls[0]).toMatchObject({ width: 595, height: 842 });
    expect(w.print.calls[0].html).toContain('size: A4');
  });

  it('defaults to Letter', async () => {
    const w = setup();
    await w.service.exportPdf(resume());
    expect(w.print.calls[0]).toMatchObject({ width: 612, height: 792 });
  });

  it('preserves the approved template rendering (same renderer as the preview, minus the watermark)', async () => {
    const w = setup();
    for (const templateId of ['corporate-boardroom', 'tech-architect', 'creative-editorial']) {
      await w.service.exportPdf(resume({ templateId, accent: '#0F766E' }));
    }
    const htmls = w.print.calls.map((c) => c.html);
    expect(htmls[0]).toContain('mark-qc'); // boardroom quarter-circle mark
    expect(htmls[1]).toContain('class="pill"'); // architect pills
    expect(htmls[2]).toContain('mark-rule'); // editorial rule
    for (const html of htmls) expect(html).toContain('--accent: #0F766E');
  });

  it('shared files stay private until the launch purge, which removes them', async () => {
    const w = setup();
    await w.service.exportPdf(resume());
    expect(w.fs.exportFiles()).toHaveLength(1);
    w.platform.purgeAll();
    expect(w.fs.exportFiles()).toEqual([]);
  });
});

describe('PREMIUM DOCX', () => {
  it('is a valid Word file with the resume content, template mapping, product metadata and no watermark', async () => {
    const w = setup();
    await w.service.exportDocx(resume());
    expect(w.share.shared[0].mimeType).toBe(DOCX_MIME);
    expect(w.share.shared[0].uri).toMatch(/eleanor_vance\.docx$/);
    const base64 = w.fs.files.get(w.share.shared[0].uri)!;
    expect(Buffer.from(base64, 'base64').subarray(0, 4).toString('hex')).toBe('504b0304');

    const parts = await readDocx(base64);
    expect(Object.keys(parts)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'word/document.xml', 'docProps/core.xml']));
    const doc = parts['word/document.xml'];
    for (const text of ['ELEANOR VANCE', 'Director of Product', 'Acme Innovation Labs', 'Master of Business Administration', 'Certified Scrum Professional', 'Project Horizon', 'Forbes 30 Under 30']) {
      expect(doc, text).toContain(text);
    }
    expect(doc).toContain('1B2B47'); // accent color on section headings
    const core = parts['docProps/core.xml'];
    expect(core).toContain('<dc:creator>My Resume</dc:creator>');
    expect(core).toContain('Eleanor Vance — The Boardroom');
    for (const [name, xml] of Object.entries(parts)) expect(xml, name).not.toMatch(/PREVIEW/);
  });

  it('maps a different template and accent into the document', async () => {
    const w = setup();
    await w.service.exportDocx(resume({ templateId: 'tech-builder', accent: '#E63946' }));
    const parts = await readDocx(w.fs.files.get(w.share.shared[0].uri)!);
    expect(parts['docProps/core.xml']).toContain('Eleanor Vance — The Builder');
    expect(parts['word/document.xml']).toContain('E63946');
  });
});

describe('the two entitlement checks', () => {
  it('each export verifies before generation and again before sharing', async () => {
    const w = setup();
    const before = w.store.calls.verify;
    await w.service.exportPdf(resume());
    expect(w.store.calls.verify - before).toBe(2);
  });

  it('check #1 fails → nothing generated', async () => {
    const w = setup({ premium: false });
    await expect(w.service.exportPdf(resume())).rejects.toBeInstanceOf(PremiumRequiredError);
    expect(w.print.calls).toHaveLength(0);
  });

  it('entitlement lost between the checks (refund) → not shared, artifact deleted, denial recorded', async () => {
    const w = setup();
    const handle = await w.service.prepare(resume(), { format: 'pdf' });
    expect(w.fs.exportFiles()).toHaveLength(1);
    w.store.refund();
    await expect(w.service.share(handle)).rejects.toEqual(new PremiumRequiredError('export.share'));
    expect(w.share.shared).toHaveLength(0);
    expect(w.fs.exportFiles()).toEqual([]);
    expect(outcomes(w.records)).toEqual(['pdf:denied']);
  });

  it('subscription expiry between generation and sharing → refused', async () => {
    const w = setup();
    w.store.setSubscription('active', T + 30_000);
    const handle = await w.service.prepare(resume(), { format: 'docx' });
    w.clock.now += 31_000;
    await expect(w.service.share(handle)).rejects.toBeInstanceOf(PremiumRequiredError);
    expect(w.fs.exportFiles()).toEqual([]);
  });

  it('a refused share opens the paywall through the existing flow, and a subscription resumes it', async () => {
    const w = setup({ premium: false });
    const opened: string[] = [];
    w.paywall.onRequest((feature) => opened.push(feature));
    const run = async (): Promise<void> => {
      try {
        await w.service.exportPdf(resume());
      } catch (error) {
        if (error instanceof PremiumRequiredError) w.paywall.request({ feature: error.feature, run });
        else throw error;
      }
    };
    await run();
    expect(opened).toEqual(['export.pdf']);
    const { outcome, resume: resumeAction } = await w.paywall.subscribe();
    expect(outcome).toBe('subscribed');
    await resumeAction!();
    expect(w.share.shared).toHaveLength(1);
    expect(outcomes(w.records)).toEqual(['pdf:denied', 'pdf:succeeded']);
  });
});

describe('artifact handles', () => {
  let w: ReturnType<typeof setup>;
  beforeEach(() => {
    w = setup();
  });

  it('are opaque: frozen, id + format only, no path', async () => {
    const handle = await w.service.prepare(resume(), { format: 'pdf', paper: 'a4' });
    expect(Object.isFrozen(handle)).toBe(true);
    expect(Object.keys(handle).sort()).toEqual(['format', 'id']);
    expect(JSON.stringify(handle)).not.toMatch(/mem:|exports|\/|\.pdf/);
  });

  it('work exactly once', async () => {
    const handle = await w.service.prepare(resume(), { format: 'pdf' });
    await w.service.share(handle);
    await expect(w.service.share(handle)).rejects.toBeInstanceOf(ExportHandleInvalidError);
    expect(w.share.shared).toHaveLength(1);
  });

  it('are invalid after discard, and discard deletes the file', async () => {
    const handle = await w.service.prepare(resume(), { format: 'docx' });
    await w.service.discard(handle);
    expect(w.fs.exportFiles()).toEqual([]);
    await expect(w.service.share(handle)).rejects.toBeInstanceOf(ExportHandleInvalidError);
  });

  it('are invalid after entitlement loss, even if premium comes back', async () => {
    const handle = await w.service.prepare(resume(), { format: 'pdf' });
    w.store.refund();
    await expect(w.service.share(handle)).rejects.toBeInstanceOf(PremiumRequiredError);
    w.store.setSubscription('active', T + 30 * DAY);
    await expect(w.service.share(handle)).rejects.toBeInstanceOf(ExportHandleInvalidError);
  });

  it('expire after their lifetime: file deleted, nothing shared', async () => {
    const handle = await w.service.prepare(resume(), { format: 'pdf' });
    w.clock.now += 60_001;
    await expect(w.service.share(handle)).rejects.toBeInstanceOf(ExportHandleInvalidError);
    expect(w.fs.exportFiles()).toEqual([]);
    expect(w.share.shared).toHaveLength(0);
  });

  it('cannot be forged or copied, and are not valid in another service instance', async () => {
    const handle = await w.service.prepare(resume(), { format: 'pdf' });
    const forged = { id: handle.id, format: handle.format } as ExportHandle;
    await expect(w.service.share(forged)).rejects.toBeInstanceOf(ExportHandleInvalidError);
    await expect(w.service.share({ ...handle })).rejects.toBeInstanceOf(ExportHandleInvalidError);
    const other = new ExportService(w.gate, w.platform);
    await expect(other.share(handle)).rejects.toBeInstanceOf(ExportHandleInvalidError);
    await w.service.share(handle); // the genuine handle still works once
    expect(w.share.shared).toHaveLength(1);
  });

  it('discardAll removes everything prepared but not shared', async () => {
    const a = await w.service.prepare(resume(), { format: 'pdf' });
    const b = await w.service.prepare(resume(), { format: 'docx' });
    await w.service.discardAll();
    expect(w.fs.exportFiles()).toEqual([]);
    await expect(w.service.share(a)).rejects.toBeInstanceOf(ExportHandleInvalidError);
    await expect(w.service.share(b)).rejects.toBeInstanceOf(ExportHandleInvalidError);
  });
});

describe('failure handling leaves no reusable paid artifact', () => {
  it('renderer / print failure', async () => {
    const w = setup();
    w.print.fail = new Error('WebView print failed');
    await expect(w.service.exportPdf(resume())).rejects.toThrow('WebView print failed');
    expect(w.fs.files.size).toBe(0);
    expect(outcomes(w.records)).toEqual(['pdf:failed']);
    expect(w.records.added[0].errorMessage).toBe('Error: WebView print failed');
  });

  it('DOCX generation failure (corrupt resume data)', async () => {
    const w = setup();
    const broken = resume({ data: { ...SAMPLE_RESUME, experience: null as never } });
    await expect(w.service.exportDocx(broken)).rejects.toThrow();
    expect(w.fs.files.size).toBe(0);
    expect(outcomes(w.records)).toEqual(['docx:failed']);
  });

  it('file system failure while moving the printed PDF removes the temp file too', async () => {
    const w = setup();
    w.fs.fail.move = new Error('EACCES');
    await expect(w.service.exportPdf(resume())).rejects.toThrow('EACCES');
    expect(w.fs.files.size).toBe(0);
  });

  it('insufficient storage while writing the DOCX removes the partial file', async () => {
    const w = setup();
    w.fs.fail.write = Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    await expect(w.service.exportDocx(resume())).rejects.toThrow('ENOSPC');
    expect(w.fs.files.size).toBe(0);
    expect(w.records.added[0].errorMessage).toMatch(/ENOSPC/);
  });

  it('share sheet failure or unavailability deletes the file and invalidates the handle', async () => {
    const w = setup();
    w.share.fail = new Error('share sheet crashed');
    const handle = await w.service.prepare(resume(), { format: 'pdf' });
    await expect(w.service.share(handle)).rejects.toThrow('share sheet crashed');
    expect(w.fs.exportFiles()).toEqual([]);
    await expect(w.service.share(handle)).rejects.toBeInstanceOf(ExportHandleInvalidError);
    w.share.fail = null;
    w.share.available = false;
    await expect(w.service.exportDocx(resume())).rejects.toThrow('not available');
    expect(w.fs.exportFiles()).toEqual([]);
  });

  it('cancelled share deletes the file and is recorded as not completed', async () => {
    const w = setup();
    w.share.result = 'dismissed';
    await expect(w.service.exportPdf(resume())).rejects.toBeInstanceOf(ExportCancelledError);
    expect(w.fs.exportFiles()).toEqual([]);
    expect(w.records.added[0]).toMatchObject({ outcome: 'failed', errorMessage: 'ExportCancelledError: Sharing was cancelled.' });
  });

  it('duplicate export attempts: the second is refused while the first runs; only one file is shared', async () => {
    const w = setup();
    const first = w.service.exportPdf(resume());
    await expect(w.service.exportPdf(resume())).rejects.toBeInstanceOf(ExportInProgressError);
    await expect(w.service.exportDocx(resume())).rejects.toBeInstanceOf(ExportInProgressError);
    await first;
    expect(w.share.shared).toHaveLength(1);
    await w.service.exportDocx(resume()); // free again afterwards
    expect(w.share.shared).toHaveLength(2);
  });

  it('app backgrounded during export: not shared, file deleted', async () => {
    const w = setup();
    const handle = await w.service.prepare(resume(), { format: 'pdf' });
    w.foreground.value = false;
    await expect(w.service.share(handle)).rejects.toBeInstanceOf(ExportInterruptedError);
    expect(w.share.shared).toHaveLength(0);
    expect(w.fs.exportFiles()).toEqual([]);
  });

  it('app terminated during export (simulated): handles die with the process; the launch purge removes the file', async () => {
    const w = setup();
    const handle = await w.service.prepare(resume(), { format: 'pdf' });
    expect(w.fs.exportFiles()).toHaveLength(1);
    // New process: new platform and service over the same disk.
    const platform = createFileExportPlatform({ fs: w.fs, print: w.print, share: w.share });
    const service = new ExportService(w.gate, platform);
    await expect(service.share(handle)).rejects.toBeInstanceOf(ExportHandleInvalidError);
    platform.purgeAll(); // what the app does at launch
    expect(w.fs.exportFiles()).toEqual([]);
  });
});

describe('security: bypass attempts all fail', () => {
  const claim = { premium: true, isPremium: true, unlocked: true, watermark: false } as never;

  it('passing "premium: true" anywhere changes nothing', async () => {
    const w = setup({ premium: false });
    const anyService = w.service as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    await expect(anyService.exportPdf(resume(), 'letter', claim)).rejects.toBeInstanceOf(PremiumRequiredError);
    await expect(anyService.exportDocx(resume(), claim)).rejects.toBeInstanceOf(PremiumRequiredError);
    await expect(anyService.prepare(resume(), { format: 'pdf', premium: true })).rejects.toBeInstanceOf(PremiumRequiredError);
    expect(w.print.calls).toHaveLength(0);
  });

  it('premium-looking fields inside the resume change nothing', async () => {
    const w = setup({ premium: false });
    const sneaky = { ...resume(), premium: true, entitlement: 'premium', data: { ...SAMPLE_RESUME, premium: true } } as StoredResume;
    await expect(w.service.exportPdf(sneaky)).rejects.toBeInstanceOf(PremiumRequiredError);
  });

  it('reusing an old handle after a later successful export fails', async () => {
    const w = setup();
    const old = await w.service.prepare(resume(), { format: 'pdf' });
    await w.service.share(old);
    await w.service.exportDocx(resume());
    await expect(w.service.share(old)).rejects.toBeInstanceOf(ExportHandleInvalidError);
  });

  it('sharing an artifact prepared while premium, after the subscription expired, fails', async () => {
    const w = setup();
    const handle = await w.service.prepare(resume(), { format: 'pdf' });
    w.store.setSubscription('expired', T - 1);
    await expect(w.service.share(handle)).rejects.toBeInstanceOf(PremiumRequiredError);
  });

  it('bypassing the paywall coordinator (running the pending action without subscribing) is still refused', async () => {
    const w = setup({ premium: false });
    let pending: (() => Promise<void>) | null = null;
    try {
      await w.service.exportPdf(resume());
    } catch (error) {
      if (error instanceof PremiumRequiredError) pending = () => w.service.exportPdf(resume());
    }
    w.paywall.request({ feature: 'export.pdf', run: pending! });
    await expect(pending!()).rejects.toBeInstanceOf(PremiumRequiredError); // called directly, no purchase
    w.store.setNextPurchaseResult({ kind: 'cancelled' });
    expect((await w.paywall.subscribe()).resume).toBeNull(); // cancelled purchase does not release it
    expect(w.share.shared).toHaveLength(0);
  });
});

describe('image export (PNG, step 6)', () => {
  const pngFiles = (w: ReturnType<typeof setup>) => w.fs.exportFiles().filter((uri) => uri.endsWith('.png'));

  it('FREE: refused before anything is printed or rasterized; denial recorded; paywall feature is export.image', async () => {
    const w = setup({ premium: false });
    await expect(w.service.exportImage(resume())).rejects.toEqual(new PremiumRequiredError('export.image'));
    expect(w.print.calls).toHaveLength(0);
    expect(w.rasterizer.inputs).toHaveLength(0);
    expect(w.fs.files.size).toBe(0);
    expect(outcomes(w.records)).toEqual(['png:denied']);
  });

  it('PREMIUM: one PNG per page from the export PDF, shared in page order from the private folder', async () => {
    const w = setup();
    await w.service.exportImage(resume());
    expect(w.rasterizer.inputs).toEqual(['%PDF-fake 612x792']); // exactly the printed PDF
    expect(w.share.shared.map((s) => s.uri.replace(/exports\/[^/]+\//, 'exports/<id>/'))).toEqual([
      'mem://cache/exports/<id>/eleanor_vance_page-1.png',
      'mem://cache/exports/<id>/eleanor_vance_page-2.png',
    ]);
    expect(w.share.shared.every((s) => s.mimeType === PNG_MIME)).toBe(true);
    expect(pngFiles(w).map((uri) => w.fs.files.get(uri))).toEqual(['iVBORw0KGgo-page-1', 'iVBORw0KGgo-page-2']);
    expect(w.fs.tempFiles()).toEqual([]); // the intermediate PDF is deleted
    expect(w.fs.exportFiles().some((uri) => uri.endsWith('.pdf'))).toBe(false); // and never becomes an artifact
    expect(outcomes(w.records)).toEqual(['png:succeeded']);
  });

  it('a one-page resume gives a single <Name>.png', async () => {
    const w = setup();
    w.rasterizer.pageCount = 1;
    await w.service.exportImage(resume());
    expect(w.share.shared).toHaveLength(1);
    expect(w.share.shared[0].uri).toMatch(/\/eleanor_vance\.png$/);
  });

  it('uses the shared rendering path: the exact PDF-mode HTML of the PDF export, Letter or A4, never watermarked', async () => {
    const w = setup();
    for (const paper of ['letter', 'a4'] as const) {
      await w.service.exportImage(resume(), paper);
      await w.service.exportPdf(resume(), paper);
    }
    const [imgLetter, pdfLetter, imgA4, pdfA4] = w.print.calls;
    expect(imgLetter).toEqual(pdfLetter);
    expect(imgA4).toEqual(pdfA4);
    expect(imgLetter).toMatchObject({ width: 612, height: 792, marginPt: 54 });
    expect(imgA4).toMatchObject({ width: 595, height: 842, marginPt: 54 });
    expect(imgLetter.html).toBe(pdfHtml(resume(), 'letter'));
    expect(imgLetter.html).toBe(
      renderResumeHtml(SAMPLE_RESUME, { templateId: 'corporate-boardroom', accent: '#1B2B47', mode: 'pdf', paper: 'letter' }),
    );
    for (const call of w.print.calls) {
      expect(call.html).not.toContain('class="watermark"');
      expect(call.html).not.toContain('PREVIEW');
    }
  });

  it('keeps the template, accent and resume content', async () => {
    const w = setup();
    await w.service.exportImage(resume({ templateId: 'creative-editorial', accent: '#0F766E' }));
    await w.service.exportImage(resume({ templateId: 'trades-foreman', accent: '#B45309', data: { ...SAMPLE_RESUME, name: 'Ada Lovelace' } }));
    const [editorial, foreman] = w.print.calls.map((c) => c.html);
    expect(editorial).toContain('mark-rule');
    expect(editorial).toContain('--accent: #0F766E');
    expect(foreman).toContain('mark-qc');
    expect(foreman).toContain('--accent: #B45309');
    expect(foreman).toContain('Ada Lovelace');
    for (const heading of ['Summary', 'Experience', 'Education']) expect(foreman).toContain(`>${heading}</h2>`);
    expect(w.share.shared.at(-1)!.uri).toMatch(/ada_lovelace_page-2\.png$/);
  });

  it('checks the entitlement before generation, before sharing, and again before every further page', async () => {
    const w = setup();
    const before = w.store.calls.verify;
    await w.service.exportImage(resume()); // 2 pages
    expect(w.store.calls.verify - before).toBe(3);
    w.rasterizer.pageCount = 1;
    const mid = w.store.calls.verify;
    await w.service.exportImage(resume());
    expect(w.store.calls.verify - mid).toBe(2);
  });

  it('entitlement lost before sharing → nothing shared, every page deleted, denial recorded', async () => {
    const w = setup();
    const handle = await w.service.prepare(resume(), { format: 'png' });
    expect(pngFiles(w)).toHaveLength(2);
    w.store.refund();
    await expect(w.service.share(handle)).rejects.toEqual(new PremiumRequiredError('export.share'));
    expect(w.share.shared).toHaveLength(0);
    expect(w.fs.exportFiles()).toEqual([]);
    expect(outcomes(w.records)).toEqual(['png:denied']);
    w.store.setSubscription('active', T + 30 * DAY);
    await expect(w.service.share(handle)).rejects.toBeInstanceOf(ExportHandleInvalidError);
  });

  it('entitlement lost between pages → the next page is not shared, files deleted, denial recorded, paywall error', async () => {
    const w = setup();
    w.share.onShare = () => {
      if (w.share.shared.length === 0) w.store.refund(); // refund lands while page 1's sheet is open
    };
    await expect(w.service.exportImage(resume())).rejects.toEqual(new PremiumRequiredError('export.share'));
    expect(w.share.shared).toHaveLength(1);
    expect(w.fs.exportFiles()).toEqual([]);
    expect(outcomes(w.records)).toEqual(['png:denied']);
  });

  it('a refused image export resumes through the existing paywall flow after subscribing', async () => {
    const w = setup({ premium: false });
    let resumeAction: (() => Promise<void>) | null = null;
    try {
      await w.service.exportImage(resume());
    } catch (error) {
      if (error instanceof PremiumRequiredError) {
        w.paywall.request({ feature: error.feature, run: () => w.service.exportImage(resume()) });
      }
    }
    expect(w.paywall.pendingFeature()).toBe('export.image');
    resumeAction = (await w.paywall.subscribe()).resume;
    await resumeAction!();
    expect(w.share.shared).toHaveLength(2);
    expect(outcomes(w.records)).toEqual(['png:denied', 'png:succeeded']);
  });

  describe('handles', () => {
    it('are opaque (no path) and work once', async () => {
      const w = setup();
      const handle = await w.service.prepare(resume(), { format: 'png' });
      expect(Object.isFrozen(handle)).toBe(true);
      expect(Object.keys(handle).sort()).toEqual(['format', 'id']);
      expect(handle.format).toBe('png');
      expect(JSON.stringify(handle)).not.toMatch(/mem:|exports|\/|\.png|page-/);
      await w.service.share(handle);
      await expect(w.service.share(handle)).rejects.toBeInstanceOf(ExportHandleInvalidError);
      expect(w.share.shared).toHaveLength(2);
    });

    it('expire: every page deleted, nothing shared', async () => {
      const w = setup();
      const handle = await w.service.prepare(resume(), { format: 'png' });
      w.clock.now += 60_001;
      await expect(w.service.share(handle)).rejects.toBeInstanceOf(ExportHandleInvalidError);
      expect(w.fs.exportFiles()).toEqual([]);
      expect(w.share.shared).toHaveLength(0);
    });

    it('are invalid after discard, which deletes every page', async () => {
      const w = setup();
      const handle = await w.service.prepare(resume(), { format: 'png' });
      await w.service.discard(handle);
      expect(w.fs.exportFiles()).toEqual([]);
      await expect(w.service.share(handle)).rejects.toBeInstanceOf(ExportHandleInvalidError);
    });

    it('cannot be forged, copied, or used by another service instance', async () => {
      const w = setup();
      const handle = await w.service.prepare(resume(), { format: 'png' });
      await expect(w.service.share({ id: handle.id, format: 'png' } as ExportHandle)).rejects.toBeInstanceOf(ExportHandleInvalidError);
      await expect(w.service.share({ ...handle })).rejects.toBeInstanceOf(ExportHandleInvalidError);
      await expect(new ExportService(w.gate, w.platform).share(handle)).rejects.toBeInstanceOf(ExportHandleInvalidError);
      expect(w.share.shared).toHaveLength(0);
    });

    it('die with the process (app restart); the launch purge removes the pages', async () => {
      const w = setup();
      const handle = await w.service.prepare(resume(), { format: 'png' });
      expect(pngFiles(w)).toHaveLength(2);
      const platform = createFileExportPlatform({ fs: w.fs, print: w.print, share: w.share, rasterizer: w.rasterizer });
      await expect(new ExportService(w.gate, platform).share(handle)).rejects.toBeInstanceOf(ExportHandleInvalidError);
      platform.purgeAll();
      expect(w.fs.exportFiles()).toEqual([]);
      expect(w.share.shared).toHaveLength(0);
    });
  });

  describe('failures leave no artifact', () => {
    it('renderer (print) failure: nothing rasterized, nothing written', async () => {
      const w = setup();
      w.print.fail = new Error('WebView print failed');
      await expect(w.service.exportImage(resume())).rejects.toThrow('WebView print failed');
      expect(w.rasterizer.inputs).toHaveLength(0);
      expect(w.fs.files.size).toBe(0);
      expect(outcomes(w.records)).toEqual(['png:failed']);
    });

    it('rasterizer failure (pdf.js / WebView): temp PDF and pages removed, error has no path', async () => {
      const w = setup();
      w.rasterizer.fail = new RasterizerError('webview_terminated');
      const error = await w.service.exportImage(resume()).catch((e: Error) => e);
      expect(error).toBeInstanceOf(RasterizerError);
      expect((error as Error).message).not.toMatch(/mem:|\/|exports/);
      expect(w.fs.files.size).toBe(0);
      expect(outcomes(w.records)).toEqual(['png:failed']);
      expect(w.records.added[0].errorMessage).toBe('RasterizerError: Image export failed (webview_terminated).');
    });

    it('rasterizer not available (no host): refused cleanly', async () => {
      const w = setup();
      const platform = createFileExportPlatform({ fs: w.fs, print: w.print, share: w.share });
      const service = new ExportService(w.gate, platform, { records: w.records });
      await expect(service.exportImage(resume())).rejects.toBeInstanceOf(RasterizerError);
      expect(w.fs.files.size).toBe(0);
    });

    it('file system failure while reading the printed PDF', async () => {
      const w = setup();
      w.fs.readBase64 = async () => {
        throw new Error('EIO');
      };
      await expect(w.service.exportImage(resume())).rejects.toThrow('EIO');
      expect(w.fs.files.size).toBe(0);
    });

    it('insufficient storage while writing a page: partial page and earlier pages removed', async () => {
      const w = setup();
      const write = w.fs.writeBase64.bind(w.fs);
      let writes = 0;
      w.fs.writeBase64 = (file, base64) => {
        writes += 1;
        if (writes === 2) {
          w.fs.files.set(file.uri, 'PARTIAL');
          throw new Error('ENOSPC');
        }
        write(file, base64);
      };
      await expect(w.service.exportImage(resume())).rejects.toThrow('ENOSPC');
      expect(w.fs.files.size).toBe(0);
      expect(w.share.shared).toHaveLength(0);
    });

    it('share sheet failure deletes every page and invalidates the handle', async () => {
      const w = setup();
      w.share.fail = new Error('no activity');
      const handle = await w.service.prepare(resume(), { format: 'png' });
      await expect(w.service.share(handle)).rejects.toThrow('no activity');
      expect(w.fs.exportFiles()).toEqual([]);
      await expect(w.service.share(handle)).rejects.toBeInstanceOf(ExportHandleInvalidError);
      expect(outcomes(w.records)).toEqual(['png:failed']);
    });

    it('cancelled share: remaining pages not offered, files deleted', async () => {
      const w = setup();
      w.share.result = 'dismissed';
      await expect(w.service.exportImage(resume())).rejects.toBeInstanceOf(ExportCancelledError);
      expect(w.share.shared).toHaveLength(1);
      expect(w.fs.exportFiles()).toEqual([]);
    });

    it('app backgrounded before sharing: not shared, pages deleted', async () => {
      const w = setup();
      const handle = await w.service.prepare(resume(), { format: 'png' });
      w.foreground.value = false;
      await expect(w.service.share(handle)).rejects.toBeInstanceOf(ExportInterruptedError);
      expect(w.fs.exportFiles()).toEqual([]);
      expect(w.share.shared).toHaveLength(0);
    });
  });

  it('bypass attempts: "premium" arguments and resume fields change nothing', async () => {
    const w = setup({ premium: false });
    const anyService = w.service as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    await expect(anyService.exportImage(resume(), 'letter', { premium: true, watermark: false })).rejects.toBeInstanceOf(PremiumRequiredError);
    await expect(anyService.prepare(resume(), { format: 'png', premium: true })).rejects.toBeInstanceOf(PremiumRequiredError);
    const sneaky = { ...resume(), premium: true, data: { ...SAMPLE_RESUME, premium: true } } as StoredResume;
    await expect(w.service.exportImage(sneaky)).rejects.toBeInstanceOf(PremiumRequiredError);
    expect(w.print.calls).toHaveLength(0);
    expect(w.rasterizer.inputs).toHaveLength(0);
  });
});

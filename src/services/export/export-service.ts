import { PremiumRequiredError, type PremiumFeature } from '../../domain/entitlement/features';
import { summarizeExportError, type ExportType } from '../../domain/export/export-record';
import type { ExportRecordRepository } from '../../domain/ports/repositories';
import type { PaperSize } from '../../domain/render/render-html';
import type { StoredResume } from '../../domain/resume/types';
import { newId } from '../../domain/shared/id';
import type { PremiumGate } from '../entitlement/premium-gate';

// The only export/share boundary (plan §11).
//
//   prepare(resume, options)  premium check #1 → generate → register an opaque handle
//   share(handle)             validate handle → premium check #2 → share → handle consumed
//   discard(handle)           delete the artifact; the handle becomes invalid
//
// exportPdf / exportDocx / exportImage run prepare + share in one call (what screens use).
// Image export (PNG, one per page) is rasterized from the same PDF as exportPdf.
//
// Rules:
// - Callers pass the resume only; the entitlement always comes from the gate.
// - Handles are opaque, frozen objects issued by this service instance. They carry
//   no file path, work once, expire after a short lifetime, and cannot be forged
//   (validity is tracked by object identity, not by the id string).
// - Any failed or denied export deletes its artifact immediately. A shared artifact
//   stays in the private exports folder only until the purge on the next launch.
// - Export records are appended as metadata and never read here.

export interface ExportArtifact {
  readonly id: string;
}

export type ShareResult = 'completed' | 'dismissed' | 'unknown';

/** Re-checks the entitlement before each further file of a multi-file share. Throws to stop. */
export type ShareGuard = () => Promise<void>;

/** Platform side effects (rendering to files, file system, share sheet). Only this service calls it. */
export interface ExportPlatform {
  generatePdf(resume: StoredResume, paper?: PaperSize): Promise<ExportArtifact>;
  generateDocx(resume: StoredResume): Promise<ExportArtifact>;
  /** One PNG per page, rasterized from the export PDF. */
  generatePng(resume: StoredResume, paper?: PaperSize): Promise<ExportArtifact>;
  share(artifact: ExportArtifact, guard?: ShareGuard): Promise<ShareResult | void>;
  discard(artifact: ExportArtifact): Promise<void>;
}

export type ExportFormat = ExportType;

export interface ExportOptions {
  format: ExportFormat;
  paper?: PaperSize;
}

/** Opaque, single-use reference to a prepared export. Contains no path. */
export interface ExportHandle {
  readonly id: string;
  readonly format: ExportFormat;
}

export class ExportHandleInvalidError extends Error {
  constructor(reason: string) {
    super(`This export is no longer available (${reason}). Please export again.`);
    this.name = 'ExportHandleInvalidError';
  }
}

export class ExportInProgressError extends Error {
  constructor() {
    super('An export is already in progress.');
    this.name = 'ExportInProgressError';
  }
}

export class ExportInterruptedError extends Error {
  constructor() {
    super('The export was interrupted because the app left the foreground.');
    this.name = 'ExportInterruptedError';
  }
}

export class ExportCancelledError extends Error {
  constructor() {
    super('Sharing was cancelled.');
    this.name = 'ExportCancelledError';
  }
}

interface HandleEntry {
  artifact: ExportArtifact;
  resume: StoredResume;
  format: ExportFormat;
  reason: string;
  createdAt: number;
}

export interface ExportServiceOptions {
  records?: ExportRecordRepository;
  /** True while the app is in the foreground; sharing is refused otherwise. */
  isForeground?: () => boolean;
  now?: () => number;
  /** How long a prepared export may wait before sharing. */
  handleLifetimeMs?: number;
}

const FEATURE: Record<ExportFormat, PremiumFeature> = { pdf: 'export.pdf', docx: 'export.docx', png: 'export.image' };
const DEFAULT_HANDLE_LIFETIME_MS = 5 * 60 * 1000;

export class ExportService {
  private readonly handles = new WeakMap<ExportHandle, HandleEntry>();
  private readonly live = new Set<ExportHandle>();
  private busy = false;
  private readonly records?: ExportRecordRepository;
  private readonly isForeground: () => boolean;
  private readonly now: () => number;
  private readonly lifetime: number;

  constructor(
    private readonly gate: PremiumGate,
    private readonly platform: ExportPlatform,
    options: ExportServiceOptions | ExportRecordRepository = {},
  ) {
    // Also accepts a records repository directly (the step 3 constructor form).
    const opts: ExportServiceOptions = 'add' in options ? { records: options } : options;
    this.records = opts.records;
    this.isForeground = opts.isForeground ?? (() => true);
    this.now = opts.now ?? Date.now;
    this.lifetime = opts.handleLifetimeMs ?? DEFAULT_HANDLE_LIFETIME_MS;
  }

  // --- one-call exports used by screens ---

  exportPdf(resume: StoredResume, paper: PaperSize = 'letter'): Promise<void> {
    return this.exportOnce(resume, { format: 'pdf', paper });
  }

  exportDocx(resume: StoredResume): Promise<void> {
    return this.exportOnce(resume, { format: 'docx' });
  }

  /** PNG image(s) of the resume, one per page, identical to the PDF pages. */
  exportImage(resume: StoredResume, paper: PaperSize = 'letter'): Promise<void> {
    return this.exportOnce(resume, { format: 'png', paper });
  }

  private async exportOnce(resume: StoredResume, options: ExportOptions): Promise<void> {
    if (this.busy) throw new ExportInProgressError();
    this.busy = true;
    try {
      const handle = await this.prepareUnlocked(resume, options);
      await this.shareUnlocked(handle);
    } finally {
      this.busy = false;
    }
  }

  // --- explicit lifecycle ---

  async prepare(resume: StoredResume, options: ExportOptions): Promise<ExportHandle> {
    if (this.busy) throw new ExportInProgressError();
    this.busy = true;
    try {
      return await this.prepareUnlocked(resume, options);
    } finally {
      this.busy = false;
    }
  }

  async share(handle: ExportHandle): Promise<void> {
    if (this.busy) throw new ExportInProgressError();
    this.busy = true;
    try {
      await this.shareUnlocked(handle);
    } finally {
      this.busy = false;
    }
  }

  async discard(handle: ExportHandle): Promise<void> {
    const entry = this.handles.get(handle);
    if (!entry) return;
    await this.retire(handle, entry);
  }

  /** Deletes every artifact this service still holds (e.g. when the screen goes away). */
  async discardAll(): Promise<void> {
    for (const handle of [...this.live]) await this.discard(handle);
  }

  // --- internals ---

  private async prepareUnlocked(resume: StoredResume, options: ExportOptions): Promise<ExportHandle> {
    const format = options.format;
    // Check #1: before anything is generated.
    const decision = await this.requireOrRecord(resume, format, FEATURE[format]);
    let artifact: ExportArtifact;
    try {
      artifact =
        format === 'pdf'
          ? await this.platform.generatePdf(resume, options.paper ?? 'letter')
          : format === 'png'
            ? await this.platform.generatePng(resume, options.paper ?? 'letter')
            : await this.platform.generateDocx(resume);
    } catch (error) {
      await this.record(resume, format, 'failed', decision.reason, error);
      throw error;
    }
    const handle: ExportHandle = Object.freeze({ id: newId(), format });
    this.handles.set(handle, { artifact, resume, format, reason: decision.reason, createdAt: this.now() });
    this.live.add(handle);
    return handle;
  }

  private async shareUnlocked(handle: ExportHandle): Promise<void> {
    const entry = this.handles.get(handle);
    if (!entry) throw new ExportHandleInvalidError('unknown or already used');
    const { resume, format } = entry;

    if (this.now() - entry.createdAt > this.lifetime) {
      await this.retire(handle, entry);
      await this.record(resume, format, 'failed', entry.reason, new ExportHandleInvalidError('expired'));
      throw new ExportHandleInvalidError('expired');
    }
    if (!this.isForeground()) {
      await this.retire(handle, entry);
      await this.record(resume, format, 'failed', entry.reason, new ExportInterruptedError());
      throw new ExportInterruptedError();
    }

    // Check #2: immediately before the file leaves the app.
    let decision;
    try {
      decision = await this.gate.require('export.share');
    } catch (error) {
      await this.retire(handle, entry);
      if (error instanceof PremiumRequiredError) await this.record(resume, format, 'denied', 'not_premium');
      throw error;
    }

    // The handle is single use from here on, whatever the share outcome.
    this.handles.delete(handle);
    this.live.delete(handle);
    let result: ShareResult | void;
    try {
      // Multi-page images: the entitlement is checked again before every further page.
      result = await this.platform.share(entry.artifact, async () => {
        await this.gate.require('export.share');
      });
    } catch (error) {
      await this.platform.discard(entry.artifact).catch(() => undefined);
      if (error instanceof PremiumRequiredError) await this.record(resume, format, 'denied', 'not_premium');
      else await this.record(resume, format, 'failed', decision.reason, error);
      throw error;
    }
    if (result === 'dismissed') {
      await this.platform.discard(entry.artifact).catch(() => undefined);
      await this.record(resume, format, 'failed', decision.reason, new ExportCancelledError());
      throw new ExportCancelledError();
    }
    // Shared: the receiving app may still read the file; the launch purge removes it.
    await this.record(resume, format, 'succeeded', decision.reason);
  }

  private async retire(handle: ExportHandle, entry: HandleEntry): Promise<void> {
    this.handles.delete(handle);
    this.live.delete(handle);
    await this.platform.discard(entry.artifact).catch(() => undefined);
  }

  private async requireOrRecord(resume: StoredResume, format: ExportFormat, feature: PremiumFeature) {
    try {
      return await this.gate.require(feature);
    } catch (error) {
      if (error instanceof PremiumRequiredError) await this.record(resume, format, 'denied', 'not_premium');
      throw error;
    }
  }

  private async record(
    resume: StoredResume,
    exportType: ExportType,
    outcome: 'succeeded' | 'failed' | 'denied',
    reason: string,
    error?: unknown,
  ): Promise<void> {
    if (!this.records) return;
    try {
      await this.records.add({
        resumeId: resume.id,
        templateId: resume.templateId,
        exportType,
        outcome,
        accessReason: reason,
        errorMessage: error === undefined ? null : summarizeExportError(error),
      });
    } catch {
      // Export history is diagnostics only.
    }
  }
}

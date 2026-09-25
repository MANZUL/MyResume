import { PremiumRequiredError, type PremiumFeature } from '../../domain/entitlement/features';
import { summarizeExportError, type ExportType } from '../../domain/export/export-record';
import type { ExportRecordRepository } from '../../domain/ports/repositories';
import type { StoredResume } from '../../domain/resume/types';
import { FeatureNotAvailableYetError } from '../premium/premium-tools';
import type { PremiumGate } from '../entitlement/premium-gate';

// The only export/share boundary (plan §11).
//   1. premium check (EntitlementService, via the gate) before any generation;
//   2. generate an app-private artifact;
//   3. premium check again immediately before sharing;
//   4. share. Artifacts are deleted at once if the export is denied or fails,
//      otherwise by the purge of the exports folder on the next app launch.
// Methods take the resume only: callers cannot pass an entitlement decision.
// Artifacts are opaque handles; no file path is ever returned to callers.

export interface ExportArtifact {
  readonly id: string;
}

/** Platform side effects (expo-print, docx, file system, share sheet). */
export interface ExportPlatform {
  generatePdf(resume: StoredResume): Promise<ExportArtifact>;
  generateDocx(resume: StoredResume): Promise<ExportArtifact>;
  share(artifact: ExportArtifact): Promise<void>;
  discard(artifact: ExportArtifact): Promise<void>;
}

export class ExportService {
  constructor(
    private readonly gate: PremiumGate,
    private readonly platform: ExportPlatform,
    private readonly records?: ExportRecordRepository,
  ) {}

  exportPdf(resume: StoredResume): Promise<void> {
    return this.run(resume, 'pdf', 'export.pdf', () => this.platform.generatePdf(resume));
  }

  exportDocx(resume: StoredResume): Promise<void> {
    return this.run(resume, 'docx', 'export.docx', () => this.platform.generateDocx(resume));
  }

  /** Image export arrives in migration step 6; the premium check already guards it. */
  async exportImage(_resume: StoredResume): Promise<never> {
    await this.gate.require('export.image');
    throw new FeatureNotAvailableYetError('Image export');
  }

  private async record(resume: StoredResume, exportType: ExportType, outcome: 'succeeded' | 'failed' | 'denied', reason: string, error?: unknown) {
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

  private async requireOrRecord(resume: StoredResume, exportType: ExportType, feature: PremiumFeature) {
    try {
      return await this.gate.require(feature);
    } catch (error) {
      if (error instanceof PremiumRequiredError) await this.record(resume, exportType, 'denied', 'not_premium');
      throw error;
    }
  }

  private async run(
    resume: StoredResume,
    exportType: ExportType,
    feature: PremiumFeature,
    generate: () => Promise<ExportArtifact>,
  ): Promise<void> {
    // Gate 1: before any file is generated.
    const before = await this.requireOrRecord(resume, exportType, feature);

    let artifact: ExportArtifact;
    try {
      artifact = await generate();
    } catch (error) {
      await this.record(resume, exportType, 'failed', before.reason, error);
      throw error;
    }

    let shared = false;
    try {
      // Gate 2: immediately before the file leaves the app.
      await this.requireOrRecord(resume, exportType, 'export.share');
      try {
        await this.platform.share(artifact);
        shared = true;
      } catch (error) {
        await this.record(resume, exportType, 'failed', before.reason, error);
        throw error;
      }
      await this.record(resume, exportType, 'succeeded', before.reason);
    } finally {
      // Denied or failed: remove the file now. Shared: the receiving app may still be
      // reading it, so it is removed by the purge on the next launch.
      if (!shared) await this.platform.discard(artifact).catch(() => undefined);
    }
  }
}

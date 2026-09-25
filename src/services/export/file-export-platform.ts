import { buildResumeDocxBase64 } from '../../domain/render/export-docx';
import { PAPER_POINTS, renderResumeHtml, type PaperSize } from '../../domain/render/render-html';
import type { StoredResume } from '../../domain/resume/types';
import { newId } from '../../domain/shared/id';
import { fileSafeName } from '../../domain/shared/text';
import { getTemplate } from '../../domain/templates/templates';
import type { ExportArtifact, ExportPlatform, ShareGuard, ShareResult } from './export-service';
import { RasterizerError, type Rasterizer } from './rasterizer/rasterizer-bridge';

// Export generation over small, injectable adapters (file system, printing,
// share sheet), so the logic runs in tests without a device. Expo adapters are
// in expo-export-platform.ts. Only ExportService calls this platform.
//
// Layout: <private cache>/exports/<artifact id>/<Readable_Name>.pdf|docx|png
// (multi-page images: <Readable_Name>_page-N.png). Every failure removes the
// artifact's folder, so no partial or paid file is left behind.

/** Internal file reference. Never leaves services/export. */
export interface FileRef {
  readonly uri: string;
}

export interface ExportFileSystem {
  /** Creates <exports>/<artifactId>/ and returns a reference to <name> inside it (not yet written). */
  prepareFile(artifactId: string, name: string): FileRef;
  writeBase64(file: FileRef, base64: string): void;
  /** Reads a file (e.g. the print engine's temp PDF) as base64. */
  readBase64(uri: string): Promise<string>;
  /** Moves a file produced elsewhere (e.g. the print engine's temp file) to the target. */
  moveInto(sourceUri: string, target: FileRef): Promise<void>;
  deleteUri(uri: string): void;
  /** Deletes <exports>/<artifactId>/ and everything in it. */
  deleteArtifactDir(artifactId: string): void;
  exists(file: FileRef): boolean;
  /** Deletes the whole exports folder. */
  purge(): void;
}

export interface PrintAdapter {
  printToFile(options: { html: string; width: number; height: number; marginPt: number }): Promise<{ uri: string }>;
}

export interface ShareAdapter {
  isAvailable(): Promise<boolean>;
  share(uri: string, options: { mimeType: string; dialogTitle: string; uti: string }): Promise<ShareResult | void>;
}

export const MARGIN_PT = 54; // 0.75 in
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const PNG_MIME = 'image/png';

interface ArtifactRecord {
  /** One file, or one PNG per page for image exports (shared in page order). */
  files: FileRef[];
  mimeType: string;
  dialogTitle: string;
  uti: string;
}

export interface FileExportPlatformDeps {
  fs: ExportFileSystem;
  print: PrintAdapter;
  share: ShareAdapter;
  /** Turns the export PDF into PNG pages (image export). */
  rasterizer?: Rasterizer;
  newId?: () => string;
}

export function exportFileName(resume: StoredResume, extension: 'pdf' | 'docx' | 'png', page?: { index: number; count: number }): string {
  const base = fileSafeName(resume.data.name || resume.title);
  return page && page.count > 1 ? `${base}_page-${page.index + 1}.${extension}` : `${base}.${extension}`;
}

/** The exact HTML the PDF is printed from: the shared renderer, PDF mode, never watermarked. */
export function pdfHtml(resume: StoredResume, paper: PaperSize): string {
  return renderResumeHtml(resume.data, {
    templateId: resume.templateId,
    accent: resume.accent,
    mode: 'pdf',
    watermark: false,
    paper,
  });
}

export function docxBase64(resume: StoredResume): Promise<string> {
  return buildResumeDocxBase64({
    data: resume.data,
    accent: resume.accent,
    templateName: getTemplate(resume.templateId).name,
  });
}

export function createFileExportPlatform(deps: FileExportPlatformDeps): ExportPlatform & { purgeAll(): void } {
  const { fs, print, share, rasterizer } = deps;
  const makeId = deps.newId ?? newId;
  const artifacts = new Map<string, ArtifactRecord>();

  const cleanup = (artifactId: string) => {
    artifacts.delete(artifactId);
    try {
      fs.deleteArtifactDir(artifactId);
    } catch {
      // Best effort; the launch purge removes anything left.
    }
  };

  const deleteQuietly = (uri: string) => {
    try {
      fs.deleteUri(uri);
    } catch {
      // ignore
    }
  };

  /** The one print path shared by PDF and image export. */
  const printPdf = (resume: StoredResume, paper: PaperSize) => {
    const size = PAPER_POINTS[paper];
    return print.printToFile({ html: pdfHtml(resume, paper), width: size.width, height: size.height, marginPt: MARGIN_PT });
  };

  return {
    async generatePdf(resume, paper = 'letter') {
      const id = makeId();
      let printed: { uri: string } | null = null;
      try {
        printed = await printPdf(resume, paper);
        const file = fs.prepareFile(id, exportFileName(resume, 'pdf'));
        await fs.moveInto(printed.uri, file);
        artifacts.set(id, { files: [file], mimeType: 'application/pdf', dialogTitle: 'Share resume PDF', uti: 'com.adobe.pdf' });
        return { id };
      } catch (error) {
        if (printed) deleteQuietly(printed.uri);
        cleanup(id);
        throw error;
      }
    },

    // Image export: the same PDF as the PDF export (shared renderer, PDF mode, no
    // watermark), rasterized page by page. The temporary PDF never becomes an artifact.
    async generatePng(resume, paper = 'letter') {
      const id = makeId();
      let printed: { uri: string } | null = null;
      try {
        if (!rasterizer) throw new RasterizerError('unavailable');
        printed = await printPdf(resume, paper);
        const pages = await rasterizer.rasterize(await fs.readBase64(printed.uri));
        const files = pages.map((page) => {
          const file = fs.prepareFile(id, exportFileName(resume, 'png', { index: page.index, count: pages.length }));
          fs.writeBase64(file, page.pngBase64);
          return file;
        });
        artifacts.set(id, { files, mimeType: PNG_MIME, dialogTitle: 'Share resume image', uti: 'public.png' });
        return { id };
      } catch (error) {
        cleanup(id);
        throw error;
      } finally {
        if (printed) deleteQuietly(printed.uri);
      }
    },

    async generateDocx(resume) {
      const id = makeId();
      try {
        const base64 = await docxBase64(resume);
        const file = fs.prepareFile(id, exportFileName(resume, 'docx'));
        fs.writeBase64(file, base64);
        artifacts.set(id, { files: [file], mimeType: DOCX_MIME, dialogTitle: 'Share resume (Word)', uti: 'org.openxmlformats.wordprocessingml.document' });
        return { id };
      } catch (error) {
        cleanup(id);
        throw error;
      }
    },

    // Files are shared one share sheet at a time, in page order. Before every file
    // after the first, the service's guard re-checks the entitlement.
    async share(artifact: ExportArtifact, guard?: ShareGuard) {
      const record = artifacts.get(artifact.id);
      if (!record || record.files.length === 0 || !record.files.every((file) => fs.exists(file))) {
        throw new Error('This export is no longer available. Please export again.');
      }
      if (!(await share.isAvailable())) throw new Error('Sharing is not available on this device.');
      let result: ShareResult | void = undefined;
      for (const [index, file] of record.files.entries()) {
        if (index > 0 && guard) await guard();
        const title = record.files.length > 1 ? `${record.dialogTitle} (page ${index + 1} of ${record.files.length})` : record.dialogTitle;
        result = await share.share(file.uri, { mimeType: record.mimeType, dialogTitle: title, uti: record.uti });
        if (result === 'dismissed') return result;
      }
      return result;
    },

    async discard(artifact: ExportArtifact) {
      cleanup(artifact.id);
    },

    purgeAll() {
      artifacts.clear();
      try {
        fs.purge();
      } catch {
        // Best effort.
      }
    },
  };
}

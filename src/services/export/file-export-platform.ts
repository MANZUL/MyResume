import { buildResumeDocxBase64 } from '../../domain/render/export-docx';
import { PAPER_POINTS, renderResumeHtml, type PaperSize } from '../../domain/render/render-html';
import type { StoredResume } from '../../domain/resume/types';
import { newId } from '../../domain/shared/id';
import { fileSafeName } from '../../domain/shared/text';
import { getTemplate } from '../../domain/templates/templates';
import type { ExportArtifact, ExportPlatform, ShareResult } from './export-service';

// Export generation over small, injectable adapters (file system, printing,
// share sheet), so the logic runs in tests without a device. Expo adapters are
// in expo-export-platform.ts. Only ExportService calls this platform.
//
// Layout: <private cache>/exports/<artifact id>/<Readable_Name>.pdf|docx
// Every failure removes the artifact's folder, so no partial or paid file is left behind.

/** Internal file reference. Never leaves services/export. */
export interface FileRef {
  readonly uri: string;
}

export interface ExportFileSystem {
  /** Creates <exports>/<artifactId>/ and returns a reference to <name> inside it (not yet written). */
  prepareFile(artifactId: string, name: string): FileRef;
  writeBase64(file: FileRef, base64: string): void;
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

interface ArtifactRecord {
  file: FileRef;
  mimeType: string;
  dialogTitle: string;
  uti: string;
}

export interface FileExportPlatformDeps {
  fs: ExportFileSystem;
  print: PrintAdapter;
  share: ShareAdapter;
  newId?: () => string;
}

export function exportFileName(resume: StoredResume, extension: 'pdf' | 'docx'): string {
  return `${fileSafeName(resume.data.name || resume.title)}.${extension}`;
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
  const { fs, print, share } = deps;
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

  return {
    async generatePdf(resume, paper = 'letter') {
      const id = makeId();
      const size = PAPER_POINTS[paper];
      let printed: { uri: string } | null = null;
      try {
        printed = await print.printToFile({ html: pdfHtml(resume, paper), width: size.width, height: size.height, marginPt: MARGIN_PT });
        const file = fs.prepareFile(id, exportFileName(resume, 'pdf'));
        await fs.moveInto(printed.uri, file);
        artifacts.set(id, { file, mimeType: 'application/pdf', dialogTitle: 'Share resume PDF', uti: 'com.adobe.pdf' });
        return { id };
      } catch (error) {
        if (printed) {
          try {
            fs.deleteUri(printed.uri);
          } catch {
            // ignore
          }
        }
        cleanup(id);
        throw error;
      }
    },

    async generateDocx(resume) {
      const id = makeId();
      try {
        const base64 = await docxBase64(resume);
        const file = fs.prepareFile(id, exportFileName(resume, 'docx'));
        fs.writeBase64(file, base64);
        artifacts.set(id, { file, mimeType: DOCX_MIME, dialogTitle: 'Share resume (Word)', uti: 'org.openxmlformats.wordprocessingml.document' });
        return { id };
      } catch (error) {
        cleanup(id);
        throw error;
      }
    },

    async share(artifact: ExportArtifact) {
      const record = artifacts.get(artifact.id);
      if (!record || !fs.exists(record.file)) throw new Error('This export is no longer available. Please export again.');
      if (!(await share.isAvailable())) throw new Error('Sharing is not available on this device.');
      return share.share(record.file.uri, { mimeType: record.mimeType, dialogTitle: record.dialogTitle, uti: record.uti });
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

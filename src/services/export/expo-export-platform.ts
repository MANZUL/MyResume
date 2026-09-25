import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildResumeDocxBase64 } from '../../domain/render/export-docx';
import { renderResumeHtml } from '../../domain/render/render-html';
import { newId } from '../../domain/shared/id';
import { fileSafeName } from '../../domain/shared/text';
import { getTemplate } from '../../domain/templates/templates';
import type { StoredResume } from '../../domain/resume/types';
import type { ExportArtifact, ExportPlatform } from './export-service';

// Device implementation of export generation and sharing. Only ExportService
// calls it. Generated files live in a private cache folder, are known to
// callers only by an opaque handle, are deleted when an export is denied or
// fails, and the whole folder is cleared on the next app launch (a shared file
// is kept until then because the receiving app may still be reading it).

const MARGIN_PT = 54; // 0.75in
const exportsDir = () => new Directory(Paths.cache, 'exports');

/** Deletes every export artifact from previous sessions. Call once at app start. */
export function purgeExportArtifacts(): void {
  try {
    const dir = exportsDir();
    if (dir.exists) dir.delete();
  } catch {
    // Best effort: the OS may also clear the cache directory.
  }
}

interface ArtifactFile {
  file: File;
  mimeType: string;
  dialogTitle: string;
  uti: string;
}

export function createExpoExportPlatform(): ExportPlatform {
  const artifacts = new Map<string, ArtifactFile>();

  const register = (entry: ArtifactFile): ExportArtifact => {
    const artifact = { id: newId() };
    artifacts.set(artifact.id, entry);
    return artifact;
  };

  const targetFile = (resume: StoredResume, extension: 'pdf' | 'docx') => {
    // Readable name for the share sheet, inside the private exports folder.
    const dir = exportsDir();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const target = new File(dir, `${fileSafeName(resume.data.name || resume.title)}.${extension}`);
    if (target.exists) target.delete();
    return target;
  };

  return {
    async generatePdf(resume) {
      const html = renderResumeHtml(resume.data, {
        templateId: resume.templateId,
        accent: resume.accent,
        mode: 'pdf',
      });
      const { uri } = await Print.printToFileAsync({
        html,
        width: 612,
        height: 792,
        margins: { top: MARGIN_PT, bottom: MARGIN_PT, left: MARGIN_PT, right: MARGIN_PT },
      });
      const target = targetFile(resume, 'pdf');
      await new File(uri).move(target);
      return register({ file: target, mimeType: 'application/pdf', dialogTitle: 'Share resume PDF', uti: 'com.adobe.pdf' });
    },

    async generateDocx(resume) {
      const base64 = await buildResumeDocxBase64({
        data: resume.data,
        accent: resume.accent,
        templateName: getTemplate(resume.templateId).name,
      });
      const target = targetFile(resume, 'docx');
      target.create();
      target.write(base64, { encoding: 'base64' });
      return register({
        file: target,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        dialogTitle: 'Share resume (Word)',
        uti: 'org.openxmlformats.wordprocessingml.document',
      });
    },

    async share(artifact) {
      const entry = artifacts.get(artifact.id);
      if (!entry) throw new Error('This export is no longer available. Please export again.');
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(entry.file.uri, { mimeType: entry.mimeType, dialogTitle: entry.dialogTitle, UTI: entry.uti });
    },

    async discard(artifact) {
      const entry = artifacts.get(artifact.id);
      artifacts.delete(artifact.id);
      if (entry?.file.exists) entry.file.delete();
    },
  };
}

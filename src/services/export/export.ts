import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { ExportAccess } from '../../domain/access/access';
import type { ExportRecordRepository } from '../../domain/ports/repositories';
import { buildResumeDocxBase64 } from '../../domain/render/export-docx';
import { renderResumeHtml } from '../../domain/render/render-html';
import { getTemplate } from '../../domain/templates/templates';
import { fileSafeName } from '../../domain/shared/text';
import type { StoredResume } from '../../domain/resume/types';
import { ExportLockedError, runRecordedExport } from './record-export';

// Every export path goes through runRecordedExport, which checks access before
// any file is generated, so no screen can produce a file without it.

export { ExportLockedError };

const MARGIN_PT = 54; // 0.75in

async function share(uri: string, mimeType: string, dialogTitle: string, uti: string) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI: uti });
}

export function exportPdf(resume: StoredResume, access: ExportAccess, records?: ExportRecordRepository) {
  return runRecordedExport(resume, 'pdf', access, () => generatePdf(resume), records);
}

async function generatePdf(resume: StoredResume) {
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
  // Give the file a readable name before sharing.
  const target = new File(Paths.cache, `${fileSafeName(resume.data.name || resume.title)}.pdf`);
  if (target.exists) target.delete();
  new File(uri).move(target);
  await share(target.uri, 'application/pdf', 'Share resume PDF', 'com.adobe.pdf');
}

export function exportDocx(resume: StoredResume, access: ExportAccess, records?: ExportRecordRepository) {
  return runRecordedExport(resume, 'docx', access, () => generateDocx(resume), records);
}

async function generateDocx(resume: StoredResume) {
  const base64 = await buildResumeDocxBase64({
    data: resume.data,
    accent: resume.accent,
    templateName: getTemplate(resume.templateId).name,
  });
  const target = new File(Paths.cache, `${fileSafeName(resume.data.name || resume.title)}.docx`);
  if (target.exists) target.delete();
  target.create();
  target.write(base64, { encoding: 'base64' });
  await share(
    target.uri,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'Share resume (Word)',
    'org.openxmlformats.wordprocessingml.document',
  );
}

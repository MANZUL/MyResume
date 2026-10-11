import { renderResumeHtml, type PaperSize } from '../../domain/render/render-html';
import type { StoredResume } from '../../domain/resume/types';

/**
 * The in-app preview of a resume: the shared renderer in preview mode, in the resume's
 * own language. My Resume is free, so the preview is clean (no watermark) for everyone.
 * `paper` is the size the exports will use, so the page on screen matches the file.
 */
export function renderPreview(resume: StoredResume, paper: PaperSize = 'letter'): string {
  return renderResumeHtml(resume.data, {
    templateId: resume.templateId,
    accent: resume.accent,
    mode: 'preview',
    // The resume's language, not the app's: labels and direction belong to the document.
    language: resume.language,
    watermark: false,
    paper,
  });
}

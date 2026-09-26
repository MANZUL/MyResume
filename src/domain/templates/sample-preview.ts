import { renderResumeHtml } from '../render/render-html';
import { SAMPLE_RESUME } from '../resume/sample-data';
import { getTemplate } from './templates';

// Template discovery (gallery thumbnails and the large template preview) shows the
// sample resume through the one existing renderer. It never shows the user's data,
// so it carries no watermark; a user's own resume is previewed only through
// PreviewService, which applies the FREE/PREMIUM watermark rules.

/** Preview-mode HTML of the sample resume in a template, with the template's default accent. */
export function templateSampleHtml(templateId: string): string {
  const template = getTemplate(templateId);
  return renderResumeHtml(SAMPLE_RESUME, {
    mode: 'preview',
    templateId: template.id,
    accent: template.defaultAccent,
    watermark: false,
  });
}

import { renderResumeHtml } from '../render/render-html';
import { SAMPLE_RESUME, SAMPLE_RESUME_LANGUAGE } from '../resume/sample-data';
import { getTemplate } from './templates';

// Template discovery (gallery thumbnails and the large template preview) shows the
// sample resume through the one existing renderer, without a watermark. A user's own
// resume is previewed through services/preview (also clean: My Resume is free).

/** Preview-mode HTML of the sample resume in a template, with the template's default accent. */
export function templateSampleHtml(templateId: string): string {
  const template = getTemplate(templateId);
  return renderResumeHtml(SAMPLE_RESUME, {
    mode: 'preview',
    templateId: template.id,
    accent: template.defaultAccent,
    // The sample content is English; its labels and direction must match it.
    language: SAMPLE_RESUME_LANGUAGE,
    watermark: false,
  });
}

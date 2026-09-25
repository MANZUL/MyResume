import { renderResumeHtml } from '../../domain/render/render-html';
import type { StoredResume } from '../../domain/resume/types';
import type { EntitlementReader } from '../entitlement/entitlement-service';

/**
 * Builds the in-app preview. The watermark is decided here from the
 * entitlement: FREE users always get the "PREVIEW" watermark, PREMIUM users a
 * clean preview. Screens cannot ask for a clean preview themselves.
 */
export class PreviewService {
  constructor(private readonly entitlements: EntitlementReader) {}

  async render(resume: StoredResume): Promise<{ html: string; watermarked: boolean }> {
    const decision = await this.entitlements.check();
    const watermarked = !decision.premium;
    const html = renderResumeHtml(resume.data, {
      templateId: resume.templateId,
      accent: resume.accent,
      mode: 'preview',
      watermark: watermarked,
    });
    return { html, watermarked };
  }
}

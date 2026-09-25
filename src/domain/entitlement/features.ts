// Everything behind the single `premium` entitlement (plan §4.2, revision 3).
// Anything not listed here is FREE: creating, editing, saving, all 12
// templates, the watermarked preview, import, Resume Score, Cover Letter
// (including copy and share) and the default + 8 preset colors.

export const PREMIUM_FEATURES = [
  'export.pdf',
  'export.docx',
  'export.image',
  'export.share',
  'preview.clean',
  'coach',
  'jobMatch',
  'tailoring',
  'customize.customAccent',
] as const;

export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];

export class PremiumRequiredError extends Error {
  constructor(readonly feature: PremiumFeature) {
    super('This needs My Resume Premium.');
    this.name = 'PremiumRequiredError';
  }
}

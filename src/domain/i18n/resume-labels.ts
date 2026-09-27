import { CATALOGS, type PartialMessages } from '../../i18n/catalog';
import { createTranslator } from '../../i18n/translate';
import type { Language } from './languages';

// The labels the app itself writes into a resume document. The one source is the catalog
// ("resume.labels.*", src/i18n/messages); they are looked up in the RESUME's language
// (never the app language), with English as the per-label fallback. The preview, PDF,
// image and DOCX all read them through this function.

export interface ResumeLabels {
  summary: string;
  experience: string;
  education: string;
  certifications: string;
  projects: string;
  awards: string;
  /** Document title when the resume has no name. */
  resume: string;
  /** The FREE preview watermark text. */
  previewWatermark: string;
}

export const RESUME_LABEL_KEYS = ['summary', 'experience', 'education', 'certifications', 'projects', 'awards', 'resume', 'previewWatermark'] as const;

export function resumeLabels(language: Language, catalogs: Record<Language, PartialMessages> = CATALOGS): ResumeLabels {
  // Document text is data inside the page: no UI isolation marks.
  const { t } = createTranslator(language, catalogs, { isolate: false });
  const labels = {} as ResumeLabels;
  for (const key of RESUME_LABEL_KEYS) labels[key] = t(`resume.labels.${key}`);
  return labels;
}

import type { Language } from './languages';

// The one source of every label the app itself writes into a resume document. The
// preview, PDF, image and DOCX all read these, keyed by the RESUME's language (not the
// app language). Missing translations fall back to English per label.

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

const EN: ResumeLabels = {
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  certifications: 'Certifications',
  projects: 'Projects',
  awards: 'Awards',
  resume: 'Resume',
  previewWatermark: 'PREVIEW',
};

// Translations are a later phase; empty tables fall back to English.
export const RESUME_LABELS: Record<Language, Partial<ResumeLabels>> = {
  en: EN,
  de: {},
  fr: {},
  es: {},
  ar: {},
};

export function resumeLabels(language: Language): ResumeLabels {
  return { ...EN, ...RESUME_LABELS[language] };
}

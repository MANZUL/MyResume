import { HEADING_TRACKING_EM, NAME_TRACKING_EM } from '../render/render-html';
import type { Language } from '../i18n/languages';
import { resumeLabels } from '../i18n/resume-labels';
import { typographyFor } from '../i18n/typography';
import type { TemplateConfig } from '../templates/templates';

// What the renderer does with each template that matters to a parser. These are
// claims about our own exports, and tests verify them against real output: a PDF
// printed in Chromium and read back with pdf.js, and the generated DOCX.

/**
 * Widest letter-spacing (em) measured to keep words whole in a PDF text layer
 * (Chromium PDF read with pdf.js and pdfminer.six: whole up to 0.10em, split from 0.12em).
 */
export const MAX_WHOLE_WORD_TRACKING_EM = 0.1;

/** The renderer's tracking; tests may pass other values to check the rule itself. */
export interface Tracking {
  headings: Readonly<Record<TemplateConfig['sectionHeaderStyle'], number>>;
  name: number;
}
export const RENDERER_TRACKING: Tracking = { headings: HEADING_TRACKING_EM, name: NAME_TRACKING_EM };

export interface TemplateTextFacts {
  /** "E L E A N O R" in the PDF text layer. */
  nameLetterSpaced: boolean;
  /** "S U M M A R Y" in the PDF text layer. */
  headingsLetterSpaced: boolean;
  /** Name and contact details side by side (read in order: name, then contact). */
  splitHeader: boolean;
}

export function templateTextFacts(config: TemplateConfig, tracking: Tracking = RENDERER_TRACKING): TemplateTextFacts {
  return {
    // The split header's name has no letter-spacing; the other layouts use NAME_TRACKING_EM when upper-case.
    nameLetterSpaced: config.nameCase === 'uppercase' && config.nameAlign !== 'split' && tracking.name > MAX_WHOLE_WORD_TRACKING_EM,
    headingsLetterSpaced: tracking.headings[config.sectionHeaderStyle] > MAX_WHOLE_WORD_TRACKING_EM,
    splitHeader: config.nameAlign === 'split',
  };
}

/** The tracking the renderer actually applies for a resume language (none for Arabic). */
export function trackingFor(language: Language): Tracking {
  if (typographyFor(language).letterSpacing) return RENDERER_TRACKING;
  const none = Object.fromEntries(Object.keys(HEADING_TRACKING_EM).map((k) => [k, 0])) as Tracking['headings'];
  return { headings: none, name: 0 };
}

/** Headings the renderer and the DOCX generator write for a resume language (fixed text; users cannot rename them). */
export function renderedHeadings(language: Language): string[] {
  const labels = resumeLabels(language);
  return [labels.summary, labels.experience, labels.education, labels.certifications, labels.projects, labels.awards];
}

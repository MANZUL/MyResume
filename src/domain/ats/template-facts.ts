import { HEADING_TRACKING_EM, NAME_TRACKING_EM } from '../render/render-html';
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

/** Headings the renderer and the DOCX generator use (fixed text; users cannot rename them). */
export const RENDERED_HEADINGS = ['Summary', 'Experience', 'Education', 'Certifications', 'Projects', 'Awards'] as const;

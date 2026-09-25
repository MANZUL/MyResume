import type { TemplateConfig } from '../templates/templates';

// What the renderer does with each template that matters to a parser. These are
// claims about our own exports, and tests verify them against real output: a PDF
// printed in Chromium and read back with pdf.js, and the generated DOCX.

/** Heading styles drawn with wide letter-spacing (0.12em), which a PDF text layer splits into letters. */
const LETTER_SPACED_HEADINGS: readonly TemplateConfig['sectionHeaderStyle'][] = ['underline', 'small-caps', 'small-caps-rule'];

export interface TemplateTextFacts {
  /** "E L E A N O R" in the PDF text layer. */
  nameLetterSpaced: boolean;
  /** "S U M M A R Y" in the PDF text layer. */
  headingsLetterSpaced: boolean;
  /** Name and contact details side by side (read in order: name, then contact). */
  splitHeader: boolean;
}

export function templateTextFacts(config: TemplateConfig): TemplateTextFacts {
  return {
    nameLetterSpaced: config.nameCase === 'uppercase' && config.nameAlign !== 'split',
    headingsLetterSpaced: LETTER_SPACED_HEADINGS.includes(config.sectionHeaderStyle),
    splitHeader: config.nameAlign === 'split',
  };
}

/** Headings the renderer and the DOCX generator use (fixed text; users cannot rename them). */
export const RENDERED_HEADINGS = ['Summary', 'Experience', 'Education', 'Certifications', 'Projects', 'Awards'] as const;

import { analysisSupport } from '../i18n/analysis-support';
import type { Language } from '../i18n/languages';
import { normalizeResumeData } from '../resume/normalize';
import type { ResumeData } from '../resume/types';
import { getTemplate } from '../templates/templates';
import {
  bulletsCheck,
  charactersCheck,
  contactCheck,
  datesCheck,
  entriesCheck,
  formattingCheck,
  invisibleCheck,
  layoutCheck,
  sectionsCheck,
  templateTextCheck,
  type AtsInput,
} from './rules';
import type { AtsReport } from './types';

/**
 * ATS readability report for a resume in a template. Pure and deterministic; no score.
 * Malformed data is repaired first (the same normalisation the renderer uses).
 */
export function checkAtsReadability(data: ResumeData, templateId: string, language: Language): AtsReport {
  const input: AtsInput = { data: normalizeResumeData(data), template: getTemplate(templateId), language };
  const contact = contactCheck(input);
  const sections = sectionsCheck(input);
  return {
    templateId: input.template.id,
    // English rules on any language today; the UI says so when the resume is not English.
    support: analysisSupport('ats', language),
    detected: [...contact.detected, ...sections.detected],
    checks: [
      contact.check,
      sections.check,
      templateTextCheck(input),
      layoutCheck(input),
      charactersCheck(input),
      invisibleCheck(input),
      bulletsCheck(input),
      datesCheck(input),
      formattingCheck(input),
      entriesCheck(input),
    ],
  };
}

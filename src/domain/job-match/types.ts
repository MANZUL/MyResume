import { englishText } from '../../i18n/analysis';
import { text as coded, type AnalysisText } from '../i18n/analysis-text';
import type { LanguageSupport } from '../i18n/analysis-support';
import type { EditorSection } from '../resume/sections';
import type { JdSection } from './segment';
import type { TermCategory } from './taxonomy';

// Job Description → Resume match. Only textual facts: where a listed term is
// mentioned in the posting and where the same term appears in the resume. No score,
// no percentage, no judgement of fit, level, years or qualification.

export interface Evidence {
  section: EditorSection;
  /** English, e.g. "Experience 1 · Accomplishment 2". */
  label: string;
  /** The same place as a code, for the UI. */
  labelText: AnalysisText;
}

export interface JobTerm {
  id: string;
  label: string;
  category: TermCategory;
  job: {
    /** Number of lines of the posting that mention it. */
    mentions: number;
    /** Where in the posting (distinct, in priority order). */
    sections: JdSection[];
  };
  /** Where the same term appears in the resume; empty = not detected in the resume text. */
  resume: Evidence[];
}

export interface RoleTitle {
  text: string;
  core: string;
  resume: Evidence[];
}

export interface JobMatchReport {
  /** English taxonomy today; 'english-rules' for resumes in other languages. */
  support: LanguageSupport;
  title: RoleTitle | null;
  terms: JobTerm[];
  counts: { inJob: number; alsoInResume: number };
}

/** Plan §1: job description 25,000 characters max. */
export const JOB_DESCRIPTION_MAX = 25_000;

export class JobDescriptionTooLongError extends Error {
  /** For the UI, in the app language. */
  readonly messageText = coded('errors.jobDescriptionTooLong', { count: JOB_DESCRIPTION_MAX });
  constructor() {
    super(englishText(coded('errors.jobDescriptionTooLong', { count: JOB_DESCRIPTION_MAX }), { formatNumbers: true }));
    this.name = 'JobDescriptionTooLongError';
  }
}

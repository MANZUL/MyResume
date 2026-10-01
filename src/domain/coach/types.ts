import type { LanguageSupport } from '../i18n/analysis-support';
import { englishText } from '../../i18n/analysis';
import { text as coded, type AnalysisText } from '../i18n/analysis-text';
import type { Language } from '../i18n/languages';
// Writing Coach (plan §3): deterministic rules with reasons and a few
// safe, user-triggered fixes. No rewriting, no AI. A fix never adds a fact.

/** The five fields the web editor offered "Improve with AI" on. */
export const COACH_FIELDS = ['tagline', 'experienceSummary', 'experienceBullet', 'projectDescription', 'projectBullet'] as const;
export type CoachField = (typeof COACH_FIELDS)[number];

export const BULLET_FIELDS: readonly CoachField[] = ['experienceBullet', 'projectBullet'];

/** Grouped under the web editor's improvement actions. */
export type CoachCategory = 'concise' | 'professional' | 'impact' | 'measurable' | 'grammar';

export type CoachRuleId =
  | 'weak-opener'
  | 'filler'
  | 'buzzword'
  | 'passive'
  | 'first-person'
  | 'long-bullet'
  | 'measurable'
  | 'spacing'
  | 'capitalization'
  | 'final-period'
  | 'repeated-word'
  | 'a-an'
  | 'tense'
  | 'repeated-opener'
  | 'wordy';

/** What a rule may know about the other bullets of the same entry (read-only). */
export interface SiblingSummary {
  /** First word, lower case. */
  opener: string;
  endsWithPeriod: boolean;
}

export interface CoachContext {
  field: CoachField;
  /** The resume's language. The Coach's rules are English-only; other languages get no findings. */
  language: Language;
  siblings: readonly SiblingSummary[];
}

export type CoachFix =
  /** Mechanical, shown with its result, applied on tap. */
  | { kind: 'auto'; replacement: string }
  /** A wording change, shown as before → after, applied on tap. */
  | { kind: 'preview'; replacement: string }
  /** The user picks one of a fixed list; there is no default. */
  | { kind: 'choices'; options: readonly string[] };

export interface CoachFinding {
  id: string;
  rule: CoachRuleId;
  category: CoachCategory;
  /** Why this was flagged (English rendering of `messageText`). */
  message: string;
  /** The same as a message code (analysis.coach.*) plus parameters. */
  messageText: AnalysisText;
  /** Identifies the exact text this finding was computed on (any edit makes it stale). */
  textKey: string;
  /** Span of the analysed text the finding (and its fix) covers. */
  start: number;
  end: number;
  fix?: CoachFix;
}

export interface CoachReport {
  text: string;
  field: CoachField;
  /** 'unavailable' for languages without Coach rules: then there are no findings. */
  support: LanguageSupport;
  findings: readonly CoachFinding[];
}

/** Plan §1: improve input 6,000 characters; context 300. */
export const COACH_LIMITS = { maxTextLength: 6000, maxContextLength: 300, maxOpenerLength: 40 } as const;

export class CoachInputError extends Error {
  /** For the UI, in the app language. */
  readonly messageText: AnalysisText;
  constructor(readonly reason: 'text_too_long' | 'context_too_long' | 'invalid_context') {
    const messageText =
      reason === 'text_too_long' ? coded('errors.coachTextTooLong', { count: COACH_LIMITS.maxTextLength }) : coded('errors.coachContext');
    super(englishText(messageText));
    this.messageText = messageText;
    this.name = 'CoachInputError';
  }
}

export class CoachStaleFindingError extends Error {
  readonly messageText = coded('errors.coachStale');
  constructor() {
    super(englishText(coded('errors.coachStale')));
    this.name = 'CoachStaleFindingError';
  }
}

export class CoachFixRejectedError extends Error {
  readonly messageText = coded('errors.coachFixRejected');
  constructor(readonly reason: 'no_fix' | 'invalid_choice' | 'not_grounded' | 'out_of_range') {
    super(englishText(coded('errors.coachFixRejected')));
    this.name = 'CoachFixRejectedError';
  }
}

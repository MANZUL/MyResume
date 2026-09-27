import type { AnalysisText } from '../i18n/analysis-text';
import type { LanguageSupport } from '../i18n/analysis-support';
import type { EditorSection } from '../resume/sections';

// ATS Readability Checker (FREE, owner-approved step 9). Deterministic checks of
// what can be proven from the resume's own data and the template's rendering.
// There is no score or percentage and no pass/fail prediction.

export type AtsRuleId =
  | 'contact'
  | 'sections'
  | 'template-text'
  | 'layout'
  | 'characters'
  | 'invisible'
  | 'bullets'
  | 'dates'
  | 'formatting'
  | 'entries';

/** `readable` = nothing found; `check` = worth a look; `issue` = likely to confuse a parser. */
export type AtsStatus = 'readable' | 'check' | 'issue';

// Every text is a message code plus parameters (`*Text`, rendered by the UI in the app
// language). The plain strings next to them are the English rendering of the same codes.

export interface AtsLocation {
  section: EditorSection;
  /** English, e.g. "Experience 2 · Accomplishment 3". */
  label: string;
  labelText: AnalysisText;
}

export interface AtsFinding {
  id: string;
  status: Exclude<AtsStatus, 'readable'>;
  /** English rendering of `messageText`. */
  message: string;
  messageText: AnalysisText;
  location?: AtsLocation;
}

export interface AtsCheck {
  rule: AtsRuleId;
  title: string;
  titleText: AnalysisText;
  status: AtsStatus;
  /** One sentence describing what was checked and the outcome. */
  summary: string;
  summaryText: AnalysisText;
  findings: AtsFinding[];
}

/** Presence of the parts an ATS looks for ("Detected" / "Not detected"). */
export interface AtsDetection {
  label: string;
  labelText: AnalysisText;
  detected: boolean;
}

export interface AtsReport {
  templateId: string;
  /** Which rules produced this report for the resume's language. */
  support: LanguageSupport;
  checks: AtsCheck[];
  detected: AtsDetection[];
}

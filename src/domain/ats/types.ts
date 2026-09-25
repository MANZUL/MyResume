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

export interface AtsLocation {
  section: EditorSection;
  /** Human-readable place, e.g. "Experience 2 · Accomplishment 3". */
  label: string;
}

export interface AtsFinding {
  id: string;
  status: Exclude<AtsStatus, 'readable'>;
  message: string;
  location?: AtsLocation;
}

export interface AtsCheck {
  rule: AtsRuleId;
  title: string;
  status: AtsStatus;
  /** One sentence describing what was checked and the outcome. */
  summary: string;
  findings: AtsFinding[];
}

/** Presence of the parts an ATS looks for ("Detected" / "Not detected"). */
export interface AtsDetection {
  label: string;
  detected: boolean;
}

export interface AtsReport {
  templateId: string;
  checks: AtsCheck[];
  detected: AtsDetection[];
}

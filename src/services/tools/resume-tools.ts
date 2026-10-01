import { analyzeText, applyFix, buildCoachContext } from '../../domain/coach/coach';
import type { CoachField, CoachFinding, CoachReport } from '../../domain/coach/types';
import type { Language } from '../../domain/i18n/languages';
import { analyzeJobMatch } from '../../domain/job-match/job-match';
import type { JobMatchReport } from '../../domain/job-match/types';
import type { ResumeData } from '../../domain/resume/types';

// The screens' entry point to the Writing Coach and Job Match engines. Both are free
// for everyone; the engines themselves decide what a language supports.

/** Job description → resume match. */
export async function jobMatch(data: ResumeData, jobDescription: string, language: Language): Promise<JobMatchReport> {
  return analyzeJobMatch(data, jobDescription, language);
}

/** Writing Coach analysis. `siblings` are the entry's other bullets, read-only. */
export async function writingCoach(text: string, field: CoachField, language: Language, siblings: readonly string[] = []): Promise<CoachReport> {
  return analyzeText(text, buildCoachContext(field, language, siblings));
}

/** Applies one Coach suggestion; the engine rejects stale or ungrounded fixes. */
export async function applyCoachFix(
  text: string,
  field: CoachField,
  language: Language,
  siblings: readonly string[],
  finding: CoachFinding,
  choice?: number,
): Promise<string> {
  return applyFix(text, buildCoachContext(field, language, siblings), finding, choice);
}

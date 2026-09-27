import type { Language } from './languages';

// Which languages each deterministic engine has rules for. Today every rule pack is
// English. The contract makes that explicit per engine and per resume language, so a
// future German/French/Spanish/Arabic rule pack is added here without changing callers:
//
// - native:        the engine has rules for the resume's language.
// - english-rules: the engine still runs, but with English rules and English output;
//                  the UI must say so. Used where most checks are language-neutral.
// - unavailable:   the engine does not run for this language (its rules are all about
//                  English wording, so results would be wrong).

export type AnalysisEngine = 'resumeScore' | 'ats' | 'jobMatch' | 'writingCoach' | 'coverLetter' | 'import';

export type LanguageSupport =
  | { kind: 'native'; language: Language }
  | { kind: 'english-rules'; language: Language }
  | { kind: 'unavailable'; language: Language };

/** Languages each engine has its own rules for. */
export const RULE_LANGUAGES: Record<AnalysisEngine, readonly Language[]> = {
  resumeScore: ['en'],
  ats: ['en'],
  jobMatch: ['en'],
  writingCoach: ['en'],
  coverLetter: ['en'],
  import: ['en'],
};

/** What an engine does for a language it has no rules for. */
const WITHOUT_RULES: Record<AnalysisEngine, 'english-rules' | 'unavailable'> = {
  resumeScore: 'english-rules',
  ats: 'english-rules',
  jobMatch: 'english-rules',
  // Every Coach rule is about English wording; it never runs on other languages.
  writingCoach: 'unavailable',
  // The draft letter is written in English; the UI labels it as such.
  coverLetter: 'english-rules',
  // English section headings only; contact details and bullets are still found.
  import: 'english-rules',
};

export function analysisSupport(engine: AnalysisEngine, language: Language): LanguageSupport {
  if (RULE_LANGUAGES[engine].includes(language)) return { kind: 'native', language };
  return { kind: WITHOUT_RULES[engine], language };
}

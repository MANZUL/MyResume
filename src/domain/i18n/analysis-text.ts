// Analysis results as stable message codes plus parameters, not English sentences.
// A code is a key in the app catalog (src/i18n/messages); the UI renders it in the app
// language. A parameter may itself be a coded text (e.g. a location "Experience 2 · Job
// Title" inside a finding). Strings in params are data (user text, characters, numbers),
// never English wording.

export type TextParam = string | number | AnalysisText;

export interface AnalysisText {
  readonly code: string;
  readonly params?: Readonly<Record<string, TextParam>>;
}

export function text(code: string, params?: Record<string, TextParam>): AnalysisText {
  return params ? { code, params } : { code };
}

import { DEFAULT_LANGUAGE, type Language } from '../../domain/i18n/languages';
import { createTranslator, type Translator } from '../../i18n/translate';

// The current app language for code outside React (resume library default titles and
// language, share-sheet titles). The LocalizationProvider keeps it in sync; it is never
// a resume's language.

let current: Language = DEFAULT_LANGUAGE;
let known = false;

export function getAppLanguage(): Language {
  return current;
}

export function setAppLanguageForServices(language: Language): void {
  current = language;
  known = true;
}

/** False until the provider has resolved the language (e.g. when the app fails to start). */
export function hasAppLanguage(): boolean {
  return known;
}

export function appTranslator(): Translator {
  return createTranslator(current);
}

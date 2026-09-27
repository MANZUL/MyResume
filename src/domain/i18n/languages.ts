// The five launch languages (product decision). App language and resume language are
// separate values of this one type: the app UI follows the app language, a resume's
// labels, typography and direction follow that resume's own language.

export const LANGUAGES = ['en', 'de', 'fr', 'es', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Fallback for missing translations, unreadable stored values and unknown devices. */
export const DEFAULT_LANGUAGE: Language = 'en';

export type TextDirection = 'ltr' | 'rtl';

const RTL_LANGUAGES: ReadonlySet<Language> = new Set<Language>(['ar']);

export function directionOf(language: Language): TextDirection {
  return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** A stored or external value as a Language; anything unknown becomes the fallback. */
export function toLanguage(value: unknown, fallback: Language = DEFAULT_LANGUAGE): Language {
  return isLanguage(value) ? value : fallback;
}

/**
 * The first supported language in a list of BCP 47 tags (preference order), matched on
 * the primary subtag only: "de-AT" → de, "ar-EG" → ar, "pt-BR" → skipped. English when none match.
 */
export function resolveLanguage(tags: readonly string[]): Language {
  for (const tag of tags) {
    const primary = String(tag).trim().toLowerCase().split(/[-_]/)[0];
    if (isLanguage(primary)) return primary;
  }
  return DEFAULT_LANGUAGE;
}

/**
 * Each language's own name (endonym). Shown unchanged in every app language, so a
 * user can always find their language in the picker.
 */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  ar: 'العربية',
};

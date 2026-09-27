import { resolveLanguage, type Language } from '../../domain/i18n/languages';

/**
 * The device's preferred locale tags, read through Intl (Hermes reports the OS locale on
 * iOS and Android) without adding a dependency. Only the primary locale is available
 * this way; expo-localization would add the full preference list (see plan §19.11).
 */
export function deviceLocaleTags(): string[] {
  try {
    const locale = new Intl.DateTimeFormat().resolvedOptions().locale;
    return locale ? [locale] : [];
  } catch {
    return [];
  }
}

/** First-launch fallback: the device language if supported, else English. */
export function deviceLanguage(): Language {
  return resolveLanguage(deviceLocaleTags());
}

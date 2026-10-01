import type { Language } from './languages';

// Locale-aware formatting through Intl, keyed by language only (no invented regions).
// If the engine lacks Intl support the plain value is returned, never an exception.
//
// Arabic is pinned to Western (Latin) digits and the Gregorian calendar. Plain "ar" leaves
// the digit system to the engine (Arabic-Indic on some platform ICU versions, Latin on
// others), which would make the same screen differ between iOS, Android and the tests, and
// would put Arabic-Indic digits next to the Latin digits of user-typed dates, phone numbers
// and e-mail addresses. Month names, separators and plural rules stay Arabic.

function localeFor(language: Language): string {
  return language === 'ar' ? 'ar-u-ca-gregory-nu-latn' : language;
}

export function formatNumber(language: Language, value: number, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(localeFor(language), options).format(value);
  } catch {
    return String(value);
  }
}

const DATE_DEFAULT: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

export function formatDate(language: Language, value: number | Date, options: Intl.DateTimeFormatOptions = DATE_DEFAULT): string {
  const date = value instanceof Date ? value : new Date(value);
  try {
    return new Intl.DateTimeFormat(localeFor(language), options).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** For amounts the app computes itself. Store prices arrive already formatted by the store. */
export function formatCurrency(language: Language, amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(localeFor(language), { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

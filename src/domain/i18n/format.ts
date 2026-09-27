import type { Language } from './languages';

// Locale-aware formatting through Intl, keyed by language only (no invented regions).
// If the engine lacks Intl support the plain value is returned, never an exception.

export function formatNumber(language: Language, value: number, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(language, options).format(value);
  } catch {
    return String(value);
  }
}

const DATE_DEFAULT: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

export function formatDate(language: Language, value: number | Date, options: Intl.DateTimeFormatOptions = DATE_DEFAULT): string {
  const date = value instanceof Date ? value : new Date(value);
  try {
    return new Intl.DateTimeFormat(language, options).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** For amounts the app computes itself. Store prices arrive already formatted by the store. */
export function formatCurrency(language: Language, amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(language, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

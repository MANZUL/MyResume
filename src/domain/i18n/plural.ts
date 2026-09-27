import type { Language } from './languages';

// CLDR plural categories for the launch languages, implemented directly so results are
// identical on Hermes (iOS/Android) and in tests, whatever Intl support the engine has.

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export function pluralCategory(language: Language, count: number): PluralCategory {
  const n = Math.abs(count);
  const integer = Number.isInteger(n);
  const i = Math.floor(n);
  switch (language) {
    case 'en':
    case 'de':
      return integer && i === 1 ? 'one' : 'other';
    case 'es':
      if (integer && i === 1) return 'one';
      return integer && i !== 0 && i % 1_000_000 === 0 ? 'many' : 'other';
    case 'fr':
      if (i === 0 || i === 1) return 'one';
      return integer && i % 1_000_000 === 0 ? 'many' : 'other';
    case 'ar': {
      if (!integer) return 'other';
      if (n === 0) return 'zero';
      if (n === 1) return 'one';
      if (n === 2) return 'two';
      const mod100 = n % 100;
      if (mod100 >= 3 && mod100 <= 10) return 'few';
      if (mod100 >= 11 && mod100 <= 99) return 'many';
      return 'other';
    }
  }
}

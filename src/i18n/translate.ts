import { formatNumber } from '../domain/i18n/format';
import { DEFAULT_LANGUAGE, directionOf, type Language } from '../domain/i18n/languages';
import { pluralCategory } from '../domain/i18n/plural';
import { CATALOGS, type MessageKey, type PartialMessages, type PluralForms } from './catalog';

export type MessageParams = Record<string, string | number>;

export interface Translator {
  language: Language;
  /**
   * The message for `key` in this language, or in English when it has no translation.
   * Plural messages pick their form from `params.count`. Number parameters are formatted
   * for the language.
   */
  t(key: MessageKey, params?: MessageParams): string;
}

const isPlural = (value: unknown): value is PluralForms =>
  typeof value === 'object' && value !== null && typeof (value as PluralForms).other === 'string';

function lookup(catalog: PartialMessages | undefined, key: string): string | PluralForms | undefined {
  let node: unknown = catalog;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' || isPlural(node) ? node : undefined;
}

/** True when `language` has its own text for `key` (not an English fallback). */
export function hasTranslation(language: Language, key: MessageKey, catalogs: Record<Language, PartialMessages> = CATALOGS): boolean {
  return lookup(catalogs[language], key) !== undefined;
}

const RTL_CHARS = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const FSI = '\u2068';
const PDI = '\u2069';

export function createTranslator(language: Language, catalogs: Record<Language, PartialMessages> = CATALOGS): Translator {
  const RTL_UI = directionOf(language) === 'rtl';
  const t = (key: MessageKey, params: MessageParams = {}): string => {
    const own = lookup(catalogs[language], key);
    const value = own ?? lookup(catalogs[DEFAULT_LANGUAGE], key);
    if (value === undefined) return key;
    let text: string;
    if (isPlural(value)) {
      const count = typeof params.count === 'number' ? params.count : 0;
      // An English fallback uses English plural rules; a translation uses its own.
      const category = pluralCategory(own !== undefined ? language : DEFAULT_LANGUAGE, count);
      text = value[category] ?? value.other;
    } else {
      text = value;
    }
    return text.replace(/\{(\w+)\}/g, (match, name: string) => {
      const param = params[name];
      if (param === undefined) return match;
      if (typeof param === 'number') return formatNumber(language, param);
      // User text (titles, names) inside a sentence is isolated when either side is
      // right-to-left, so punctuation around it keeps its place. English UI with Latin text is unchanged.
      return RTL_UI || RTL_CHARS.test(param) ? `${FSI}${param}${PDI}` : param;
    });
  };
  return { language, t };
}

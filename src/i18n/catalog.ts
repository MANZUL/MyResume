import type { Language } from '../domain/i18n/languages';
import { ar } from './messages/ar';
import { de } from './messages/de';
import { en } from './messages/en';
import { es } from './messages/es';
import { fr } from './messages/fr';

/** A plural message: CLDR categories; `other` is always required. */
export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

type Widen<T> = T extends string ? string : T extends { other: string } ? PluralForms : { [K in keyof T]: Widen<T[K]> };
type DeepPartial<T> = T extends string | PluralForms ? T : { [K in keyof T]?: DeepPartial<T[K]> };

/** The full catalog shape, defined by the English source. */
export type Messages = Widen<typeof en>;
/** A translation: any subset of the English keys. */
export type PartialMessages = DeepPartial<Messages>;

type Paths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | { other: string } ? `${Prefix}${K}` : Paths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every valid message key, e.g. "home.create" or "templates.tech-builder.name". */
export type MessageKey = Paths<typeof en>;

export const ENGLISH: Messages = en;

export const CATALOGS: Record<Language, PartialMessages> = { en, de, fr, es, ar };

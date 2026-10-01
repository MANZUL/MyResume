import { directionOf, type Language, type TextDirection } from './languages';

// Language-aware typography for resume documents. Latin-script languages keep every
// template's case, small caps and letter-spacing exactly as designed. Arabic is cursive:
// letter-spacing breaks the joins between letters, and it has no upper case, small caps or
// italics (a slanted Arabic font is a synthesized distortion), so those template treatments
// are switched off for it. App-generated list punctuation follows the script as well.

export type Script = 'latin' | 'arabic';

export interface Typography {
  direction: TextDirection;
  script: Script;
  /** Template uppercase (names, headings). */
  caseTransforms: boolean;
  /** Template small caps (headings). */
  smallCaps: boolean;
  /** Template tracking on headings, names and the watermark. */
  letterSpacing: boolean;
  /** Template italics (tagline, company, honors, summaries). */
  italics: boolean;
  /** Separator the app puts between list items it joins itself (company, location; skills). */
  listSeparator: string;
}

const SCRIPT: Record<Language, Script> = { en: 'latin', de: 'latin', fr: 'latin', es: 'latin', ar: 'arabic' };

export function typographyFor(language: Language): Typography {
  const script = SCRIPT[language];
  const latin = script === 'latin';
  return {
    direction: directionOf(language),
    script,
    caseTransforms: latin,
    smallCaps: latin,
    letterSpacing: latin,
    italics: latin,
    // Arabic comma (U+060C) for Arabic documents; the Latin comma elsewhere, exactly as before.
    listSeparator: latin ? ', ' : '\u060C ',
  };
}

/**
 * Arabic font stack, named explicitly instead of relying on whatever the print engine
 * falls back to: Geeza Pro ships with iOS, Noto Naskh/Sans Arabic with Android. A bundled,
 * embedded font (same glyphs in preview, PDF and image on both platforms) is a separate,
 * validated task; see MOBILE_ONLY_ARCHITECTURE_PLAN.md §19.11.
 */
export const ARABIC_FONT_FAMILIES = "'Geeza Pro', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Arabic UI Text', Tahoma";

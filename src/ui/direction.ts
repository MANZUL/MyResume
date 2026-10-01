import { I18nManager, type TextStyle } from 'react-native';
import { directionOf, type Language } from '../domain/i18n/languages';
import { typographyFor } from '../domain/i18n/typography';

// Resume CONTENT follows the resume's language; app chrome follows the app language
// (React Native mirrors rows and swaps left/right automatically when the app layout is RTL).

/**
 * The textAlign value that puts text on a given physical side. React Native swaps
 * 'left'/'right' in an RTL app layout, so the value depends on the app's direction.
 */
export function alignForSide(side: 'left' | 'right', appRTL: boolean, swapsLeftRight: boolean): 'left' | 'right' {
  const swapped = appRTL && swapsLeftRight;
  if (!swapped) return side;
  return side === 'left' ? 'right' : 'left';
}

/**
 * Style for small tracked, upper-case labels (section titles, badges). Latin scripts keep the
 * design; Arabic has no upper case and letter-spacing breaks its joined letters, so it gets
 * neither. Follows the APP language.
 */
export function trackedCapsStyle(language: Language): TextStyle {
  return typographyFor(language).letterSpacing ? {} : { letterSpacing: 0, textTransform: 'none' };
}

/** The arrow of a "before → after" pair, pointing the way the app reads. */
export function arrowFor(language: Language): string {
  return directionOf(language) === 'rtl' ? '\u2190' : '\u2192';
}

/** Input style for resume content: an Arabic resume types right-to-left even in an English app, and vice versa. */
export function contentTextStyle(language: Language): TextStyle {
  const rtl = directionOf(language) === 'rtl';
  const swaps = I18nManager.getConstants?.().doLeftAndRightSwapInRTL ?? true;
  return { writingDirection: rtl ? 'rtl' : 'ltr', textAlign: alignForSide(rtl ? 'right' : 'left', I18nManager.isRTL, swaps) };
}

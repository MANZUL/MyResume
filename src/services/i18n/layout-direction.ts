import { I18nManager } from 'react-native';
import { directionOf, type Language } from '../../domain/i18n/languages';

/**
 * Makes the native layout direction follow the APP language (never a resume's). React
 * Native applies a direction change only after the app restarts, so this returns true
 * when a restart is needed. allowRTL(false) also keeps an English/German/French/Spanish
 * app left-to-right on a device set to an RTL locale.
 */
export function applyLayoutDirection(language: Language): { restartRequired: boolean } {
  const rtl = directionOf(language) === 'rtl';
  try {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  } catch {
    return { restartRequired: false };
  }
  return { restartRequired: I18nManager.isRTL !== rtl };
}

export function layoutIsRTL(): boolean {
  return I18nManager.isRTL;
}

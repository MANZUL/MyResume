import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { formatDate, formatNumber } from '../../domain/i18n/format';
import type { Language } from '../../domain/i18n/languages';
import { createTranslator, type Translator } from '../../i18n/translate';
import { useDatabase } from '../storage/database-context';
import { setAppLanguageForServices } from './app-language';
import { deviceLanguage } from './device-language';
import { applyLayoutDirection } from './layout-direction';

interface LocalizationState {
  /** The app UI language. Resumes have their own language (StoredResume.language). */
  appLanguage: Language;
  /** True once the user picked a language; until then the device language is used. */
  chosen: boolean;
  /** A layout-direction change waits for the next app start. */
  restartPending: boolean;
  t: Translator['t'];
  setAppLanguage: (language: Language) => Promise<void>;
  formatNumber: (value: number) => string;
  formatDate: (value: number | Date) => string;
}

const LocalizationContext = createContext<LocalizationState | null>(null);

/**
 * App language: the saved choice, else the device language (first launch), else English.
 * Missing translations fall back to English per key (see i18n/translate.ts).
 */
export function LocalizationProvider({ children }: { children: ReactNode }) {
  const { settings } = useDatabase();
  const [state, setState] = useState<{ language: Language; chosen: boolean; restartPending: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    const start = (saved: Language | null) => {
      const language = saved ?? deviceLanguage();
      setAppLanguageForServices(language);
      const { restartRequired } = applyLayoutDirection(language);
      if (active) setState({ language, chosen: saved !== null, restartPending: restartRequired });
    };
    settings.getAppLanguage().then(start, () => start(null));
    return () => {
      active = false;
    };
  }, [settings]);

  const setAppLanguage = useCallback(
    async (language: Language) => {
      await settings.setAppLanguage(language);
      setAppLanguageForServices(language);
      const { restartRequired } = applyLayoutDirection(language);
      setState({ language, chosen: true, restartPending: restartRequired });
    },
    [settings],
  );

  const value = useMemo<LocalizationState | null>(() => {
    if (!state) return null;
    const { t } = createTranslator(state.language);
    return {
      appLanguage: state.language,
      chosen: state.chosen,
      restartPending: state.restartPending,
      t,
      setAppLanguage,
      formatNumber: (n) => formatNumber(state.language, n),
      formatDate: (d) => formatDate(state.language, d),
    };
  }, [state, setAppLanguage]);

  if (!value) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization(): LocalizationState {
  const value = useContext(LocalizationContext);
  if (!value) throw new Error('useLocalization must be used inside LocalizationProvider');
  return value;
}

/** Shorthand for screens that only need strings. */
export function useT(): Translator['t'] {
  return useLocalization().t;
}

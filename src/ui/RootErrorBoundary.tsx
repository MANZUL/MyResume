import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { deviceLanguage } from '../services/i18n/device-language';
import { getAppLanguage, hasAppLanguage } from '../services/i18n/app-language';
import { createTranslator } from '../i18n/translate';
import { colors } from './components';
import { ErrorBoundaryCore } from './error-boundary-core';

/**
 * The recovery screen. It sits OUTSIDE every provider and screen, so it only uses React Native
 * primitives and the catalog: no database, store, router or localization context. The language
 * is the app language once it is known, else the device language.
 */
function CrashScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = createTranslator(hasAppLanguage() ? getAppLanguage() : deviceLanguage());
  return (
    <View accessibilityRole="alert" style={{ flex: 1, padding: 24, gap: 12, justifyContent: 'center', backgroundColor: colors.bg }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{t('crash.title')}</Text>
      <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{t('crash.body')}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={{ minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}
      >
        <Text style={{ color: colors.primaryText, fontSize: 16, fontWeight: '600' }}>{t('database.tryAgain')}</Text>
      </Pressable>
    </View>
  );
}

/** Catches render-time errors of the whole app (see error-boundary-core.ts for what it cannot catch). */
export function RootErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundaryCore
      fallback={(reset) => <CrashScreen onRetry={reset} />}
      // Only the error's name: messages can contain user text.
      onError={(error) => {
        if (__DEV__) console.warn(`[ui] render error (${error.name})`);
      }}
    >
      {children}
    </ErrorBoundaryCore>
  );
}

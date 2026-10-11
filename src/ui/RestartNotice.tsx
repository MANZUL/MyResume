import { usePathname } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Language } from '../domain/i18n/languages';
import { useLocalization } from '../services/i18n/localization';
import { restartNoticeVisible } from '../services/i18n/restart-notice';
import { Button, colors } from './components';

/**
 * Tells the user to close and reopen the app when the layout direction must change (for
 * example the first launch on a device set to Arabic). It appears on every screen, in the app
 * language, can be dismissed, and is gone for good once the app has been reopened with the
 * right direction. It does not restart the app.
 */
export function RestartNotice() {
  const { t, appLanguage, restartPending } = useLocalization();
  const insets = useSafeAreaInsets();
  const [dismissedFor, setDismissedFor] = useState<Language | null>(null);
  const onLanguageScreen = usePathname() === '/settings';
  if (!restartNoticeVisible({ restartPending, appLanguage, dismissedFor, onLanguageScreen })) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderTopColor: colors.accent,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 12),
        gap: 8,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>{t('settings.restart')}</Text>
      <Button title={t('storage.dismiss')} variant="ghost" fit onPress={() => setDismissedFor(appLanguage)} style={{ minHeight: 40 }} />
    </View>
  );
}

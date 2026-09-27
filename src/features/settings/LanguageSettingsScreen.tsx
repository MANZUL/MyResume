import { Pressable, ScrollView, Text, View } from 'react-native';
import { LANGUAGE_NAMES, LANGUAGES, type Language } from '../../domain/i18n/languages';
import { useLocalization } from '../../services/i18n/localization';
import { Card, colors, Muted, styles } from '../../ui/components';

/** App language only. Each resume's language is set in its editor and never changes here. */
export default function LanguageSettingsScreen() {
  const { t, appLanguage, setAppLanguage, restartPending } = useLocalization();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={styles.sectionTitle}>{t('settings.appLanguage')}</Text>
      <Muted>{t('settings.appLanguageHint')}</Muted>
      <Card style={{ padding: 0 }}>
        {LANGUAGES.map((language: Language, index) => {
          const selected = language === appLanguage;
          return (
            <Pressable
              key={language}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => void setAppLanguage(language)}
              style={({ pressed }) => [
                { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
                index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={{ fontSize: 17, color: colors.text }}>{LANGUAGE_NAMES[language]}</Text>
              {selected ? <Text style={{ fontSize: 17, color: colors.accent, fontWeight: '700' }}>✓</Text> : <View />}
            </Pressable>
          );
        })}
      </Card>
      {restartPending ? <Muted>{t('settings.restart')}</Muted> : null}
    </ScrollView>
  );
}

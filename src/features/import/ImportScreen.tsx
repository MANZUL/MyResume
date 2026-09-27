import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput } from 'react-native';
import { Button, colors, Muted, styles } from '../../ui/components';
import { parseResumeText } from '../../domain/parse/parse-text';
import { useResumeStore } from '../../services/storage/resume-store';
import { analysisSupport } from '../../domain/i18n/analysis-support';
import { useLocalization } from '../../services/i18n/localization';

export default function ImportScreen() {
  const { create } = useResumeStore();
  const [text, setText] = useState('');
  // An imported resume takes the app language: its language is never guessed from the text.
  const { t, appLanguage } = useLocalization();
  const englishHeadingsOnly = analysisSupport('import', appLanguage).kind !== 'native';

  const importText = () => {
    const data = parseResumeText(text, appLanguage);
    const resume = create(data, data.name || t('resume.imported'), undefined, appLanguage);
    router.dismiss();
    router.push({ pathname: '/resume/[id]', params: { id: resume.id } });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>{t('import.title')}</Text>
        <Muted>{t('import.intro')}</Muted>
        {englishHeadingsOnly ? <Muted>{t('import.englishHeadings')}</Muted> : null}
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoCorrect={false}
          placeholder={t('import.placeholder')}
          placeholderTextColor="#A3A6AC"
          accessibilityLabel={t('import.a11y')}
          style={[styles.input, { minHeight: 320, textAlignVertical: 'top', fontSize: 15 }]}
        />
        <Button title={t('import.create')} onPress={importText} disabled={text.trim().length < 20} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

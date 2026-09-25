import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput } from 'react-native';
import { Button, colors, Muted, styles } from '../../ui/components';
import { parseResumeText } from '../../domain/parse/parse-text';
import { useResumeStore } from '../../services/storage/resume-store';

export default function ImportScreen() {
  const { create } = useResumeStore();
  const [text, setText] = useState('');

  const importText = () => {
    const data = parseResumeText(text);
    const resume = create(data, data.name || 'Imported resume');
    router.dismiss();
    router.push({ pathname: '/resume/[id]', params: { id: resume.id } });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>Paste your resume</Text>
        <Muted>
          Copy the text from your current resume and paste it below. It is sorted into sections on your
          device — nothing is uploaded and no AI is used. Review each section afterwards.
        </Muted>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoCorrect={false}
          placeholder={'Jane Doe\njane@example.com · (555) 123-4567\n\nEXPERIENCE\nProduct Manager — Acme  Jan 2020 – Present\n• Led ...'}
          placeholderTextColor="#A3A6AC"
          accessibilityLabel="Resume text"
          style={[styles.input, { minHeight: 320, textAlignVertical: 'top', fontSize: 15 }]}
        />
        <Button title="Create resume" onPress={importText} disabled={text.trim().length < 20} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

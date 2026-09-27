import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share, View } from 'react-native';
import type { Language } from '../../domain/i18n/languages';
import { generateCoverLetter } from '../../domain/letter/cover-letter';
import type { ResumeData } from '../../domain/resume/types';
import { useT } from '../../services/i18n/localization';
import { Button, Field, Muted } from '../../ui/components';

export function LetterTool({ data, language }: { data: ResumeData; language: Language }) {
  const t = useT();
  // The draft is written in English for every resume language today; say so when it differs.
  const [writtenIn, setWrittenIn] = useState<Language | null>(null);
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [manager, setManager] = useState('');
  const [letter, setLetter] = useState('');
  const [copied, setCopied] = useState(false);

  return (
    <>
      <Muted>{t('letter.intro')}</Muted>
      <Field label={t('letter.company')} value={company} onChangeText={setCompany} />
      <Field label={t('letter.role')} value={role} onChangeText={setRole} />
      <Field label={t('letter.manager')} value={manager} onChangeText={setManager} />
      <Button
        title={t('letter.build')}
        onPress={() => {
          const draft = generateCoverLetter(data, language, { company, role, hiringManager: manager });
          setLetter(draft.text);
          setWrittenIn(draft.writtenIn);
          setCopied(false);
        }}
      />
      {writtenIn && writtenIn !== language ? <Muted>{t('letter.englishOnly')}</Muted> : null}
      {letter ? (
        <>
          <Field label={t('letter.yourLetter')} value={letter} onChangeText={setLetter} multiline style={{ minHeight: 320 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button
              title={copied ? t('letter.copied') : t('letter.copy')}
              variant="secondary"
              style={{ flex: 1 }}
              onPress={async () => {
                await Clipboard.setStringAsync(letter);
                setCopied(true);
              }}
            />
            <Button title={t('letter.share')} variant="secondary" style={{ flex: 1 }} onPress={() => Share.share({ message: letter })} />
          </View>
        </>
      ) : null}
    </>
  );
}

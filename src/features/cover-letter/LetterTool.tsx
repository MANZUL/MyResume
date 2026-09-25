import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share, View } from 'react-native';
import { buildCoverLetter } from '../../domain/letter/cover-letter';
import { Button, Field, Muted } from '../../ui/components';

export function LetterTool({ data }: { data: Parameters<typeof buildCoverLetter>[0] }) {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [manager, setManager] = useState('');
  const [letter, setLetter] = useState('');
  const [copied, setCopied] = useState(false);

  return (
    <>
      <Muted>Builds a starting draft from your resume. Bracketed parts are for you to fill in.</Muted>
      <Field label="Company" value={company} onChangeText={setCompany} />
      <Field label="Role" value={role} onChangeText={setRole} />
      <Field label="Hiring manager (optional)" value={manager} onChangeText={setManager} />
      <Button
        title="Build draft"
        onPress={() => {
          setLetter(buildCoverLetter(data, { company, role, hiringManager: manager }));
          setCopied(false);
        }}
      />
      {letter ? (
        <>
          <Field label="Your letter (editable)" value={letter} onChangeText={setLetter} multiline style={{ minHeight: 320 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button
              title={copied ? 'Copied' : 'Copy'}
              variant="secondary"
              style={{ flex: 1 }}
              onPress={async () => {
                await Clipboard.setStringAsync(letter);
                setCopied(true);
              }}
            />
            <Button title="Share" variant="secondary" style={{ flex: 1 }} onPress={() => Share.share({ message: letter })} />
          </View>
        </>
      ) : null}
    </>
  );
}

import { useState } from 'react';
import { Text, View } from 'react-native';
import { matchJob, type JobMatch } from '../../domain/match/job-match';
import { Button, Card, colors, Field, Muted, styles } from '../../ui/components';

export function MatchTool({ data }: { data: Parameters<typeof matchJob>[0] }) {
  const [jd, setJd] = useState('');
  const [result, setResult] = useState<JobMatch | null>(null);
  return (
    <>
      <Field
        label="Job description"
        value={jd}
        onChangeText={setJd}
        multiline
        placeholder="Paste the job posting here"
        style={{ minHeight: 180 }}
      />
      <Button title="Compare keywords" onPress={() => setResult(matchJob(data, jd))} disabled={jd.trim().length < 30} />
      {result ? (
        <>
          <Card style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 40, fontWeight: '700', color: colors.text }}>{result.matchPercent}%</Text>
            <Muted>of the posting&apos;s key terms appear in your resume</Muted>
          </Card>
          <Card style={{ gap: 8 }}>
            <Text style={styles.sectionTitle}>Already covered</Text>
            <Chips items={result.matched} color={colors.success} empty="None yet" />
          </Card>
          <Card style={{ gap: 8 }}>
            <Text style={styles.sectionTitle}>Not found in your resume</Text>
            <Chips items={result.missing} color={colors.warn} empty="Nothing missing" />
            <Muted>Only add terms that honestly describe your experience.</Muted>
          </Card>
        </>
      ) : null}
    </>
  );
}

function Chips({ items, color, empty }: { items: string[]; color: string; empty: string }) {
  if (!items.length) return <Muted>{empty}</Muted>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {items.map((item) => (
        <Text
          key={item}
          style={{ borderWidth: 1, borderColor: color, color, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontSize: 14 }}
        >
          {item}
        </Text>
      ))}
    </View>
  );
}

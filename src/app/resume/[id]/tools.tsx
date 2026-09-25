import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { Button, Card, colors, Field, Muted, styles } from '../../../components/ui';
import { buildCoverLetter } from '../../../lib/cover-letter';
import { matchJob, type JobMatch } from '../../../lib/job-match';
import { scoreResume } from '../../../lib/resume-score';
import { useResume } from '../../../lib/store';

type Tool = 'check' | 'match' | 'letter';

// All three tools are deterministic and run on-device. No AI, no network.
export default function ToolsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { resume } = useResume(id);
  const [tool, setTool] = useState<Tool>('check');

  if (!resume) return null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', backgroundColor: '#E7E4DE', borderRadius: 12, padding: 3 }} accessibilityRole="tablist">
          {([
            ['check', 'Check'],
            ['match', 'Job match'],
            ['letter', 'Cover letter'],
          ] as const).map(([key, label]) => (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: tool === key }}
              onPress={() => setTool(key)}
              style={{
                flex: 1,
                paddingVertical: 9,
                borderRadius: 10,
                alignItems: 'center',
                backgroundColor: tool === key ? colors.card : 'transparent',
              }}
            >
              <Text style={{ fontWeight: '600', color: colors.text }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {tool === 'check' ? <CheckTool data={resume.data} /> : null}
        {tool === 'match' ? <MatchTool data={resume.data} /> : null}
        {tool === 'letter' ? <LetterTool data={resume.data} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CheckTool({ data }: { data: Parameters<typeof scoreResume>[0] }) {
  const score = useMemo(() => scoreResume(data), [data]);
  return (
    <>
      <Card style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ fontSize: 48, fontWeight: '700', color: colors.text }}>{score.score}</Text>
        <Muted>Resume score out of 100</Muted>
      </Card>
      <Card style={{ gap: 8 }}>
        {score.categories.map((category) => (
          <View key={category.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 15 }}>{category.label}</Text>
            <Text style={{ color: category.status === 'Strong' ? colors.success : colors.warn, fontWeight: '600' }}>
              {category.status}
            </Text>
          </View>
        ))}
      </Card>
      {score.warnings.length ? (
        <Card style={{ gap: 8 }}>
          <Text style={styles.sectionTitle}>To improve</Text>
          {score.warnings.map((w) => (
            <Text key={w.id} style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>• {w.message}</Text>
          ))}
        </Card>
      ) : null}
      <Card style={{ gap: 8 }}>
        <Text style={styles.sectionTitle}>Strengths</Text>
        {score.strengths.map((s) => (
          <Text key={s} style={{ color: colors.text, fontSize: 15 }}>✓ {s}</Text>
        ))}
      </Card>
    </>
  );
}

function MatchTool({ data }: { data: Parameters<typeof matchJob>[0] }) {
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

function LetterTool({ data }: { data: Parameters<typeof buildCoverLetter>[0] }) {
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

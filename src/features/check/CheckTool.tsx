import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { scoreResume } from '../../domain/check/resume-score';
import { Card, colors, Muted, styles } from '../../ui/components';

export function CheckTool({ data }: { data: Parameters<typeof scoreResume>[0] }) {
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

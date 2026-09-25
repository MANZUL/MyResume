import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { scoreResume } from '../../domain/check/resume-score';
import type { EditorSection } from '../../domain/resume/sections';
import { Card, colors, Muted, styles } from '../../ui/components';
import { CHECK_COPY } from './improve-link';

// Resume Check (FREE). Same rules and order as the web tool: score, categories,
// what is working, what needs attention (each with "Improve"), disclaimer.
export function CheckTool({
  data,
  onImprove,
}: {
  data: Parameters<typeof scoreResume>[0];
  onImprove: (section: EditorSection) => void;
}) {
  const score = useMemo(() => scoreResume(data), [data]);
  return (
    <>
      <Card style={{ alignItems: 'center', gap: 4 }}>
        <Muted>{CHECK_COPY.title}</Muted>
        <Text style={{ fontSize: 48, fontWeight: '700', color: colors.text }}>
          {score.score}
          <Text style={{ fontSize: 18, fontWeight: '400', color: colors.muted }}> / 100</Text>
        </Text>
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
      {score.strengths.length ? (
        <Card style={{ gap: 8 }}>
          <Text style={styles.sectionTitle}>{CHECK_COPY.working}</Text>
          {score.strengths.map((s) => (
            <Text key={s} style={{ color: colors.text, fontSize: 15 }}>✓ {s}</Text>
          ))}
        </Card>
      ) : null}
      {score.warnings.length ? (
        <Card style={{ gap: 10 }}>
          <Text style={styles.sectionTitle}>{CHECK_COPY.attention}</Text>
          {score.warnings.map((w) => (
            <View key={w.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <Text style={{ flex: 1, color: colors.text, fontSize: 15, lineHeight: 21 }}>⚠︎ {w.message}</Text>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${CHECK_COPY.improve}: ${w.message}`}
                onPress={() => onImprove(w.section)}
                hitSlop={8}
              >
                <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>{CHECK_COPY.improve}</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}
      <Muted>{CHECK_COPY.disclaimer}</Muted>
    </>
  );
}

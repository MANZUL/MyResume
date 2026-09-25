import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { checkAtsReadability } from '../../domain/ats/ats';
import type { AtsStatus } from '../../domain/ats/types';
import type { ResumeData } from '../../domain/resume/types';
import type { EditorSection } from '../../domain/resume/sections';
import { Card, colors, Muted, styles } from '../../ui/components';
import { ATS_COPY, countsLine, STATUS_LABELS } from './ats-copy';

const STATUS_COLOR: Record<AtsStatus, string> = { readable: colors.success, check: colors.warn, issue: colors.danger };

// ATS Readability (FREE). Pure, on-device checks; "Improve" opens the editor section.
export function AtsTool({
  data,
  templateId,
  onImprove,
}: {
  data: ResumeData;
  templateId: string;
  onImprove: (section: EditorSection) => void;
}) {
  const report = useMemo(() => checkAtsReadability(data, templateId), [data, templateId]);
  const findings = report.checks.flatMap((c) => c.findings);
  const issues = findings.filter((f) => f.status === 'issue').length;
  const checks = findings.length - issues;

  return (
    <>
      <Card style={{ gap: 4 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{ATS_COPY.title}</Text>
        <Muted>{ATS_COPY.intro}</Muted>
        <Text style={{ color: issues ? colors.danger : checks ? colors.warn : colors.success, fontWeight: '600', marginTop: 4 }}>
          {countsLine(issues, checks)}
        </Text>
      </Card>

      <Card style={{ gap: 6 }}>
        <Text style={styles.sectionTitle}>{ATS_COPY.parts}</Text>
        {report.detected.map((d) => (
          <View key={d.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 15 }}>{d.label}</Text>
            <Text style={{ color: d.detected ? colors.success : colors.muted, fontWeight: '600' }}>
              {d.detected ? `✓ ${ATS_COPY.detected}` : ATS_COPY.notDetected}
            </Text>
          </View>
        ))}
      </Card>

      {report.checks.map((c) => (
        <Card key={c.rule} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' }}>{c.title}</Text>
            <Text style={{ color: STATUS_COLOR[c.status], fontWeight: '600' }}>{STATUS_LABELS[c.status]}</Text>
          </View>
          <Muted>{c.summary}</Muted>
          {c.findings.map((f) => (
            <View key={f.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>
                  <Text style={{ color: STATUS_COLOR[f.status], fontWeight: '600' }}>{STATUS_LABELS[f.status]}: </Text>
                  {f.message}
                </Text>
                {f.location ? <Text style={[styles.muted, { fontSize: 13 }]}>{f.location.label}</Text> : null}
              </View>
              {f.location ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`${ATS_COPY.improve}: ${f.message}`}
                  onPress={() => onImprove(f.location!.section)}
                  hitSlop={8}
                >
                  <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>{ATS_COPY.improve}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>
      ))}

      <Muted>{ATS_COPY.disclaimer}</Muted>
    </>
  );
}

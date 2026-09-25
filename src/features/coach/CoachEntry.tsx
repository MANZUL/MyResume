import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { CoachField, CoachFinding, CoachReport } from '../../domain/coach/types';
import { PremiumRequiredError } from '../../domain/entitlement/features';
import { useEntitlement } from '../../services/entitlement/entitlement';
import { colors, styles } from '../../ui/components';
import { CATEGORY_LABELS, CATEGORY_ORDER, COACH_COPY } from './coach-copy';

/**
 * Writing Coach link + inline panel under one field (PREMIUM). Everything goes
 * through PremiumTools, which checks the entitlement before analysing and again
 * before applying. FREE users see "Coach 🔒" only; no analysis runs for them.
 */
export function CoachEntry({
  text,
  field,
  siblings = [],
  onApply,
}: {
  text: string;
  field: CoachField;
  /** The entry's other bullets (read-only context). */
  siblings?: readonly string[];
  onApply: (next: string) => void;
}) {
  const { tools, paywall, decision } = useEntitlement();
  const [report, setReport] = useState<CoachReport | null>(null);
  const [message, setMessage] = useState('');

  const fail = (error: unknown, retry: () => Promise<void>) => {
    setReport(null);
    if (error instanceof PremiumRequiredError) {
      setMessage('');
      paywall.request({ feature: error.feature, run: retry });
    } else {
      setMessage(error instanceof Error ? error.message : 'The Coach could not check this text.');
    }
  };

  const analyze = async (value: string): Promise<void> => {
    if (!value.trim()) {
      setReport(null);
      setMessage(COACH_COPY.empty);
      return;
    }
    try {
      setReport(await tools.writingCoach(value, field, siblings));
      setMessage('');
    } catch (error) {
      fail(error, () => analyze(value));
    }
  };

  const apply = async (finding: CoachFinding, choice?: number) => {
    if (!report) return;
    try {
      const next = await tools.applyCoachFix(report.text, field, siblings, finding, choice);
      onApply(next);
      await analyze(next);
    } catch (error) {
      fail(error, () => analyze(report.text));
    }
  };

  // A lapsed subscription closes the panel; text already changed stays the user's text.
  const open = report !== null && decision.premium;
  const stale = open && report.text !== text;

  return (
    <View style={{ marginTop: -6, marginBottom: 10 }}>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => (open ? setReport(null) : void analyze(text))}
        style={{ alignSelf: 'flex-start' }}
      >
        <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '600' }}>
          {open ? COACH_COPY.close : decision.premium ? COACH_COPY.open : COACH_COPY.locked}
        </Text>
      </Pressable>
      {message ? <Text style={[styles.muted, { marginTop: 4 }]}>{message}</Text> : null}
      {open ? (
        <View style={{ marginTop: 8, padding: 12, borderRadius: 10, backgroundColor: '#F7F5F1', gap: 10 }}>
          {stale ? (
            <View style={{ gap: 6 }}>
              <Text style={styles.muted}>{COACH_COPY.stale}</Text>
              <LinkText label={COACH_COPY.refresh} onPress={() => void analyze(text)} />
            </View>
          ) : report.findings.length === 0 ? (
            <Text style={styles.muted}>{COACH_COPY.none}</Text>
          ) : (
            CATEGORY_ORDER.map((category) => {
              const items = report.findings.filter((f) => f.category === category);
              if (!items.length) return null;
              return (
                <View key={category} style={{ gap: 8 }}>
                  <Text style={styles.sectionTitle}>{CATEGORY_LABELS[category]}</Text>
                  {items.map((finding) => (
                    <FindingRow key={finding.id} finding={finding} text={report.text} onApply={apply} />
                  ))}
                </View>
              );
            })
          )}
          <Text style={[styles.muted, { fontSize: 12 }]}>{COACH_COPY.note}</Text>
        </View>
      ) : null}
    </View>
  );
}

function FindingRow({ finding, text, onApply }: { finding: CoachFinding; text: string; onApply: (f: CoachFinding, choice?: number) => void }) {
  const fix = finding.fix;
  const before = text.slice(finding.start, finding.end);
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{finding.message}</Text>
      {fix?.kind === 'preview' ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          “{before}” → “{fix.replacement}”
        </Text>
      ) : null}
      {fix?.kind === 'choices' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {fix.options.map((option, i) => (
            <LinkText key={option} label={option} onPress={() => onApply(finding, i)} />
          ))}
        </View>
      ) : fix ? (
        <LinkText label={COACH_COPY.apply} onPress={() => onApply(finding)} />
      ) : null}
    </View>
  );
}

function LinkText({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6}>
      <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

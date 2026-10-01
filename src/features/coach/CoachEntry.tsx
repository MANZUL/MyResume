import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { CoachCategory, CoachField, CoachFinding, CoachReport } from '../../domain/coach/types';
import { colors, styles } from '../../ui/components';
import { analysisSupport } from '../../domain/i18n/analysis-support';
import type { Language } from '../../domain/i18n/languages';
import { useT } from '../../services/i18n/localization';
import { errorText, renderText } from '../../i18n/analysis';
import { applyCoachFix, writingCoach } from '../../services/tools/resume-tools';

const CATEGORY_ORDER: readonly CoachCategory[] = ['grammar', 'concise', 'professional', 'impact', 'measurable'];

/**
 * Writing Coach link + inline panel under one field. Free for everyone; it goes through
 * services/tools, and the engine rejects stale or ungrounded fixes.
 */
export function CoachEntry({
  text,
  field,
  siblings = [],
  language,
  onApply,
}: {
  text: string;
  field: CoachField;
  /** The resume's language: the Coach has English rules only and hides itself for others. */
  language: Language;
  /** The entry's other bullets (read-only context). */
  siblings?: readonly string[];
  onApply: (next: string) => void;
}) {
  const [report, setReport] = useState<CoachReport | null>(null);
  const [message, setMessage] = useState('');
  const t = useT();

  const fail = (error: unknown) => {
    setReport(null);
    setMessage(errorText(t, error, 'coach.failed'));
  };

  const analyze = async (value: string): Promise<void> => {
    if (!value.trim()) {
      setReport(null);
      setMessage(t('coach.empty'));
      return;
    }
    try {
      setReport(await writingCoach(value, field, language, siblings));
      setMessage('');
    } catch (error) {
      fail(error);
    }
  };

  const apply = async (finding: CoachFinding, choice?: number) => {
    if (!report) return;
    try {
      const next = await applyCoachFix(report.text, field, language, siblings, finding, choice);
      onApply(next);
      await analyze(next);
    } catch (error) {
      fail(error);
    }
  };

  const open = report !== null;
  const stale = open && report.text !== text;
  // No Coach for languages without its rules; the editor shows one note instead.
  if (analysisSupport('writingCoach', language).kind === 'unavailable') return null;

  return (
    <View style={{ marginTop: -6, marginBottom: 10 }}>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => (open ? setReport(null) : void analyze(text))}
        style={{ alignSelf: 'flex-start' }}
      >
        <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '600' }}>
          {open ? t('coach.close') : t('coach.open')}
        </Text>
      </Pressable>
      {message ? <Text style={[styles.muted, { marginTop: 4 }]}>{message}</Text> : null}
      {open ? (
        <View style={{ marginTop: 8, padding: 12, borderRadius: 10, backgroundColor: '#F7F5F1', gap: 10 }}>
          {stale ? (
            <View style={{ gap: 6 }}>
              <Text style={styles.muted}>{t('coach.stale')}</Text>
              <LinkText label={t('coach.refresh')} onPress={() => void analyze(text)} />
            </View>
          ) : report.findings.length === 0 ? (
            <Text style={styles.muted}>{t('coach.none')}</Text>
          ) : (
            CATEGORY_ORDER.map((category) => {
              const items = report.findings.filter((f) => f.category === category);
              if (!items.length) return null;
              return (
                <View key={category} style={{ gap: 8 }}>
                  <Text style={styles.sectionTitle}>{t(`coach.categories.${category}`)}</Text>
                  {items.map((finding) => (
                    <FindingRow key={finding.id} finding={finding} text={report.text} onApply={apply} />
                  ))}
                </View>
              );
            })
          )}
          <Text style={[styles.muted, { fontSize: 12 }]}>{t('coach.note')}</Text>
        </View>
      ) : null}
    </View>
  );
}

function FindingRow({ finding, text, onApply }: { finding: CoachFinding; text: string; onApply: (f: CoachFinding, choice?: number) => void }) {
  const t = useT();
  const fix = finding.fix;
  const before = text.slice(finding.start, finding.end);
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{renderText(t, finding.messageText)}</Text>
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
        <LinkText label={t('coach.apply')} onPress={() => onApply(finding)} />
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

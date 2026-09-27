import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { checkAtsReadability } from '../../domain/ats/ats';
import type { AtsStatus } from '../../domain/ats/types';
import type { ResumeData } from '../../domain/resume/types';
import type { EditorSection } from '../../domain/resume/sections';
import { Card, colors, Muted, styles } from '../../ui/components';
import type { Language } from '../../domain/i18n/languages';
import { useT } from '../../services/i18n/localization';
import { renderText } from '../../i18n/analysis';
import { EnglishRulesNote } from '../tools/EnglishRulesNote';

const STATUS_COLOR: Record<AtsStatus, string> = { readable: colors.success, check: colors.warn, issue: colors.danger };

// ATS Readability (FREE). Pure, on-device checks; "Improve" opens the editor section.
export function AtsTool({
  data,
  templateId,
  language,
  onImprove,
}: {
  data: ResumeData;
  templateId: string;
  /** The resume's language (English rules today; see EnglishRulesNote). */
  language: Language;
  onImprove: (section: EditorSection) => void;
}) {
  const t = useT();
  const report = useMemo(() => checkAtsReadability(data, templateId, language), [data, templateId, language]);
  const status = (s: AtsStatus) => t(`ats.status.${s}`);
  const findings = report.checks.flatMap((c) => c.findings);
  const issues = findings.filter((f) => f.status === 'issue').length;
  const checks = findings.length - issues;

  const counts =
    !issues && !checks
      ? t('ats.allReadable')
      : [issues ? t('ats.issues', { count: issues }) : null, checks ? t('ats.toCheck', { count: checks }) : null]
          .filter(Boolean)
          .join(t('ats.separator'));

  return (
    <>
      <EnglishRulesNote support={report.support} />
      <Card style={{ gap: 4 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{t('ats.title')}</Text>
        <Muted>{t('ats.intro')}</Muted>
        <Text style={{ color: issues ? colors.danger : checks ? colors.warn : colors.success, fontWeight: '600', marginTop: 4 }}>
          {counts}
        </Text>
      </Card>

      <Card style={{ gap: 6 }}>
        <Text style={styles.sectionTitle}>{t('ats.parts')}</Text>
        {report.detected.map((d) => (
          <View key={d.labelText.code} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 15 }}>{renderText(t, d.labelText)}</Text>
            <Text style={{ color: d.detected ? colors.success : colors.muted, fontWeight: '600' }}>
              {d.detected ? `✓ ${t('ats.detected')}` : t('ats.notDetected')}
            </Text>
          </View>
        ))}
      </Card>

      {report.checks.map((c) => (
        <Card key={c.rule} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' }}>{renderText(t, c.titleText)}</Text>
            <Text style={{ color: STATUS_COLOR[c.status], fontWeight: '600' }}>{status(c.status)}</Text>
          </View>
          <Muted>{renderText(t, c.summaryText)}</Muted>
          {c.findings.map((f) => (
            <View key={f.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>
                  <Text style={{ color: STATUS_COLOR[f.status], fontWeight: '600' }}>{t('ats.statusPrefix', { status: status(f.status) })}</Text>
                  {renderText(t, f.messageText)}
                </Text>
                {f.location ? <Text style={[styles.muted, { fontSize: 13 }]}>{renderText(t, f.location.labelText)}</Text> : null}
              </View>
              {f.location ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={t('check.improveA11y', { action: t('ats.improve'), message: renderText(t, f.messageText) })}
                  onPress={() => onImprove(f.location!.section)}
                  hitSlop={8}
                >
                  <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>{t('ats.improve')}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>
      ))}

      <Muted>{t('ats.disclaimer')}</Muted>
    </>
  );
}

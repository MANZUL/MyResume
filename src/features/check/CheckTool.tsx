import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { scoreResume } from '../../domain/check/resume-score';
import type { EditorSection } from '../../domain/resume/sections';
import { Card, Muted, SectionTitle, colors } from '../../ui/components';
import type { Language } from '../../domain/i18n/languages';
import { useLocalization } from '../../services/i18n/localization';
import { renderText } from '../../i18n/analysis';
import { EnglishRulesNote } from '../tools/EnglishRulesNote';

// Resume Check (FREE). Same rules and order as the web tool: score, categories,
// what is working, what needs attention (each with "Improve"), disclaimer.
export function CheckTool({
  data,
  language,
  onImprove,
}: {
  data: Parameters<typeof scoreResume>[0];
  /** The resume's language (English rules today; see EnglishRulesNote). */
  language: Language;
  onImprove: (section: EditorSection) => void;
}) {
  const { t, formatNumber } = useLocalization();
  const score = useMemo(() => scoreResume(data, language), [data, language]);
  return (
    <>
      <EnglishRulesNote support={score.support} />
      <Card style={{ alignItems: 'center', gap: 4 }}>
        <Muted>{t('check.title')}</Muted>
        <Text style={{ fontSize: 48, fontWeight: '700', color: colors.text }}>
          {formatNumber(score.score)}
          <Text style={{ fontSize: 18, fontWeight: '400', color: colors.muted }}>{t('check.outOf')}</Text>
        </Text>
      </Card>
      <Card style={{ gap: 8 }}>
        {score.categories.map((category) => (
          <View key={category.labelText.code} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ flexShrink: 1, color: colors.text, fontSize: 15 }}>{renderText(t, category.labelText)}</Text>
            <Text style={{ color: category.status === 'Strong' ? colors.success : colors.warn, fontWeight: '600' }}>
              {category.status === 'Strong' ? t('check.status.strong') : t('check.status.needsAttention')}
            </Text>
          </View>
        ))}
      </Card>
      {score.strengthTexts.length ? (
        <Card style={{ gap: 8 }}>
          <SectionTitle>{t('check.working')}</SectionTitle>
          {score.strengthTexts.map((s) => (
            <Text key={s.code} style={{ color: colors.text, fontSize: 15 }}>✓ {renderText(t, s)}</Text>
          ))}
        </Card>
      ) : null}
      {score.warnings.length ? (
        <Card style={{ gap: 10 }}>
          <SectionTitle>{t('check.attention')}</SectionTitle>
          {score.warnings.map((w) => (
            <View key={w.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <Text style={{ flex: 1, color: colors.text, fontSize: 15, lineHeight: 21 }}>⚠︎ {renderText(t, w.messageText)}</Text>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t('check.improveA11y', { action: t('check.improve'), message: renderText(t, w.messageText) })}
                onPress={() => onImprove(w.section)}
                hitSlop={8}
              >
                <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>{t('check.improve')}</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}
      <Muted>{t('check.disclaimer')}</Muted>
    </>
  );
}

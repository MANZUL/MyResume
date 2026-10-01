import { useState } from 'react';
import { Text, View } from 'react-native';
import type { JobMatchReport } from '../../domain/job-match/types';
import { JOB_DESCRIPTION_MAX } from '../../domain/job-match/types';
import type { ResumeData } from '../../domain/resume/types';
import { useTargetJob } from '../../services/storage/use-target-job';
import { Button, Card, colors, Field, Muted, styles } from '../../ui/components';
import type { Language } from '../../domain/i18n/languages';
import { useLocalization } from '../../services/i18n/localization';
import { errorText, renderText } from '../../i18n/analysis';
import { jobMatch } from '../../services/tools/resume-tools';
import { EnglishRulesNote } from '../tools/EnglishRulesNote';

export function MatchTool({ resumeId, data, language }: { resumeId: string; data: ResumeData; language: Language }) {
  const { t } = useLocalization();
  const { description, setDescription, ready } = useTargetJob(resumeId);
  const [result, setResult] = useState<{ report: JobMatchReport; for: string } | null>(null);
  const [error, setError] = useState('');

  const compare = async (): Promise<void> => {
    const text = description;
    try {
      setResult({ report: await jobMatch(data, text, language), for: text });
      setError('');
    } catch (e) {
      setError(errorText(t, e, 'match.failed'));
    }
  };

  // A result shows only while it matches the text it was made from.
  const report = result && result.for === description ? result.report : null;

  return (
    <>
      <Field
        label={t('match.jdLabel')}
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={JOB_DESCRIPTION_MAX}
        placeholder={t('match.jdPlaceholder')}
        editable={ready}
        style={{ minHeight: 180 }}
      />
      <Muted>{t('match.charCount', { count: description.length, max: JOB_DESCRIPTION_MAX })}</Muted>
      <Button
        title={t('match.compare')}
        onPress={() => void compare()}
        disabled={!description.trim()}
      />
      {error ? <Muted>{error}</Muted> : null}
      {report ? (
        <>
          <EnglishRulesNote support={report.support} />
          {report.title ? (
            <Card style={{ gap: 4 }}>
              <Text style={styles.sectionTitle}>{t('match.role')}</Text>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{report.title.text}</Text>
              <Text style={{ color: report.title.resume.length ? colors.success : colors.muted }}>
                {report.title.resume.length
                  ? t('match.titleMentioned', { core: report.title.core, where: report.title.resume.map((e) => renderText(t, e.labelText)).join(t('match.listSeparator')) })
                  : t('match.titleNotDetected', { core: report.title.core })}
              </Text>
            </Card>
          ) : null}
          <Card style={{ gap: 10 }}>
            <Text style={styles.sectionTitle}>{t('match.termsTitle')}</Text>
            {report.terms.length ? (
              <>
                <Text style={{ color: colors.text, fontWeight: '600' }}>
                  {[t('match.termsDetected', { count: report.counts.inJob }), t('match.alsoFound', { count: report.counts.alsoInResume })].join(t('match.separator'))}
                </Text>
                {report.terms.map((term) => (
                  <View key={term.id} style={{ gap: 2 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <Text style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' }}>{term.label}</Text>
                      <Text style={{ color: term.resume.length ? colors.success : colors.muted, fontWeight: '600' }}>
                        {term.resume.length ? `✓ ${t('match.detected')}` : t('match.notDetected')}
                      </Text>
                    </View>
                    <Muted>
                      {t('match.mentionedUnder', { where: term.job.sections.map((s) => t(`match.sections.${s}`)).join(t('match.listSeparator')) }) +
                        (term.job.mentions > 1 ? t('match.mentionLines', { count: term.job.mentions }) : '')}
                    </Muted>
                    {term.resume.length ? (
                      <Muted>{t('match.inResume', { where: term.resume.map((e) => renderText(t, e.labelText)).join(t('match.listSeparator')) })}</Muted>
                    ) : null}
                  </View>
                ))}
                <Muted>{t('match.notDetectedMeaning')}</Muted>
              </>
            ) : (
              <Muted>{t('match.noTerms')}</Muted>
            )}
          </Card>
          <Muted>{t('match.disclaimer')}</Muted>
        </>
      ) : null}
    </>
  );
}

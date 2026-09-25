import { useState } from 'react';
import { Text, View } from 'react-native';
import { PremiumRequiredError } from '../../domain/entitlement/features';
import type { JobMatchReport } from '../../domain/job-match/types';
import { JOB_DESCRIPTION_MAX } from '../../domain/job-match/types';
import type { ResumeData } from '../../domain/resume/types';
import { useEntitlement } from '../../services/entitlement/entitlement';
import { useTargetJob } from '../../services/storage/use-target-job';
import { Button, Card, colors, Field, Muted, styles } from '../../ui/components';
import { countsLine, MATCH_COPY, mentionedUnder } from './match-copy';

export function MatchTool({ resumeId, data }: { resumeId: string; data: ResumeData }) {
  const { description, setDescription, ready } = useTargetJob(resumeId);
  const [result, setResult] = useState<{ report: JobMatchReport; for: string } | null>(null);
  const [error, setError] = useState('');
  const { tools, paywall, decision } = useEntitlement();

  // Job Match is premium: the tools service checks the entitlement before any analysis.
  const compare = async (): Promise<void> => {
    const text = description;
    try {
      setResult({ report: await tools.jobMatch(data, text), for: text });
      setError('');
    } catch (e) {
      if (e instanceof PremiumRequiredError) paywall.request({ feature: e.feature, run: compare });
      else setError(e instanceof Error ? e.message : 'Could not compare.');
    }
  };

  // A result shows only while it matches the text it was made from.
  const report = result && result.for === description && decision.premium ? result.report : null;

  return (
    <>
      <Field
        label={MATCH_COPY.jdLabel}
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={JOB_DESCRIPTION_MAX}
        placeholder={MATCH_COPY.jdPlaceholder}
        editable={ready}
        style={{ minHeight: 180 }}
      />
      <Muted>{`${description.length.toLocaleString('en-US')} / ${JOB_DESCRIPTION_MAX.toLocaleString('en-US')}`}</Muted>
      <Button
        title={decision.premium ? MATCH_COPY.compare : MATCH_COPY.compareLocked}
        onPress={() => void compare()}
        disabled={!description.trim()}
      />
      {error ? <Muted>{error}</Muted> : null}
      {report ? (
        <>
          {report.title ? (
            <Card style={{ gap: 4 }}>
              <Text style={styles.sectionTitle}>{MATCH_COPY.role}</Text>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{report.title.text}</Text>
              <Text style={{ color: report.title.resume.length ? colors.success : colors.muted }}>
                {report.title.resume.length
                  ? `“${report.title.core}” is mentioned in your resume (${report.title.resume.map((e) => e.label).join(', ')})`
                  : `“${report.title.core}” is not detected in your resume`}
              </Text>
            </Card>
          ) : null}
          <Card style={{ gap: 10 }}>
            <Text style={styles.sectionTitle}>{MATCH_COPY.termsTitle}</Text>
            {report.terms.length ? (
              <>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{countsLine(report.counts.inJob, report.counts.alsoInResume)}</Text>
                {report.terms.map((term) => (
                  <View key={term.id} style={{ gap: 2 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <Text style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' }}>{term.label}</Text>
                      <Text style={{ color: term.resume.length ? colors.success : colors.muted, fontWeight: '600' }}>
                        {term.resume.length ? `✓ ${MATCH_COPY.detected}` : MATCH_COPY.notDetected}
                      </Text>
                    </View>
                    <Muted>{mentionedUnder(term.job.sections, term.job.mentions)}</Muted>
                    {term.resume.length ? <Muted>{`In resume: ${term.resume.map((e) => e.label).join(', ')}`}</Muted> : null}
                  </View>
                ))}
                <Muted>{MATCH_COPY.notDetectedMeaning}</Muted>
              </>
            ) : (
              <Muted>{MATCH_COPY.noTerms}</Muted>
            )}
          </Card>
          <Muted>{MATCH_COPY.disclaimer}</Muted>
        </>
      ) : null}
    </>
  );
}

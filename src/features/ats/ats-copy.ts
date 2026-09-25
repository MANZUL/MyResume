import type { AtsStatus } from '../../domain/ats/types';

// ATS Readability copy. Plain statuses; no score, no pass/fail claims.

export const ATS_COPY = {
  title: 'ATS Readability',
  intro: 'Checks what an applicant tracking system can read in this resume and its template.',
  detected: 'Detected',
  notDetected: 'Not detected',
  parts: 'What a parser can find',
  improve: 'Improve',
  allReadable: 'No issues detected.',
  disclaimer: 'Based on this resume’s text and how this app exports it. ATS software varies; no ATS guarantee is implied.',
} as const;

export const STATUS_LABELS: Record<AtsStatus, string> = {
  readable: 'Readable',
  check: 'Check this',
  issue: 'Potential issue',
};

export function countsLine(issues: number, checks: number): string {
  if (!issues && !checks) return ATS_COPY.allReadable;
  const parts = [
    issues ? `${issues} potential ${issues === 1 ? 'issue' : 'issues'}` : null,
    checks ? `${checks} to check` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

import type { JdSection } from '../../domain/job-match/segment';

// Job Match copy: textual facts only. No percentage, fit, level or qualification claims.

export const MATCH_COPY = {
  jdLabel: 'Job description',
  jdPlaceholder: 'Paste the job posting here',
  compare: 'Compare with resume',
  compareLocked: 'Compare with resume 🔒',
  termsTitle: 'Job terms found',
  detected: 'Detected in resume',
  notDetected: 'Not detected in resume',
  noTerms: 'No listed skills, tools, certifications or degrees were detected in this job description.',
  role: 'Role in the posting',
  notDetectedMeaning:
    '“Not detected” only means these words were not found in your resume text. It does not mean you lack the skill. Add a term only if it is true.',
  disclaimer: 'Compares words in the posting and your resume. It does not judge fit, level, years of experience or qualification.',
} as const;

export const SECTION_LABELS: Record<JdSection, string> = {
  required: 'Requirements',
  responsibilities: 'Responsibilities',
  general: 'Job description',
  preferred: 'Nice to have',
  about: 'About the company',
};

export function countsLine(inJob: number, alsoInResume: number): string {
  return `${inJob} job ${inJob === 1 ? 'term' : 'terms'} detected · ${alsoInResume} also found in your resume`;
}

export function mentionedUnder(sections: readonly JdSection[], mentions: number): string {
  const where = sections.map((s) => SECTION_LABELS[s]).join(', ');
  return `Mentioned under ${where}${mentions > 1 ? ` (${mentions} lines)` : ''}`;
}

import { SAMPLE_RESUME } from '../../domain/resume/sample-data';
import type { CoachField } from '../../domain/coach/types';

// Writing Coach corpus. "strong" text is well-written and should produce no findings
// (any finding there is a false positive). "weak" text is typical of real drafts.

export interface CorpusEntry {
  field: CoachField;
  text: string;
  siblings?: string[];
}

const sampleBullets = SAMPLE_RESUME.experience.flatMap((exp) =>
  exp.bullets.map((text, i) => ({ field: 'experienceBullet' as const, text, siblings: exp.bullets.filter((_, j) => j !== i) })),
);

export const STRONG: CorpusEntry[] = [
  { field: 'tagline', text: SAMPLE_RESUME.summary.tagline },
  ...SAMPLE_RESUME.experience.map((exp) => ({ field: 'experienceSummary' as const, text: exp.summary })).filter((e) => e.text),
  ...sampleBullets,
  ...SAMPLE_RESUME.projects.map((p) => ({ field: 'projectDescription' as const, text: p.description })),
  ...SAMPLE_RESUME.projects.flatMap((p) => p.bullets.map((text) => ({ field: 'projectBullet' as const, text }))),
  { field: 'experienceBullet', text: 'Cut monthly cloud spend by 18% by rightsizing Kubernetes clusters' },
  { field: 'experienceBullet', text: 'Shipped an offline-first iOS app used by 40,000 field technicians' },
  { field: 'experienceBullet', text: 'Mentored 6 junior engineers; 4 were promoted within a year' },
  { field: 'experienceBullet', text: 'Negotiated vendor contracts worth $2.4M with no service disruption' },
  { field: 'experienceBullet', text: 'Was awarded Engineer of the Year for the payments migration' },
  { field: 'experienceBullet', text: 'Wrote the on-call runbook adopted by all 12 platform teams' },
  { field: 'experienceBullet', text: 'Designed an A/B testing framework for the checkout flow' },
  { field: 'experienceBullet', text: 'Migrated 300 services from Jenkins to GitHub Actions' },
  { field: 'experienceBullet', text: 'Built an I/O-bound batch pipeline in Go that halved nightly run time' },
  { field: 'experienceBullet', text: 'npm package maintainer for a date library with 2M weekly downloads' },
  { field: 'experienceBullet', text: 'Improved page load time from 4.1s to 1.3s' },
  { field: 'experienceBullet', text: 'Reduced support tickets by a third after redesigning onboarding' },
  { field: 'experienceBullet', text: 'Hired and onboarded an eight-person QA team' },
  { field: 'experienceBullet', text: 'Presented quarterly results to the executive team' },
  { field: 'experienceBullet', text: 'Led an hour-long weekly design review' },
  { field: 'experienceBullet', text: 'Launched a unique referral program in Europe' },
  { field: 'experienceBullet', text: 'Ran a European user study with an MBA intern' },
  { field: 'projectBullet', text: 'Implemented OAuth login with PKCE for the mobile client' },
  { field: 'projectDescription', text: 'A budgeting app for students, built with React Native' },
  { field: 'tagline', text: 'Backend engineer focused on reliable payment systems' },
  { field: 'experienceSummary', text: 'Owned the checkout experience for a marketplace with 2M monthly buyers.' },
];

export const WEAK: CorpusEntry[] = [
  { field: 'experienceBullet', text: 'Helped with the migration of the billing system' },
  { field: 'experienceBullet', text: 'Responsible for the quarterly roadmap' },
  { field: 'experienceBullet', text: 'Responsible for managing the vendor relationships' },
  { field: 'experienceBullet', text: 'Worked on the internal analytics dashboard' },
  { field: 'experienceBullet', text: 'Was involved in the redesign of the onboarding flow' },
  { field: 'experienceBullet', text: 'Successfully launched the new pricing page' },
  { field: 'experienceBullet', text: 'Improved customer satisfaction across the support team' },
  { field: 'experienceBullet', text: 'Reduced costs for the operations team' },
  { field: 'experienceBullet', text: 'The reporting pipeline was developed by me in Python' },
  { field: 'experienceBullet', text: 'I led the the migration to Postgres' },
  { field: 'experienceBullet', text: 'led a analysis of churn drivers' },
  { field: 'experienceBullet', text: 'Built an dashboard  for the sales team' },
  { field: 'experienceBullet', text: 'Utilized SQL in order to build reports on a weekly basis' },
  { field: 'experienceBullet', text: 'Results-driven team player who is very passionate about data' },
  {
    field: 'experienceBullet',
    text: 'Coordinated with product, design, engineering, legal, finance and customer support to plan, scope, schedule and deliver the annual platform migration across three regions while keeping every existing customer integration working without any interruption for our largest enterprise accounts',
  },
  { field: 'experienceBullet', text: 'Manage the release calendar', siblings: ['Led the platform team', 'Built the deploy pipeline', 'Reduced incidents by 30%'] },
  { field: 'experienceBullet', text: 'Led the hiring process', siblings: ['Led the platform team', 'Led the incident reviews'] },
  { field: 'experienceBullet', text: 'Shipped the mobile app', siblings: ['Built the API.', 'Wrote the docs.'] },
  { field: 'experienceBullet', text: 'Shipped the mobile app.', siblings: ['Built the API', 'Wrote the docs'] },
  { field: 'tagline', text: 'very experienced product manager' },
  { field: 'experienceSummary', text: 'Due to the fact that the team was small, I was responsible for a large number of launches.' },
  { field: 'projectDescription', text: 'A tool that is able to utilize public data' },
  { field: 'projectBullet', text: 'Helped with the test suite' },
];

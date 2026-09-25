import { SAMPLE_RESUME } from '../../domain/resume/sample-data';
import { emptyResume, type ResumeData } from '../../domain/resume/types';

// ATS Readability corpus. STRONG resumes are clean and should produce no findings
// apart from what the template itself causes. Each WEAK resume carries a few real
// problems; EDGE covers empty, malformed, long and multilingual input.

const base = SAMPLE_RESUME;
const exp = base.experience[0];
const edu = base.education[0];

export const STRONG: Record<string, ResumeData> = {
  sample: base,
  engineer: {
    ...emptyResume(),
    name: 'Priya Raman',
    contact: { phone: '+44 20 7946 0958', email: 'priya.raman@mail.co.uk', location: 'London, UK', linkedin: 'linkedin.com/in/priyaraman', website: '' },
    summary: { tagline: 'Backend engineer focused on payment systems', bullets: ['Eight years building reliable APIs.'], skills: ['Go', 'PostgreSQL', 'Kubernetes', 'C++', 'C#'] },
    experience: [
      { title: 'Senior Engineer', company: 'Monzo', location: 'London', start: '2021-04', end: 'Present', summary: '', bullets: ['Cut p99 latency from 340 ms to 90 ms.', 'Led the ledger migration — zero downtime.'] },
      { title: 'Engineer', company: 'Revolut', location: 'London', start: '2017-09', end: '2021-03', summary: '', bullets: ['Built the card-issuing service (≈ 2M cards).'] },
    ],
    education: [{ degree: 'MEng Computer Science', school: 'University of Bristol', location: 'Bristol', date: '2013 – 2017', honors: 'First-class honours' }],
  },
  multilingual: {
    ...base,
    name: 'José Müller-Øster',
    contact: { ...base.contact, location: 'Zürich, Schweiz' },
    experience: [{ ...exp, company: 'Société Générale', location: 'Paris', bullets: ['Rédigé la documentation en français et en español.', 'Worked with the Tōkyō office.'] }],
  },
  arabic: { ...base, name: 'محمد عبد الله', contact: { ...base.contact, location: 'دبي' } },
  certifiedDates: {
    ...base,
    certifications: [{ name: 'AWS Solutions Architect', org: 'Amazon', date: 'Mar 2022' }],
    education: [{ ...edu, date: 'Expected May 2026' }],
  },
};

export const WEAK: Record<string, ResumeData> = {
  missingContact: { ...base, contact: { phone: '', email: 'eleanor at example dot com', location: '', linkedin: 'linkedin.com/in/eleanor vance', website: '' } },
  symbols: {
    ...base,
    name: '𝐄𝐥𝐞𝐚𝐧𝐨𝐫 𝐕𝐚𝐧𝐜𝐞',
    summary: { ...base.summary, tagline: '🚀 Product leader ★ builder', skills: ['✔ SQL', 'Figma'] },
  },
  invisible: { ...base, contact: { ...base.contact, email: 'eleanor​.vance@example.com' }, experience: [{ ...exp, title: 'Director of\nProduct', bullets: ['Grew active users­ by 45%.'] }] },
  bullets: {
    ...base,
    experience: [{ ...exp, bullets: ['• Grew active user base by 45%.', '- Managed a team of 14.', 'Managed a team of 14.', 'managed a team  of 14.', 'Line one\nline two', '1. Shipped v2'] }],
    awards: ['* Employee of the Year'],
  },
  dates: {
    ...base,
    experience: [
      { ...exp, start: 'Spring 2019', end: '' },
      { ...base.experience[1], start: '03/2021', end: 'Feb 2020' },
      { ...exp, title: 'Consultant', company: 'Self', start: '', end: '' },
    ],
    education: [{ ...edu, date: '2018 – 2014' }],
  },
  formatting: {
    ...base,
    summary: { ...base.summary, tagline: '**Product leader** with ### focus' },
    experience: [{ ...exp, summary: 'LED THE CONSUMER PRODUCT ORGANIZATION FOR THREE YEARS', bullets: ['Grew revenue!!!', 'Shipped ----- fast'] }],
  },
  entries: {
    ...base,
    experience: [exp, { ...emptyResume().experience[0], title: '', company: '', location: '', start: '', end: '', summary: '', bullets: [] }, exp, { ...exp, title: '', company: '' }],
    education: [{ degree: '', school: '', location: 'Boston', date: '2012', honors: '' }],
    projects: [{ name: '', description: 'An internal tool', bullets: [] }],
  },
  noExperience: { ...emptyResume(), name: 'Sam Lee', contact: { phone: '555 010 2030', email: 'sam@lee.dev', location: 'Austin, TX', linkedin: '', website: 'lee.dev' } },
};

export const EDGE: Record<string, ResumeData> = {
  empty: emptyResume(),
  long: { ...base, experience: Array.from({ length: 12 }, (_, i) => ({ ...exp, title: `Role ${i + 1}`, start: `${2000 + i}`, end: `${2001 + i}` })) },
  multiline: { ...base, summary: { ...base.summary, tagline: 'Product leader.\nBuilder of teams.' }, experience: [{ ...exp, summary: 'First line.\nSecond line.' }] },
  malformed: { name: 42, contact: null, summary: { bullets: 'x', skills: [1] }, experience: [{ title: 'Dev' }, null], education: {}, awards: [null, 'Award'] } as unknown as ResumeData,
  punctuation: { ...base, experience: [{ ...exp, bullets: ['Cut costs by $1.2M (≈ 18%) — twice.', 'Shipped v2.0… on time', 'Used R&D, C++ and C# at AT&T.', 'Grew NPS from 31 → 58.'] }] },
};

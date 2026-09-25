import type { ResumeData } from '../resume/types';

// Deterministic keyword match between a resume and a job description.
// No AI: it extracts the job's most repeated meaningful terms and checks which
// already appear in the resume. It never suggests adding claims to the resume.

const STOPWORDS = new Set(`a about above across after again against all also an and any are as at be because been
before being below between both but by can could did do does doing down during each either etc every few for from
further had has have having he her here hers him his how i if in into is it its itself just least less like make many
may me more most must my no nor not now of off on once only or other our ours out over own per plus role same she
should so some such than that the their them then there these they this those through to too under until up upon us
very was we well were what when where which while who whom why will with within without would you your yours
able ability across also candidate candidates company day days etc experience experienced ideal including job join
looking new opportunity position preferred required requirements responsibilities strong team teams work working
years year based help including key great good excellent within across ensure support using use`.split(/\s+/));

export interface JobMatch {
  matched: string[];
  missing: string[];
  matchPercent: number;
}

const normalize = (text: string) =>
  text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9+#./\s-]/g, ' ');

function tokens(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .map((token) => token.replace(/^[.\-/]+|[.\-/]+$/g, ''))
    .filter((token) => token.length > 1 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
}

export function resumeText(data: ResumeData): string {
  return [
    data.name,
    data.summary.tagline,
    ...data.summary.bullets,
    ...data.summary.skills,
    ...data.experience.flatMap((e) => [e.title, e.company, e.summary, ...e.bullets]),
    ...data.education.flatMap((e) => [e.degree, e.school, e.honors]),
    ...data.certifications.flatMap((c) => [c.name, c.org]),
    ...data.projects.flatMap((p) => [p.name, p.description, ...p.bullets]),
    ...data.awards,
  ].join(' ');
}

export function extractKeywords(jobDescription: string, limit = 20): string[] {
  const words = tokens(jobDescription);
  const counts = new Map<string, number>();
  const bump = (term: string, weight: number) => counts.set(term, (counts.get(term) ?? 0) + weight);
  words.forEach((word) => bump(word, 1));
  // Two-word phrases ("project management") score higher when repeated.
  for (let i = 0; i < words.length - 1; i += 1) bump(`${words[i]} ${words[i + 1]}`, 0.9);

  const ranked = [...counts.entries()]
    .filter(([term, count]) => (term.includes(' ') ? count >= 1.8 : true))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([term]) => term);

  const picked: string[] = [];
  for (const term of ranked) {
    if (picked.length >= limit) break;
    // Skip single words already covered by a chosen phrase.
    if (!term.includes(' ') && picked.some((p) => p.split(' ').includes(term))) continue;
    picked.push(term);
  }
  return picked;
}

export function matchJob(data: ResumeData, jobDescription: string): JobMatch {
  const keywords = extractKeywords(jobDescription);
  const haystack = ` ${tokens(resumeText(data)).join(' ')} `;
  const matched: string[] = [];
  const missing: string[] = [];
  for (const keyword of keywords) {
    (haystack.includes(` ${keyword} `) ? matched : missing).push(keyword);
  }
  return {
    matched,
    missing,
    matchPercent: keywords.length ? Math.round((matched.length / keywords.length) * 100) : 0,
  };
}

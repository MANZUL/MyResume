import type { ResumeData } from '../resume/types';

// Fill-in-the-blanks cover letter built only from the resume's own facts.
// Bracketed placeholders are left for the user wherever the resume has no data.

export interface CoverLetterInput {
  company: string;
  role: string;
  hiringManager: string;
}

export function buildCoverLetter(data: ResumeData, input: CoverLetterInput): string {
  const latest = data.experience[0];
  const role = input.role.trim() || '[Role]';
  const company = input.company.trim() || '[Company]';
  const greeting = input.hiringManager.trim() ? `Dear ${input.hiringManager.trim()},` : 'Dear Hiring Manager,';
  const skills = data.summary.skills.map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const highlights = [
    ...(latest?.bullets ?? []),
    ...data.summary.bullets,
  ].map((b) => b.trim()).filter(Boolean).slice(0, 2);

  const opening = latest && latest.title.trim()
    ? `I am writing to apply for the ${role} position at ${company}. In my current role as ${latest.title.trim()}${latest.company.trim() ? ` at ${latest.company.trim()}` : ''}, I have built the experience this role calls for.`
    : `I am writing to apply for the ${role} position at ${company}.`;

  const skillLine = skills.length
    ? `My strengths include ${skills.length === 1 ? skills[0] : `${skills.slice(0, -1).join(', ')} and ${skills[skills.length - 1]}`}.`
    : 'My strengths include [your most relevant strengths].';

  const highlightBlock = highlights.length
    ? `A few results I am proud of:\n${highlights.map((h) => `• ${h}`).join('\n')}`
    : 'A result I am proud of: [a specific, measurable achievement].';

  return [
    greeting,
    '',
    opening,
    '',
    `${skillLine} ${data.summary.tagline.trim() ? data.summary.tagline.trim() : ''}`.trim(),
    '',
    highlightBlock,
    '',
    `I would welcome the chance to discuss how I can contribute to ${company}. Thank you for your time and consideration.`,
    '',
    'Sincerely,',
    data.name.trim() || '[Your name]',
    [data.contact.email, data.contact.phone].map((v) => v.trim()).filter(Boolean).join(' · '),
  ].join('\n').trim();
}

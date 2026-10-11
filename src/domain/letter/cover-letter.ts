import { analysisSupport, type LanguageSupport } from '../i18n/analysis-support';
import type { Language } from '../i18n/languages';
import { parseDate } from '../ats/dates';
import type { ResumeData } from '../resume/types';

// Fill-in-the-blanks cover letter built only from the resume's own facts.
// Bracketed placeholders are left for the user wherever the resume has no data.

export interface CoverLetterInput {
  company: string;
  role: string;
  hiringManager: string;
}

export interface CoverLetter {
  text: string;
  /** The language the text is written in. English only today, whatever the resume's language. */
  writtenIn: Language;
  support: LanguageSupport;
}

/**
 * A draft letter for a resume in `language`. The letter templates exist in English only,
 * so non-English resumes get an English draft, reported explicitly (never mislabelled).
 */
export function generateCoverLetter(data: ResumeData, language: Language, input: CoverLetterInput): CoverLetter {
  const support = analysisSupport('coverLetter', language);
  return { text: englishLetter(data, input), writtenIn: 'en', support };
}

export type RoleStatus = 'current' | 'ended' | 'unknown';

// Words a person writes in an end-date field to say "still here" (English and the other
// launch languages' own words). Only an explicit word counts; an empty field is not one.
const CURRENT_WORDS = new Set([
  'present', 'current', 'currently', 'now', 'today', 'ongoing',
  'heute', 'aktuell', 'derzeit', 'gegenwart',
  'présent', 'actuel', 'actuellement', 'aujourd’hui', "aujourd'hui", 'en cours',
  'actualidad', 'actualmente', 'actual', 'presente', 'hoy', 'en curso',
  'الحاضر', 'حاليا', 'حاليًا', 'الآن', 'الان', 'مستمر',
]);
const MONTH_NAME = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]{0,6}\.?$/i;
const validYear = (y: number) => y >= 1950 && y <= 2100;

/** A complete date (day, month and year) in a common written form; unknown forms return false. */
function isFullDate(value: string): boolean {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (m) return validYear(Number(m[1])) && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31;
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    const monthFirst = a >= 1 && a <= 12 && b >= 1 && b <= 31;
    const dayFirst = b >= 1 && b <= 12 && a >= 1 && a <= 31;
    return validYear(Number(m[3])) && (monthFirst || dayFirst);
  }
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}\.?)\s+(\d{4})$/.exec(value) ?? /^([A-Za-z]{3,9}\.?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(value);
  if (!m) return false;
  const [day, month, year] = /^\d/.test(m[1]) ? [m[1], m[2], m[3]] : [m[2], m[1], m[3]];
  return MONTH_NAME.test(month) && Number(day) >= 1 && Number(day) <= 31 && validYear(Number(year));
}

/**
 * Whether the role whose end-date field is `end` is still held, from that field alone:
 *  - an explicit "Present" style word → 'current';
 *  - a valid end date (a year, month and year, or a full date) → 'ended';
 *  - an empty or unrecognized field → 'unknown' (no claim either way; nothing is inferred from
 *    other fields, and the current date is never consulted, so the result is deterministic).
 */
export function roleStatus(end: string): RoleStatus {
  const value = end.trim().replace(/[.\s]+$/, '');
  if (!value) return 'unknown';
  if (CURRENT_WORDS.has(value.toLowerCase())) return 'current';
  const parsed = parseDate(value);
  if (parsed) return parsed.style === 'present' ? 'current' : 'ended';
  return isFullDate(value) ? 'ended' : 'unknown';
}

function englishLetter(data: ResumeData, input: CoverLetterInput): string {
  const latest = data.experience[0];
  const role = input.role.trim() || '[Role]';
  const company = input.company.trim() || '[Company]';
  const greeting = input.hiringManager.trim() ? `Dear ${input.hiringManager.trim()},` : 'Dear Hiring Manager,';
  const skills = data.summary.skills.map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const highlights = [
    ...(latest?.bullets ?? []),
    ...data.summary.bullets,
  ].map((b) => b.trim()).filter(Boolean).slice(0, 2);

  const apply = `I am writing to apply for the ${role} position at ${company}.`;
  const latestRole = latest && latest.title.trim()
    ? `${latest.title.trim()}${latest.company.trim() ? ` at ${latest.company.trim()}` : ''}`
    : '';
  // The wording follows what the end-date field says: only an explicit "Present" is "current".
  const status = latest ? roleStatus(latest.end) : 'unknown';
  const opening = !latestRole
    ? apply
    : status === 'current'
      ? `${apply} In my current role as ${latestRole}, I have built the experience this role calls for.`
      : status === 'ended'
        ? `${apply} Previously, as ${latestRole}, I built the experience this role calls for.`
        : `${apply} My background includes work as ${latestRole}, where I built the experience this role calls for.`;

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

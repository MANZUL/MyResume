import { describe, expect, it } from 'vitest';
import { generateCoverLetter, roleStatus } from '../domain/letter/cover-letter';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import { emptyResume, type Experience, type ResumeData } from '../domain/resume/types';
import { ARABIC_RESUME } from './fixtures/arabic-resume';

// Phase 15: the letter only says "current role" when the end-date field explicitly says so.
// Nothing is inferred from other fields or from today's date.

const role = (end: string, title = 'Operations Manager', company = 'Northwind'): Experience => ({
  title, company, location: '', start: 'Jan 2018', end, summary: '', bullets: ['Led a team of 12.'],
});
const letterFor = (experience: Experience[]) => {
  const data: ResumeData = { ...emptyResume(), name: 'Jane Doe', experience };
  return generateCoverLetter(data, 'en', { company: 'Globex', role: 'VP Operations', hiringManager: '' }).text;
};
const OPENING = 'I am writing to apply for the VP Operations position at Globex.';

describe('cover letter wording follows the role status', () => {
  it('1. an explicitly current role keeps the current-role wording', () => {
    for (const end of ['Present', 'present', 'Current', 'Now', 'Ongoing', ' Present ']) {
      expect(letterFor([role(end)]), end).toContain(`${OPENING} In my current role as Operations Manager at Northwind, I have built the experience this role calls for.`);
    }
    // The sample resume's latest role is current.
    expect(SAMPLE_RESUME.experience[0].end).toBe('Present');
    expect(generateCoverLetter(SAMPLE_RESUME, 'en', { company: 'Globex', role: 'VP Product', hiringManager: '' }).text).toContain('In my current role as Director of Product at Acme Innovation Labs');
  });

  it('2. an ended role with a year is never called current', () => {
    const letter = letterFor([role('2019')]);
    expect(letter).not.toContain('current role');
    expect(letter).toContain(`${OPENING} Previously, as Operations Manager at Northwind, I built the experience this role calls for.`);
  });

  it('2b. month-and-year end dates in common formats are ended too', () => {
    for (const end of ['Mar 2021', 'March 2021', '03/2021', '2021-03']) expect(letterFor([role(end)]), end).toContain('Previously, as');
  });

  it('3. an ended role with a full date is never called current', () => {
    for (const end of ['2021-03-15', '15 March 2021', 'March 15, 2021', '15/03/2021', '03/15/2021', '3.15.2021', '1st Mar 2021']) {
      const letter = letterFor([role(end)]);
      expect(letter, end).not.toContain('current role');
      expect(letter, end).toContain('Previously, as Operations Manager at Northwind');
    }
  });

  it('4. a missing end date with no explicit current marker gets neutral wording: no "current", no "previously"', () => {
    for (const end of ['', '   ']) {
      const letter = letterFor([role(end)]);
      expect(letter).not.toMatch(/current role|Previously/);
      expect(letter).toContain(`${OPENING} My background includes work as Operations Manager at Northwind, where I built the experience this role calls for.`);
    }
    // An end value that is not a recognized date is not guessed at either.
    for (const end of ['soon', 'TBD', 'Q3', '15 März 2021', 'Expected 2030']) {
      expect(letterFor([role(end)]), end).not.toMatch(/current role|Previously/);
    }
  });

  it('5. no experience entries: the plain opening, no role claimed', () => {
    const letter = letterFor([]);
    expect(letter).toContain(OPENING);
    expect(letter).not.toMatch(/current role|Previously|My background includes/);
    // A role with no title claims nothing either.
    expect(letterFor([role('Present', '')])).not.toMatch(/current role|Previously|My background includes/);
  });

  it('6. several roles: the wording follows the first (latest) entry only, even when an older entry says Present', () => {
    const letter = letterFor([role('2020', 'Senior Analyst', 'Initech'), role('Present', 'Analyst', 'Hooli')]);
    expect(letter).toContain('Previously, as Senior Analyst at Initech');
    expect(letter).not.toContain('current role');
    expect(letter).not.toContain('Hooli');
    const current = letterFor([role('Present', 'Senior Analyst', 'Initech'), role('2018', 'Analyst', 'Hooli')]);
    expect(current).toContain('In my current role as Senior Analyst at Initech');
  });

  it('a role without a company is worded without " at"', () => {
    expect(letterFor([role('2019', 'Consultant', '')])).toContain('Previously, as Consultant, I built');
  });

  it('nothing is invented: no dates and no facts beyond the resume appear in the opening', () => {
    const letter = letterFor([role('2019')]);
    expect(letter).not.toMatch(/\b(19|20)\d\d\b/);
    expect(letter).toContain('Led a team of 12.');
  });

  it('is deterministic: the same input gives the same letter, and today\'s date is never consulted', () => {
    const experience = [role('2031')]; // a future year is still "a valid end date" (not "current")
    expect(letterFor(experience)).toBe(letterFor(experience));
    expect(letterFor(experience)).toContain('Previously, as');
  });
});

describe('roleStatus', () => {
  it('reads only the end-date field', () => {
    expect(roleStatus('Present')).toBe('current');
    expect(roleStatus('heute')).toBe('current');
    expect(roleStatus('Aujourd’hui')).toBe('current');
    expect(roleStatus('Actualidad')).toBe('current');
    expect(roleStatus('الحاضر')).toBe('current');
    expect(roleStatus('2019')).toBe('ended');
    expect(roleStatus('Dec 2020')).toBe('ended');
    expect(roleStatus('2020-12-31')).toBe('ended');
    expect(roleStatus('')).toBe('unknown');
    expect(roleStatus('whenever')).toBe('unknown');
    expect(roleStatus('1850')).toBe('unknown'); // not a plausible year
    expect(roleStatus('31/31/2020')).toBe('unknown'); // not a date
  });
});

describe('language handling is unchanged', () => {
  it('the body stays English for every resume language, with the existing disclosure (no Arabic generation is claimed)', () => {
    const draft = generateCoverLetter(ARABIC_RESUME, 'ar', { company: 'Globex', role: 'Engineer', hiringManager: '' });
    expect(draft.writtenIn).toBe('en');
    expect(draft.support.kind).toBe('english-rules');
    expect(draft.text).toMatch(/^Dear Hiring Manager,/);
    expect(draft.text).toContain('I am writing to apply for the Engineer position at Globex.');
    const german = generateCoverLetter({ ...SAMPLE_RESUME }, 'de', { company: 'Globex', role: 'Engineer', hiringManager: '' });
    expect(german.writtenIn).toBe('en');
    expect(german.support.kind).toBe('english-rules');
  });
});

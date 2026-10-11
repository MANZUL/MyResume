import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_CHARS, ImportTooLongError, isImportable } from '../domain/parse/import-limits';
import { parseResumeText } from '../domain/parse/parse-text';
import { ARABIC_RESUME } from './fixtures/arabic-resume';

// Phase 15: pasted text has a documented limit, enforced by the screen and by the parser, and
// no input within the limit can make the parser do quadratic work. Before this phase one
// 200,000-character word took about 52 seconds.

const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');
const timed = <T,>(fn: () => T): { value: T; ms: number } => {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
};

const NORMAL = `Jane Doe
jane.doe@example.com | (555) 123-4567 | Austin, TX | linkedin.com/in/janedoe

SUMMARY
Operations leader focused on reliable delivery.

EXPERIENCE
Operations Manager — Northwind Logistics   Jan 2021 – Present
• Led a team of 12 across two warehouses.
• Reduced late shipments by 30%.

EDUCATION
Bachelor of Science in Business, University of Texas  2017

SKILLS
Lean, Six Sigma, Inventory planning, Excel
`;

describe('import size limit', () => {
  it('is 30,000 characters: far above a real resume, above the 25,000-character job description limit', () => {
    expect(IMPORT_MAX_CHARS).toBe(30_000);
    expect(NORMAL.length).toBeLessThan(IMPORT_MAX_CHARS / 20);
  });

  it('empty input still returns an empty resume', () => {
    expect(parseResumeText('', 'en').experience).toEqual([]);
    expect(parseResumeText('   \n\n', 'en').name).toBe('');
  });

  it('a normal resume parses exactly as before', () => {
    const resume = parseResumeText(NORMAL, 'en');
    expect(resume.name).toBe('Jane Doe');
    expect(resume.contact.email).toBe('jane.doe@example.com');
    expect(resume.contact.phone).toBe('(555) 123-4567');
    expect(resume.contact.linkedin).toBe('linkedin.com/in/janedoe');
    expect(resume.experience[0]).toMatchObject({ title: 'Operations Manager', company: 'Northwind Logistics', start: 'Jan 2021', end: 'Present' });
    expect(resume.experience[0].bullets).toHaveLength(2);
    expect(resume.education[0].school).toBe('University of Texas');
    expect(resume.summary.skills).toEqual(['Lean', 'Six Sigma', 'Inventory planning', 'Excel']);
  });

  it('text exactly at the maximum is accepted; one character more is refused, never truncated', () => {
    const atMax = `${NORMAL}${'filler line of text\n'.repeat(2000)}`.slice(0, IMPORT_MAX_CHARS);
    expect(atMax).toHaveLength(IMPORT_MAX_CHARS);
    expect(isImportable(atMax)).toBe(true);
    expect(() => parseResumeText(atMax, 'en')).not.toThrow();
    const over = `${atMax}x`;
    expect(isImportable(over)).toBe(false);
    expect(() => parseResumeText(over, 'en')).toThrow(ImportTooLongError);
    try {
      parseResumeText(over, 'en');
    } catch (error) {
      expect((error as ImportTooLongError).max).toBe(IMPORT_MAX_CHARS);
    }
  });

  it('the pathological 200,000-character single word is refused immediately', () => {
    const { ms } = timed(() => expect(() => parseResumeText('x'.repeat(200_000), 'en')).toThrow(ImportTooLongError));
    expect(ms).toBeLessThan(50);
  });

  it('very long unbroken tokens within the limit are processed in a small, linear amount of time', () => {
    const N = IMPORT_MAX_CHARS - 100;
    const families: Record<string, string> = {
      letters: 'x'.repeat(N),
      digits: '1'.repeat(N),
      dots: 'a.'.repeat(N / 2),
      dashes: '-'.repeat(N),
      month: 'jan'.repeat(N / 3),
      at: 'a@'.repeat(N / 2),
      www: 'www.'.repeat(N / 4),
      plus: '+1'.repeat(N / 2),
      parens: '('.repeat(N),
      arabic: 'م'.repeat(N),
      spacesBetweenWords: `a${' '.repeat(N - 2)}b`,
      heading: `EXPERIENCE\nJob${' '.repeat(N - 20)}| x`,
      skills: `SKILLS\na${' '.repeat(N - 10)}b`,
      projects: `PROJECTS\na${' '.repeat(N - 12)}- b`,
      education: `EDUCATION\n${'a '.repeat((N - 10) / 2)}`,
      longLines: `${`${'x'.repeat(500)}\n`.repeat(N / 501)}`,
      dateish: 'EXPERIENCE\n' + 'Jan 2020 - Dec 2021 '.repeat((N - 12) / 20),
    };
    for (const [name, text] of Object.entries(families)) {
      const { ms } = timed(() => parseResumeText(text, 'en'));
      // Measured: 0 to 6 ms for each. The bound is generous so a slow machine never flakes,
      // and still orders of magnitude below the old quadratic behavior (about 900 ms at this size).
      expect(ms, name).toBeLessThan(300);
    }
  });

  it('Unicode and Arabic text: counted as typed, parsed without error, English headings still found in mixed text', () => {
    const arabic = `${ARABIC_RESUME.name}\nmohamed.ahmed@example.com\n\nEXPERIENCE\nمهندس برمجيات — شركة الأفق  2015 – 2020\n• تطوير محرك رسوميات`;
    const resume = parseResumeText(arabic, 'ar');
    expect(resume.name).toBe('محمد أحمد');
    expect(resume.contact.email).toBe('mohamed.ahmed@example.com');
    expect(resume.experience).toHaveLength(1);
    expect(resume.experience[0].bullets).toEqual(['تطوير محرك رسوميات']);
    // Emoji count as two units each; the limit is on the typed length.
    expect(isImportable('😀'.repeat(IMPORT_MAX_CHARS / 2))).toBe(true);
    expect(isImportable('😀'.repeat(IMPORT_MAX_CHARS / 2 + 1))).toBe(false);
    const { ms } = timed(() => parseResumeText('محمد أحمد مهندس برمجيات '.repeat(1200), 'ar'));
    expect(ms).toBeLessThan(300);
  });

  it('line breaks and punctuation: CRLF, lone CR, tabs and mixed separators', () => {
    const crlf = NORMAL.replace(/\n/g, '\r\n');
    expect(JSON.stringify(parseResumeText(crlf, 'en'))).toBe(JSON.stringify(parseResumeText(NORMAL, 'en')));
    expect(parseResumeText('Jane Doe\r\rjane@example.com\r', 'en').contact.email).toBe('jane@example.com');
    expect(parseResumeText('Jane Doe\n\tjane@example.com\t|\t555 123 4567', 'en').contact.email).toBe('jane@example.com');
    expect(() => parseResumeText(';;;|||,,,---•••\n\n\n!!!???', 'en')).not.toThrow();
  });

  it('runs of five or more spaces are read like four (whitespace only); results are otherwise identical', () => {
    const spaced = NORMAL.replace('Operations Manager — Northwind Logistics   Jan', 'Operations Manager — Northwind Logistics           Jan');
    expect(JSON.stringify(parseResumeText(spaced, 'en'))).toBe(JSON.stringify(parseResumeText(NORMAL, 'en')));
  });

  it('malformed but bounded input never throws and finishes quickly (seeded random fuzz)', () => {
    let seed = 12345;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const alphabet = ['a', 'Z', '1', '9', ' ', '  ', '\n', '\r\n', '\t', '@', '.', ',', ';', '|', '-', '–', '•', '(', ')', '+', '/', '://', 'Jan ', '2020', 'EXPERIENCE\n', 'Skills\n', 'م', '😀', '‮', '\u0000'];
    const start = performance.now();
    for (let i = 0; i < 300; i += 1) {
      const text = Array.from({ length: 50 + Math.floor(random() * 400) }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
      expect(() => parseResumeText(text, 'en'), JSON.stringify(text)).not.toThrow();
    }
    expect(performance.now() - start).toBeLessThan(3000);
  });

  it('the screen enforces the same limit: it tells the user, disables Import, never truncates', () => {
    const screen = read('features/import/ImportScreen.tsx');
    expect(screen).toMatch(/const tooLong = !isImportable\(text\);/);
    expect(screen).toMatch(/t\('import\.tooLong', \{ max: IMPORT_MAX_CHARS \}\)/);
    expect(screen).toMatch(/disabled=\{text\.trim\(\)\.length < 20 \|\| tooLong\}/);
    expect(screen).not.toMatch(/maxLength=/); // a maxLength would cut pasted text off silently
  });

  it('the parser enforces it regardless of the screen', () => {
    expect(read('domain/parse/parse-text.ts')).toMatch(/if \(!isImportable\(raw\)\) throw new ImportTooLongError\(\);/);
  });

  it('the documented behavior with other languages is unchanged: English headings only', () => {
    expect(parseResumeText('Max Mustermann\nEXPERIENCE\nProduktmanager — Acme  Jan 2020 – Present', 'de').experience).toHaveLength(1);
  });
});

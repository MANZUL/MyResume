import { describe, expect, it } from 'vitest';
import { detectSection, parseResumeText } from '../domain/parse/parse-text';

const SAMPLE = `Jane Doe
jane.doe@example.com | (555) 123-4567 | Austin, TX | linkedin.com/in/janedoe

SUMMARY
Operations leader focused on reliable delivery.
• Cut fulfilment cost 18% in two years.

EXPERIENCE
Operations Manager — Northwind Logistics   Jan 2021 – Present
• Led a team of 12 across two warehouses.
• Reduced late shipments by 30%.
Shift Supervisor, Contoso Retail, Dallas, TX  Jun 2017 - Dec 2020
• Scheduled 40 staff weekly.

EDUCATION
Bachelor of Science in Business, University of Texas  2017
Magna Cum Laude

SKILLS
Lean, Six Sigma, Inventory planning, Excel

CERTIFICATIONS
Certified Supply Chain Professional — APICS 2020

AWARDS
• Employee of the Year (2022)
`;

describe('parseResumeText (offline, no AI)', () => {
  const parsed = parseResumeText(SAMPLE);

  it('extracts name and contact details', () => {
    expect(parsed.name).toBe('Jane Doe');
    expect(parsed.contact.email).toBe('jane.doe@example.com');
    expect(parsed.contact.phone).toBe('(555) 123-4567');
    expect(parsed.contact.location).toBe('Austin, TX');
    expect(parsed.contact.linkedin).toBe('linkedin.com/in/janedoe');
  });

  it('splits experience into roles with dates and bullets', () => {
    expect(parsed.experience).toHaveLength(2);
    expect(parsed.experience[0]).toMatchObject({
      title: 'Operations Manager',
      company: 'Northwind Logistics',
      start: 'Jan 2021',
      end: 'Present',
    });
    expect(parsed.experience[0].bullets).toEqual(['Led a team of 12 across two warehouses.', 'Reduced late shipments by 30%.']);
    expect(parsed.experience[1]).toMatchObject({ title: 'Shift Supervisor', company: 'Contoso Retail', start: 'Jun 2017', end: 'Dec 2020' });
  });

  it('parses summary, skills, education, certifications and awards', () => {
    expect(parsed.summary.tagline).toBe('Operations leader focused on reliable delivery.');
    expect(parsed.summary.bullets).toEqual(['Cut fulfilment cost 18% in two years.']);
    expect(parsed.summary.skills).toEqual(['Lean', 'Six Sigma', 'Inventory planning', 'Excel']);
    expect(parsed.education[0]).toMatchObject({ degree: 'Bachelor of Science in Business', school: 'University of Texas', date: '2017', honors: 'Magna Cum Laude' });
    expect(parsed.certifications[0]).toMatchObject({ name: 'Certified Supply Chain Professional', org: 'APICS', date: '2020' });
    expect(parsed.awards).toEqual(['Employee of the Year (2022)']);
  });

  it('never invents text that is not in the source', () => {
    const collect = (value: unknown): string[] =>
      typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(collect) : value && typeof value === 'object' ? Object.values(value).flatMap(collect) : [];
    for (const text of collect(parsed).filter(Boolean)) {
      expect(SAMPLE).toContain(text);
    }
  });

  it('handles empty input', () => {
    expect(parseResumeText('').experience).toEqual([]);
  });

  it('recognizes common headings', () => {
    expect(detectSection('Work History:')).toBe('experience');
    expect(detectSection('Licenses & Certifications')).toBe('certifications');
    expect(detectSection('Led a team of 12')).toBeNull();
  });
});

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import JSZip from 'jszip';
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkAtsReadability } from '../domain/ats/ats';
import { isOrdered, parseDate, parseDateField } from '../domain/ats/dates';
import { templateTextFacts } from '../domain/ats/template-facts';
import type { AtsReport, AtsRuleId } from '../domain/ats/types';
import { buildResumeDocxBase64 } from '../domain/render/export-docx';
import { EDITOR_SECTIONS } from '../domain/resume/sections';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import { emptyResume, type ResumeData } from '../domain/resume/types';
import { TEMPLATES } from '../domain/templates/templates';
import { ATS_COPY, countsLine, STATUS_LABELS } from '../features/ats/ats-copy';
import { pdfHtml } from '../services/export/file-export-platform';
import { EDGE, STRONG, WEAK } from './fixtures/ats-corpus';

const SRC = join(__dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');
/** Template without letter-spacing, so template-text findings do not mix into rule tests. */
const PLAIN = 'tech-architect';

const report = (data: ResumeData, templateId = PLAIN) => checkAtsReadability(data, templateId);
const findingsOf = (rule: AtsRuleId, data: ResumeData, templateId = PLAIN) =>
  report(data, templateId).checks.find((c) => c.rule === rule)!.findings;
const messages = (rule: AtsRuleId, data: ResumeData) => findingsOf(rule, data).map((f) => `${f.status}: ${f.message}`);
const base = SAMPLE_RESUME;
const exp = base.experience[0];
const withContact = (contact: Partial<ResumeData['contact']>, name = base.name): ResumeData => ({ ...base, name, contact: { ...base.contact, ...contact } });
const withBullets = (bullets: string[]): ResumeData => ({ ...base, experience: [{ ...exp, bullets }] });
const withTagline = (tagline: string): ResumeData => ({ ...base, summary: { ...base.summary, tagline } });

// --- 1. rules: positive, negative, borderline, false positives ---

describe('contact', () => {
  it('positive: missing or malformed details', () => {
    expect(messages('contact', withContact({ email: '' }))).toEqual(['issue: No email address detected.']);
    expect(messages('contact', withContact({ email: 'eleanor at example dot com' }))).toEqual(['issue: "eleanor at example dot com" does not look like an email address.']);
    expect(messages('contact', withContact({}, ''))).toEqual(['issue: No name detected.']);
    expect(messages('contact', withContact({ phone: '' }))[0]).toBe('check: No phone number detected.');
    expect(messages('contact', withContact({ phone: '555-CALL-NOW' }))[0]).toMatch(/may not be read as a phone number/);
    expect(messages('contact', withContact({ phone: '12345' }))[0]).toMatch(/may not be read as a phone number/);
    expect(messages('contact', withContact({ linkedin: 'linkedin.com/in/eleanor vance' }))[0]).toMatch(/^issue: The LinkedIn address contains a space/);
  });

  it('negative: common valid formats', () => {
    for (const phone of ['(555) 123-4567', '+44 20 7946 0958', '555.123.4567', '+1 555 123 4567 ext. 89', '555 010 2030']) {
      expect(messages('contact', withContact({ phone })), phone).toEqual([]);
    }
    for (const email of ['a+b@x.io', 'first.last@sub.example.co.uk']) expect(messages('contact', withContact({ email })), email).toEqual([]);
    for (const linkedin of ['https://www.linkedin.com/in/x', 'linkedin.com/in/eleanor-vance']) expect(messages('contact', withContact({ linkedin })), linkedin).toEqual([]);
  });

  it('borderline and false-positive guards: names with titles, suffixes and non-Latin scripts are fine', () => {
    for (const name of ['Dr. Eleanor Vance, PhD', 'Eleanor Vance III', "Siobhán O'Neill-Ó Briain", 'محمد عبد الله', '王小明']) {
      expect(messages('contact', withContact({}, name)), name).toEqual([]);
    }
    expect(messages('contact', withContact({}, 'Eleanor Vance 2'))[0]).toMatch(/^check: The name .* contains digits/);
    expect(messages('contact', withContact({ website: 'localhost' }))[0]).toMatch(/does not look like a web address/);
  });

  it('detections', () => {
    expect(report(base).detected.slice(0, 5)).toEqual([
      { label: 'Name', detected: true }, { label: 'Email', detected: true }, { label: 'Phone', detected: true },
      { label: 'Location', detected: true }, { label: 'LinkedIn or website', detected: true },
    ]);
    expect(report(emptyResume()).detected.slice(0, 5).every((d) => !d.detected)).toBe(true);
  });
});

describe('sections', () => {
  it('reports missing core sections; standard headings otherwise', () => {
    expect(messages('sections', { ...base, experience: [] })).toEqual(['issue: No Experience section detected. Most ATS expect one; add your roles if you have any.']);
    expect(messages('sections', { ...base, education: [] })).toEqual(['check: No Education section detected.']);
    expect(messages('sections', { ...base, summary: { ...base.summary, skills: [] } })).toEqual(['check: No skills listed; keyword searches often look for them.']);
    expect(report(base).checks.find((c) => c.rule === 'sections')!.summary).toBe(
      'Headings use standard names (Summary, Experience, Education, Certifications, Projects, Awards) as plain text.',
    );
  });

  it('borderline: an entry with only whitespace does not count as a section', () => {
    expect(messages('sections', { ...base, experience: [{ ...exp, title: ' ', company: '', summary: '', bullets: ['  '] }] })[0]).toMatch(/No Experience section/);
    const detected = report(base).detected.filter((d) => d.label.endsWith('section'));
    expect(detected.map((d) => `${d.label}:${d.detected}`)).toEqual([
      'Summary section:true', 'Skills section:true', 'Experience section:true', 'Education section:true',
      'Certifications section:true', 'Projects section:true', 'Awards section:true',
    ]);
  });
});

describe('template text (letter-spacing)', () => {
  it('flags letter-spaced name and/or headings per template, and recommends the Word export', () => {
    const byTemplate = Object.fromEntries(TEMPLATES.map((t) => [t.id, findingsOf('template-text', base, t.id).map((f) => f.message)]));
    const flagged = Object.entries(byTemplate).filter(([, m]) => m.length).map(([id]) => id).sort();
    expect(flagged).toEqual([
      'academic-researcher', 'academic-scholar', 'corporate-boardroom', 'corporate-partner', 'creative-editorial',
      'healthcare-educator', 'tech-builder', 'trades-foreman', 'trades-operator',
    ]);
    expect(byTemplate['trades-foreman'][0]).toMatch(/letter-spaced name and section headings/);
    expect(byTemplate['corporate-boardroom'][0]).toMatch(/letter-spaced name can/);
    expect(byTemplate['tech-builder'][0]).toMatch(/letter-spaced section headings can/);
    expect(byTemplate['tech-builder'][0]).toMatch(/Word \(DOCX\) export keeps them as whole words/);
    expect(byTemplate[PLAIN]).toEqual([]);
  });
});

describe('layout', () => {
  it('is readable for every template; the split header says it is read in order', () => {
    for (const t of TEMPLATES) expect(report(base, t.id).checks.find((c) => c.rule === 'layout')!.status, t.id).toBe('readable');
    expect(report(base, 'creative-editorial').checks.find((c) => c.rule === 'layout')!.summary).toMatch(/side by side, and are read in order/);
  });
});

describe('characters', () => {
  it('positive: emoji, icon-font, fancy letters, dingbats, broken characters', () => {
    expect(messages('characters', withTagline('🚀 Product leader'))).toEqual(['issue: Contains an emoji: "🚀" (U+1F680).']);
    expect(messages('characters', withTagline('Product leader '))).toEqual(['issue: Contains an icon-font character: "" (U+F0B7).']);
    expect(messages('characters', withContact({}, '𝐄𝐥𝐞𝐚𝐧𝐨𝐫 Vance'))[0]).toMatch(/^issue: Contains styled "fancy" letters/);
    expect(messages('characters', withTagline('Product ★ leader'))).toEqual(['check: Contains a decorative symbol: "★" (U+2605).']);
    expect(messages('characters', withTagline('Product � leader'))[0]).toMatch(/^issue: Contains a broken character/);
    expect(messages('characters', withTagline('ＡＢＣ corp'))[0]).toMatch(/^check: Contains full-width characters/);
  });

  it('negative and false-positive guards: accents, other scripts, typography and common symbols are fine', () => {
    for (const text of [
      'José Müller — Zürich', 'Rédigé en français', 'محمد', '東京オフィス', 'Cut costs by $1.2M (≈ 18%) — twice…',
      'NPS 31 → 58', 'Microsoft® Excel™ © 2020', '“Quoted” ‘text’', '98.6 °F', 'Skills • SQL • Figma', 'C++ and C#',
    ]) {
      expect(messages('characters', withTagline(text)), text).toEqual([]);
    }
  });

  it('one finding per field', () => {
    expect(findingsOf('characters', withTagline('🚀 ★ 🎯'))).toHaveLength(1);
  });
});

describe('invisible characters', () => {
  it('positive: zero-width space, soft hyphen, BOM, control characters, line separators', () => {
    for (const [char, name] of [['​', 'U+200B'], ['­', 'U+00AD'], ['﻿', 'U+FEFF'], ['\u0007', 'U+0007'], [' ', 'U+2028']]) {
      expect(messages('invisible', withTagline(`Product${char}leader`)), name).toEqual([`issue: Contains an invisible character (${name}) that can split a word for keyword searches.`]);
    }
    expect(messages('invisible', { ...base, experience: [{ ...exp, title: 'Director of\nProduct' }] })).toEqual(['check: Contains a line break in a one-line field.']);
  });

  it('negative: line breaks in paragraphs, tabs, and joiners used by some scripts are fine', () => {
    expect(messages('invisible', withTagline('Line one\nLine two'))).toEqual([]);
    expect(messages('invisible', withTagline('a\tb'))).toEqual([]);
    expect(messages('invisible', withTagline('می‌خواهم'))).toEqual([]); // ZWNJ is part of Persian spelling
  });
});

describe('bullets', () => {
  it('positive: manual bullet characters, numbering, line breaks, repeats', () => {
    expect(messages('bullets', withBullets(['• Grew users', '- Managed 14', '– Shipped', '1. Built', '2) Ran', '* Led']))).toHaveLength(6);
    expect(messages('bullets', withBullets(['Line one\nline two']))).toEqual(['check: Contains a line break; it will be joined into one line.']);
    expect(messages('bullets', withBullets(['Managed a team of 14.', 'managed a team  of 14.']))).toEqual(['check: Repeats experience 1 · accomplishment 1.']);
    expect(messages('bullets', withBullets(['- Managed a team', 'Managed a team']))).toContain('check: Repeats experience 1 · accomplishment 1.');
  });

  it('negative and false-positive guards: numbers, symbols and hyphens that are content', () => {
    for (const bullet of ['> 99.9% uptime across regions', '-3% churn after the redesign', '3.5M users served', '10x faster builds', 'Re-architected the API', '#1 in regional sales']) {
      expect(messages('bullets', withBullets([bullet])), bullet).toEqual([]);
    }
    // The same bullet in two different roles is not a repeat.
    expect(messages('bullets', { ...base, experience: [{ ...exp, bullets: ['Built A'] }, { ...exp, title: 'Other', bullets: ['Built A'] }] })).toEqual([]);
  });
});

describe('dates', () => {
  it('grammar: recognized formats', () => {
    for (const d of ['Mar 2020', 'March 2020', 'Sept 2019', 'Sep. 2019', '03/2020', '3/2020', '2020-03', '2020', 'Present', 'current']) {
      expect(parseDate(d), d).not.toBeNull();
    }
    for (const d of ['Spring 2019', "'19", 'last year', '2020ish', '13/2020', '2020-13', 'Mayo 2020', '1890', '31/12/2020', '']) {
      expect(parseDate(d), d).toBeNull();
    }
    expect(parseDateField('2014 – 2016')!.map((d) => d.style)).toEqual(['year', 'year']);
    expect(parseDateField('Jan 2020 - Mar 2021')).toHaveLength(2);
    expect(parseDateField('2019–2021')).toHaveLength(2);
    expect(parseDateField('Expected May 2026')).toHaveLength(1);
    expect(parseDateField('2020-03')!.map((d) => d.style)).toEqual(['numeric']);
    expect(isOrdered(parseDate('Mar 2020')!, parseDate('2020')!)).toBe(true); // year-only compares by year
    expect(isOrdered(parseDate('2021')!, parseDate('Present')!)).toBe(true);
  });

  it('positive: unrecognized, missing, reversed, mixed', () => {
    const at = (start: string, end: string) => messages('dates', { ...base, experience: [{ ...exp, start, end }] });
    expect(at('Spring 2019', 'Present')[0]).toMatch(/"Spring 2019" is not a date format/);
    expect(at('Mar 2020', '')).toEqual(['check: No end date. Write "Present" if this is your current role.']);
    expect(at('', 'Mar 2020')).toEqual(['check: No start date.']);
    expect(at('', '')).toEqual(['check: No dates for this role.']);
    expect(at('Mar 2021', 'Feb 2020')).toEqual(['check: The start date is after the end date.']);
    expect(at('03/2020', 'Feb 2021')).toContain('check: Dates mix month names ("Mar 2020") and numbers ("03/2020"); one style is easier to read consistently.');
    expect(messages('dates', { ...base, education: [{ ...base.education[0], date: '2018 – 2014' }] })).toContain('check: The dates are in reverse order.');
  });

  it('negative: consistent, ordered, optional dates', () => {
    expect(messages('dates', base)).toEqual([]);
    expect(messages('dates', { ...base, experience: [{ ...exp, start: '2019', end: 'Present' }] })).toEqual([]);
    expect(messages('dates', { ...base, experience: [{ ...exp, start: 'Mar 2020', end: '2021' }] })).toEqual([]); // year-only is not "numeric"
    expect(messages('dates', { ...base, certifications: [{ name: 'PMP', org: 'PMI', date: '' }] })).toEqual([]); // optional
    expect(messages('dates', { ...base, experience: [{ ...exp, title: '', company: '', start: '', end: '' }] })).toEqual([]); // untitled entries belong to "entries"
  });
});

describe('formatting', () => {
  it('positive: markdown marks, decorative punctuation, all-capital prose', () => {
    expect(messages('formatting', withTagline('**Product leader** at scale'))[0]).toMatch(/formatting marks/);
    expect(messages('formatting', withTagline('## Summary'))[0]).toMatch(/formatting marks/);
    expect(messages('formatting', withTagline('__Product leader__ at scale'))).toEqual([]); // "__x__" is not checked (see rule)
    expect(messages('formatting', withTagline('Grew revenue!!!'))[0]).toMatch(/repeated punctuation/);
    expect(messages('formatting', withTagline('Shipped ----- fast'))[0]).toMatch(/repeated punctuation/);
    expect(messages('formatting', withTagline('LED THE CONSUMER PRODUCT ORGANIZATION'))[0]).toMatch(/all capitals/);
  });

  it('negative and false-positive guards', () => {
    for (const text of [
      'Maintained __init__ hooks in Python', 'C# and F# developer', '#1 in regional sales', 'Wait... it shipped', 'Led AWS, GCP and SQL work',
      'NASA JPL', 'Used C++ daily', 'R&D lead',
    ]) {
      expect(messages('formatting', withTagline(text)), text).toEqual([]);
    }
    expect(messages('formatting', { ...base, summary: { ...base.summary, skills: ['AWS CLOUD PRACTITIONER CERTIFIED'] } })).toEqual([]); // skills are often acronyms
    expect(messages('formatting', withContact({}, 'ELEANOR VANCE'))).toEqual([]); // names are not prose
  });
});

describe('entries', () => {
  it('positive: empty, untitled and repeated entries', () => {
    const blank = { title: '', company: '', location: '', start: '', end: '', summary: '', bullets: [] };
    expect(messages('entries', { ...base, experience: [exp, blank] })).toEqual(['issue: Empty experience entry; it prints as a blank block.']);
    expect(messages('entries', { ...base, experience: [{ ...exp, title: '', company: '' }] })).toEqual(['issue: This experience entry has no job title or company.']);
    expect(messages('entries', { ...base, experience: [exp, exp] })).toEqual(['check: This experience entry repeats an earlier one.']);
    expect(messages('entries', { ...base, education: [{ degree: '', school: '', location: 'Boston', date: '2012', honors: '' }] })).toEqual(['issue: This education entry has no degree or school.']);
    expect(messages('entries', { ...base, projects: [{ name: '', description: 'A tool', bullets: [] }] })).toEqual(['check: This project has no name.']);
  });

  it('negative: same company with different titles, and fully empty optional entries', () => {
    expect(messages('entries', { ...base, experience: [exp, { ...exp, title: 'VP of Product' }] })).toEqual([]);
    expect(messages('entries', { ...base, projects: [{ name: '', description: '', bullets: [] }] })).toEqual([]);
  });
});

// --- 2. corpus ---

const allFindings = (r: AtsReport) => r.checks.flatMap((c) => c.findings.map((f) => `${c.rule}:${f.status}`));
const rulesHit = (r: AtsReport) => [...new Set(r.checks.filter((c) => c.findings.length).map((c) => c.rule))].sort();

describe('corpus', () => {
  it('strong resumes: no findings (plain template); only the template-text note in letter-spaced templates', () => {
    for (const [name, data] of Object.entries(STRONG)) {
      for (const t of TEMPLATES) {
        const found = allFindings(report(data, t.id));
        const facts = templateTextFacts(t);
        expect(found, `${name} ${t.id}`).toEqual(facts.nameLetterSpaced || facts.headingsLetterSpaced ? ['template-text:issue'] : []);
      }
    }
  });

  it('weak resumes: each flags its own problems, nothing else', () => {
    const hits = Object.fromEntries(Object.entries(WEAK).map(([name, data]) => [name, rulesHit(report(data))]));
    expect(hits).toEqual({
      missingContact: ['contact'],
      symbols: ['characters'],
      invisible: ['invisible'],
      bullets: ['bullets'],
      dates: ['dates'],
      formatting: ['formatting'],
      entries: ['entries', 'sections'],
      noExperience: ['sections'],
    });
    const counts = Object.fromEntries(Object.entries(WEAK).map(([name, data]) => [name, allFindings(report(data)).length]));
    expect(counts).toEqual({ missingContact: 4, symbols: 3, invisible: 3, bullets: 7, dates: 6, formatting: 4, entries: 6, noExperience: 3 });
  });

  it('edge cases: empty, long, multiline, malformed and punctuation-heavy resumes', () => {
    expect(allFindings(report(EDGE.empty))).toEqual([
      'contact:issue', 'contact:issue', 'contact:check', 'contact:check', 'sections:issue', 'sections:check', 'sections:check',
    ]);
    expect(allFindings(report(EDGE.long))).toEqual([]);
    expect(allFindings(report(EDGE.multiline))).toEqual([]);
    expect(allFindings(report(EDGE.punctuation))).toEqual([]);
    expect(() => report(EDGE.malformed)).not.toThrow();
    expect(rulesHit(report(EDGE.malformed))).toEqual(['contact', 'dates', 'sections']);
  });
});

// --- 3. properties: determinism, purity, structure ---

/** Small deterministic PRNG so the generated corpus is the same on every run. */
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
}
const PIECES = ['', ' ', 'Led', '• x', '🚀', '​', 'Mar 2020', '03/2021', 'Spring', '**b**', 'ALL CAPS TEXT HERE NOW', '!!!', 'é', 'محمد', '\n', 'a@b.co', '555 123 4567', 'C++'];
function generated(n: number): ResumeData[] {
  const r = rng(42);
  const pick = () => Array.from({ length: 1 + Math.floor(r() * 3) }, () => PIECES[Math.floor(r() * PIECES.length)]).join(' ');
  return Array.from({ length: n }, () => ({
    name: pick(), contact: { phone: pick(), email: pick(), location: pick(), linkedin: pick(), website: pick() },
    summary: { tagline: pick(), bullets: [pick(), pick()], skills: [pick()] },
    experience: Array.from({ length: Math.floor(r() * 3) }, () => ({ title: pick(), company: pick(), location: pick(), start: pick(), end: pick(), summary: pick(), bullets: [pick(), pick()] })),
    education: [{ degree: pick(), school: pick(), location: pick(), date: pick(), honors: pick() }],
    certifications: [{ name: pick(), org: pick(), date: pick() }],
    projects: [{ name: pick(), description: pick(), bullets: [pick()] }],
    awards: [pick()],
  }));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

describe('properties', () => {
  const inputs = [...Object.values(STRONG), ...Object.values(WEAK), ...Object.values(EDGE), ...generated(300)];

  it('never throws; every report is well-formed; status is the worst finding; ids are unique; locations are real editor sections', () => {
    for (const data of inputs) {
      for (const t of [TEMPLATES[0], TEMPLATES[3], TEMPLATES[4]]) {
        const r = report(data, t.id);
        expect(r.checks.map((c) => c.rule)).toEqual(['contact', 'sections', 'template-text', 'layout', 'characters', 'invisible', 'bullets', 'dates', 'formatting', 'entries']);
        for (const c of r.checks) {
          const worst = c.findings.some((f) => f.status === 'issue') ? 'issue' : c.findings.length ? 'check' : 'readable';
          expect(c.status).toBe(worst);
          expect(new Set(c.findings.map((f) => f.id)).size).toBe(c.findings.length);
          for (const f of c.findings) if (f.location) expect(EDITOR_SECTIONS).toContain(f.location.section);
        }
      }
    }
  });

  it('is deterministic and does not modify the resume', () => {
    for (const data of inputs.slice(0, 60)) {
      const frozen = deepFreeze(JSON.parse(JSON.stringify(data)) as ResumeData);
      const before = JSON.stringify(frozen);
      expect(report(frozen)).toEqual(report(frozen));
      expect(JSON.stringify(frozen)).toBe(before);
    }
  });

  it('has no score, percentage or pass/fail claim', () => {
    for (const data of inputs.slice(0, 40)) {
      const r = report(data);
      expect(Object.keys(r).sort()).toEqual(['checks', 'detected', 'templateId']);
      const text = JSON.stringify(r);
      expect(text).not.toMatch(/"score"|compatib|guarantee|will pass|\bpass(es)? ATS/i);
    }
    const copy = JSON.stringify({ ATS_COPY, STATUS_LABELS });
    expect(copy).not.toMatch(/\d+ ?%|will pass|guaranteed|compatible/i);
    expect(ATS_COPY.disclaimer).toContain('no ATS guarantee is implied');
    expect(Object.values(STATUS_LABELS)).toEqual(['Readable', 'Check this', 'Potential issue']);
    expect(countsLine(0, 0)).toBe('No issues detected.');
    expect(countsLine(1, 2)).toBe('1 potential issue · 2 to check');
    expect(countsLine(2, 0)).toBe('2 potential issues');
  });
});

// --- 4. template claims verified against real exports ---

describe('template claims match the DOCX export', () => {
  it('headings and name are whole words in DOCX; no page header, footer or table', async () => {
    for (const t of TEMPLATES) {
      const zip = await JSZip.loadAsync(Buffer.from(await buildResumeDocxBase64({ data: base, accent: t.defaultAccent, templateName: t.name }), 'base64'));
      const names = Object.keys(zip.files);
      expect(names.filter((n) => /word\/(header|footer)\d*\.xml/.test(n)), t.id).toEqual([]);
      const xml = await zip.file('word/document.xml')!.async('string');
      expect(xml, t.id).not.toContain('<w:tbl>');
      const text = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('|');
      for (const heading of ['Summary', 'Experience', 'Education']) expect(text.toLowerCase(), `${t.id} ${heading}`).toContain(heading.toLowerCase());
      expect(text, t.id).toContain(base.contact.email);
    }
  });
});

const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

describe.skipIf(!existsSync(CHROMIUM))('template claims match a real PDF (Chromium + pdf.js text layer)', () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: CHROMIUM });
    page = await browser.newPage();
    await page.emulateMedia({ media: 'print' });
  }, 30_000);
  afterAll(async () => {
    await browser?.close();
  });

  async function pdfText(templateId: string): Promise<string> {
    const t = TEMPLATES.find((x) => x.id === templateId)!;
    await page.setContent(pdfHtml({ id: 'r', title: 't', templateId, accent: t.defaultAccent, data: base, createdAt: 1, updatedAt: 1 }, 'letter'));
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
    let out = '';
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      out += content.items.map((i) => ('str' in i ? i.str : '')).join(' ') + '\n';
    }
    return out.replace(/\s+/g, ' ');
  }

  it('letter-spacing claims hold for all 12 templates; reading order and contact placement hold for all', async () => {
    for (const t of TEMPLATES) {
      const text = await pdfText(t.id);
      const facts = templateTextFacts(t);
      const lower = text.toLowerCase();
      // Claim: the name is (or is not) split into letters.
      expect(lower.includes('eleanor vance'), `${t.id} name whole`).toBe(!facts.nameLetterSpaced);
      // Claim: the headings are (or are not) split into letters.
      expect(lower.includes('summary') && lower.includes('experience'), `${t.id} headings whole`).toBe(!facts.headingsLetterSpaced);
      // Layout claim: one reading order; contact in the main text right after the name; bullets intact.
      const joined = lower.replace(/ /g, '');
      const at = (s: string) => joined.indexOf(s.toLowerCase().replace(/ /g, ''));
      expect(at('eleanorvance'), t.id).toBeGreaterThanOrEqual(0);
      expect(at(base.contact.phone), t.id).toBeGreaterThan(at('eleanorvance'));
      expect(at(base.contact.email), t.id).toBeGreaterThan(at(base.contact.phone));
      expect(at('strategicproductleader'), t.id).toBeGreaterThan(at(base.contact.email));
      expect(text, t.id).toContain(exp.bullets[0]);
    }
  }, 120_000);
});

// --- 5. architecture ---

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.generated.ts') ? [path] : [];
  });
}
const specs = (source: string) => [...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
const valueSpecs = (source: string) => [...source.matchAll(/^import\s+(?!type\s)[^;]*?from\s+['"]([^'"]+)['"]/gms)].map((m) => m[1]);

describe('architecture', () => {
  it('domain/ats is pure: only domain imports', () => {
    for (const file of sourceFiles(join(SRC, 'domain', 'ats'))) {
      for (const spec of specs(read(relative(SRC, file)))) expect(spec, relative(SRC, file)).toMatch(/^\.\/[\w-]+$|^\.\.\/(resume|templates)\/[\w-]+$/);
    }
  });

  it('the ATS checker is FREE: no entitlement, premium, paywall or export code on its path', () => {
    for (const file of sourceFiles(join(SRC, 'features', 'ats'))) {
      for (const spec of specs(read(relative(SRC, file)))) expect(spec, relative(SRC, file)).not.toMatch(/entitlement|premium|paywall|services\/export|unlock/);
    }
    expect(read('domain/entitlement/features.ts')).not.toMatch(/ats/i);
  });

  it('only the ATS tab uses the engine; it sits in Tools next to Check; Resume Score is untouched', () => {
    const users = sourceFiles(SRC)
      .filter((f) => !f.includes(join('domain', 'ats')))
      .filter((f) => valueSpecs(readFileSync(f, 'utf8')).some((s) => /domain\/ats\//.test(s)))
      .map((f) => relative(SRC, f));
    expect(users).toEqual([join('features', 'ats', 'AtsTool.tsx')]);
    const tools = read('features/tools/ToolsScreen.tsx');
    expect(tools).toMatch(/\['check', 'Check'\],\s*\['ats', 'ATS'\],/);
    expect(tools).toMatch(/<AtsTool data=\{resume\.data\} templateId=\{resume\.templateId\}/);
    expect(read('domain/check/resume-score.ts')).not.toMatch(/ats\//);
    expect(read('features/check/CheckTool.tsx')).not.toMatch(/Ats|ats\//);
  });
});

import type { ResumeData } from '../resume/types';
import type { TemplateConfig } from '../templates/templates';
import { isOrdered, parseDateField, type DateStyle, type ParsedDate } from './dates';
import { textFields, type TextField } from './fields';
import { RENDERED_HEADINGS, templateTextFacts, type Tracking } from './template-facts';
import type { AtsCheck, AtsDetection, AtsFinding, AtsLocation, AtsRuleId, AtsStatus } from './types';

// Ten deterministic checks. Each is conservative: it reports only what the data (or
// the template's verified rendering) shows, and stays quiet when unsure.

export interface AtsInput {
  data: ResumeData;
  template: TemplateConfig;
  /** Defaults to the renderer's tracking; tests pass other values to exercise the rule. */
  tracking?: Tracking;
}

type Draft = Omit<AtsFinding, 'id'>;

function check(rule: AtsRuleId, title: string, findings: Draft[], readable: string, withFindings: string): AtsCheck {
  const withIds: AtsFinding[] = findings.map((f, i) => ({ ...f, id: `${rule}:${i}` }));
  const status: AtsStatus = withIds.some((f) => f.status === 'issue') ? 'issue' : withIds.length ? 'check' : 'readable';
  return { rule, title, status, summary: withIds.length ? withFindings : readable, findings: withIds };
}

const personal = (label: string): AtsLocation => ({ section: 'personal', label });
const quote = (s: string) => `"${s.length > 40 ? `${s.slice(0, 37)}…` : s}"`;
const codePoint = (c: string) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;

// --- 1. contact ---

const EMAIL = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const PHONE_CHARS = /^\+?[\d\s().\-/]+(?:\s*(?:x|ext\.?)\s*\d{1,6})?$/i;

export function contactCheck({ data }: AtsInput): { check: AtsCheck; detected: AtsDetection[] } {
  const c = data.contact;
  const f: Draft[] = [];
  const name = data.name.trim();
  if (!name) f.push({ status: 'issue', message: 'No name detected.', location: personal('Full Name') });
  else if (/[@\d]/.test(name)) f.push({ status: 'check', message: `The name ${quote(name)} contains digits or "@"; a parser may not read it as a name.`, location: personal('Full Name') });

  const email = c.email.trim();
  if (!email) f.push({ status: 'issue', message: 'No email address detected.', location: personal('Email') });
  else if (!EMAIL.test(email)) f.push({ status: 'issue', message: `${quote(email)} does not look like an email address.`, location: personal('Email') });

  const phone = c.phone.trim();
  const digits = phone.replace(/\D/g, '').length;
  if (!phone) f.push({ status: 'check', message: 'No phone number detected.', location: personal('Phone') });
  else if (!PHONE_CHARS.test(phone) || digits < 7 || digits > 15) {
    f.push({ status: 'check', message: `${quote(phone)} may not be read as a phone number (use digits, spaces, +, - or parentheses).`, location: personal('Phone') });
  }

  if (!c.location.trim()) f.push({ status: 'check', message: 'No location detected; some searches filter by city or region.', location: personal('Location') });

  for (const [key, label] of [['linkedin', 'LinkedIn'], ['website', 'Website']] as const) {
    const value = c[key].trim();
    if (value && /\s/.test(value)) f.push({ status: 'issue', message: `The ${label} address contains a space, so it will not be read as one link.`, location: personal(label) });
    else if (value && !/\.[a-z]{2,}/i.test(value)) f.push({ status: 'check', message: `${quote(value)} does not look like a web address.`, location: personal(label) });
  }

  const detected: AtsDetection[] = [
    { label: 'Name', detected: Boolean(name) },
    { label: 'Email', detected: EMAIL.test(email) },
    { label: 'Phone', detected: Boolean(phone) && digits >= 7 && digits <= 15 },
    { label: 'Location', detected: Boolean(c.location.trim()) },
    { label: 'LinkedIn or website', detected: Boolean(c.linkedin.trim() || c.website.trim()) },
  ];
  return {
    check: check('contact', 'Contact details', f, 'Name, email, phone and location are present and in readable formats.', 'Some contact details are missing or may not be read correctly.'),
    detected,
  };
}

// --- 2. sections ---

const hasText = (...values: string[]) => values.some((v) => v.trim() !== '');

export function sectionsCheck({ data }: AtsInput): { check: AtsCheck; detected: AtsDetection[] } {
  const present = {
    Summary: hasText(data.summary.tagline, ...data.summary.bullets),
    Skills: data.summary.skills.some((s) => s.trim()),
    Experience: data.experience.some((e) => hasText(e.title, e.company, e.summary, ...e.bullets)),
    Education: data.education.some((e) => hasText(e.degree, e.school)),
    Certifications: data.certifications.some((c) => hasText(c.name)),
    Projects: data.projects.some((p) => hasText(p.name, p.description, ...p.bullets)),
    Awards: data.awards.some((a) => a.trim()),
  };
  const f: Draft[] = [];
  if (!present.Experience) f.push({ status: 'issue', message: 'No Experience section detected. Most ATS expect one; add your roles if you have any.', location: { section: 'experience', label: 'Experience' } });
  if (!present.Education) f.push({ status: 'check', message: 'No Education section detected.', location: { section: 'education', label: 'Education' } });
  if (!present.Skills) f.push({ status: 'check', message: 'No skills listed; keyword searches often look for them.', location: { section: 'summary', label: 'Skills' } });
  return {
    check: check(
      'sections',
      'Section headings',
      f,
      `Headings use standard names (${RENDERED_HEADINGS.join(', ')}) as plain text.`,
      `Headings use standard names as plain text, but some core sections are missing.`,
    ),
    detected: Object.entries(present).map(([label, detected]) => ({ label: `${label} section`, detected })),
  };
}

// --- 3. template text (letter-spacing) ---

export function templateTextCheck({ template, tracking }: AtsInput): AtsCheck {
  const facts = templateTextFacts(template, tracking);
  const f: Draft[] = [];
  const parts = [facts.nameLetterSpaced ? 'name' : null, facts.headingsLetterSpaced ? 'section headings' : null].filter(Boolean);
  if (parts.length) {
    f.push({
      status: 'issue',
      message: `In a PDF, this template's letter-spaced ${parts.join(' and ')} can be read as separate letters (for example "S U M M A R Y"). The Word (DOCX) export keeps them as whole words; you can also pick a template without letter-spacing.`,
    });
  }
  return check('template-text', `Template text (${template.name})`, f, 'Name and headings are exported as whole words in PDF and Word.', 'Some text is spaced out in the PDF export.');
}

// --- 4. layout ---

export function layoutCheck({ template }: AtsInput): AtsCheck {
  const facts = templateTextFacts(template);
  const summary = facts.splitHeader
    ? 'One column. Name and contact sit side by side, and are read in order (name, then contact). Contact details are in the main text, not a page header. Text is real, selectable text.'
    : 'One column. Contact details are in the main text, not a page header or footer. Text is real, selectable text.';
  return check('layout', 'Layout', [], summary, summary);
}

// --- 5. characters ---

/** Ranges that commonly break parsing or render as boxes. Letters of every script are fine. */
const DECORATIVE: { test: (cp: number) => boolean; status: 'issue' | 'check'; what: string }[] = [
  { test: (cp) => cp === 0xfffd, status: 'issue', what: 'a broken character (�)' },
  { test: (cp) => (cp >= 0xe000 && cp <= 0xf8ff) || cp >= 0xf0000, status: 'issue', what: 'an icon-font character' },
  { test: (cp) => cp >= 0x1d400 && cp <= 0x1d7ff, status: 'issue', what: 'styled "fancy" letters (they are not ordinary letters to a parser)' },
  { test: (cp) => cp >= 0x1f000 && cp <= 0x1faff, status: 'issue', what: 'an emoji' },
  { test: (cp) => cp >= 0x2600 && cp <= 0x27bf, status: 'check', what: 'a decorative symbol' },
  { test: (cp) => cp >= 0x25a0 && cp <= 0x25ff, status: 'check', what: 'a decorative shape' },
  { test: (cp) => cp >= 0x2500 && cp <= 0x259f, status: 'check', what: 'a box-drawing character' },
  { test: (cp) => cp >= 0xff01 && cp <= 0xff5e, status: 'check', what: 'full-width characters' },
];

export function charactersCheck({ data }: AtsInput): AtsCheck {
  const f: Draft[] = [];
  for (const field of textFields(data)) {
    for (const char of field.value) {
      const cp = char.codePointAt(0)!;
      const hit = DECORATIVE.find((d) => d.test(cp));
      if (!hit) continue;
      f.push({ status: hit.status, message: `Contains ${hit.what}: "${char}" (${codePoint(char)}).`, location: field.location });
      break; // one finding per field
    }
  }
  return check('characters', 'Symbols and special characters', f, 'No emoji, icon-font or decorative characters detected.', 'Some text contains characters a parser may drop or misread.');
}

// --- 6. invisible characters ---

const INVISIBLE = /[\u200B\u2060\uFEFF\u00AD\u2028\u2029\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;
const ONE_LINE_KINDS: readonly TextField['kind'][] = ['name', 'contact', 'line', 'date'];

export function invisibleCheck({ data }: AtsInput): AtsCheck {
  const f: Draft[] = [];
  for (const field of textFields(data)) {
    const m = INVISIBLE.exec(field.value);
    if (m) {
      f.push({ status: 'issue', message: `Contains an invisible character (${codePoint(m[0])}) that can split a word for keyword searches.`, location: field.location });
    } else if (ONE_LINE_KINDS.includes(field.kind) && /[\r\n]/.test(field.value)) {
      f.push({ status: 'check', message: 'Contains a line break in a one-line field.', location: field.location });
    }
  }
  return check('invisible', 'Invisible characters', f, 'No invisible or control characters detected.', 'Some text contains invisible characters or stray line breaks.');
}

// --- 7. bullets ---

// ">" is not listed: "> 99.9% uptime" means "greater than".
const MANUAL_BULLET = /^\s*([•◦▪▫●○■□◆◇►▸‣⁃∙·*–—-]|\d{1,2}[.)])\s+/;
const itemLists = (data: ResumeData): { items: string[]; section: AtsLocation['section']; label: (i: number) => string }[] => [
  { items: data.summary.bullets, section: 'summary', label: (i) => `Summary bullet ${i + 1}` },
  { items: data.summary.skills, section: 'summary', label: (i) => `Skill ${i + 1}` },
  ...data.experience.map((e, n) => ({ items: e.bullets, section: 'experience' as const, label: (i: number) => `Experience ${n + 1} · Accomplishment ${i + 1}` })),
  ...data.projects.map((p, n) => ({ items: p.bullets, section: 'projects' as const, label: (i: number) => `Project ${n + 1} · Accomplishment ${i + 1}` })),
  { items: data.awards, section: 'awards', label: (i) => `Award ${i + 1}` },
];

export function bulletsCheck({ data }: AtsInput): AtsCheck {
  const f: Draft[] = [];
  for (const list of itemLists(data)) {
    const seen = new Map<string, number>();
    list.items.forEach((item, i) => {
      const location = { section: list.section, label: list.label(i) };
      const glyph = MANUAL_BULLET.exec(item);
      if (glyph) f.push({ status: 'check', message: `Starts with "${glyph[1]}". The template already adds bullet points, so this shows twice.`, location });
      if (/[\r\n]/.test(item.trim())) f.push({ status: 'check', message: 'Contains a line break; it will be joined into one line.', location });
      const key = item.replace(MANUAL_BULLET, '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (key) {
        if (seen.has(key)) f.push({ status: 'check', message: `Repeats ${list.label(seen.get(key)!).toLowerCase()}.`, location });
        else seen.set(key, i);
      }
    });
  }
  return check('bullets', 'Bullets', f, 'Bullets are plain text, one line each, without repeats.', 'Some bullets have extra bullet characters, line breaks or repeats.');
}

// --- 8. dates ---

export function datesCheck({ data }: AtsInput): AtsCheck {
  const f: Draft[] = [];
  const styles = new Set<Exclude<DateStyle, 'present'>>();
  const parse = (value: string, location: AtsLocation): ParsedDate[] | null => {
    if (!value.trim()) return [];
    const parsed = parseDateField(value);
    if (!parsed) f.push({ status: 'check', message: `${quote(value.trim())} is not a date format parsers commonly read (for example "Mar 2020", "03/2020" or "2020").`, location });
    else for (const d of parsed) if (d.style !== 'present') styles.add(d.style);
    return parsed;
  };
  data.experience.forEach((e, i) => {
    const at = (label: string): AtsLocation => ({ section: 'experience', label: `Experience ${i + 1} · ${label}` });
    const start = parse(e.start, at('Start Date'));
    const end = parse(e.end, at('End Date'));
    const titled = hasText(e.title, e.company);
    if (titled && !e.start.trim() && !e.end.trim()) f.push({ status: 'check', message: 'No dates for this role.', location: at('Start Date') });
    else if (e.start.trim() && !e.end.trim()) f.push({ status: 'check', message: 'No end date. Write "Present" if this is your current role.', location: at('End Date') });
    else if (!e.start.trim() && e.end.trim()) f.push({ status: 'check', message: 'No start date.', location: at('Start Date') });
    if (start?.length === 1 && end?.length === 1 && !isOrdered(start[0], end[0])) {
      f.push({ status: 'check', message: 'The start date is after the end date.', location: at('Start Date') });
    }
  });
  data.education.forEach((e, i) => {
    const range = parse(e.date, { section: 'education', label: `Education ${i + 1} · Date` });
    if (range?.length === 2 && !isOrdered(range[0], range[1])) f.push({ status: 'check', message: 'The dates are in reverse order.', location: { section: 'education', label: `Education ${i + 1} · Date` } });
  });
  data.certifications.forEach((c, i) => parse(c.date, { section: 'certifications', label: `Certification ${i + 1} · Date` }));
  if (styles.has('month-name') && styles.has('numeric')) {
    f.push({ status: 'check', message: 'Dates mix month names ("Mar 2020") and numbers ("03/2020"); one style is easier to read consistently.' });
  }
  return check('dates', 'Dates', f, 'Dates are in recognized formats and in order.', 'Some dates are missing, unusual or inconsistent.');
}

// --- 9. formatting ---

const PROSE_KINDS: readonly TextField['kind'][] = ['paragraph', 'item'];

export function formattingCheck({ data }: AtsInput): AtsCheck {
  const f: Draft[] = [];
  for (const field of textFields(data)) {
    const v = field.value;
    // "**bold**" and "# Heading" only. "__bold__" is not checked: it cannot be told apart
    // from names like Python's "__init__". Markers must stand apart from words ("C#" is fine).
    if (/(^|\s)\*\*[^*\n]+\*\*(?=\s|$|[.,;:!?])|^\s*#{1,6}\s/m.test(v)) {
      f.push({ status: 'check', message: 'Contains formatting marks ("**" or "#") that show as literal characters.', location: field.location });
      continue;
    }
    if (/([!?*~=_#|])\1{2,}|\.{4,}|-{3,}/.test(v)) {
      f.push({ status: 'check', message: 'Contains repeated punctuation used as decoration.', location: field.location });
      continue;
    }
    if (PROSE_KINDS.includes(field.kind)) {
      const words = v.match(/\p{L}+/gu) ?? [];
      const letters = words.join('');
      if (words.length >= 4 && letters.length >= 20 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) {
        f.push({ status: 'check', message: 'Written in all capitals; this is harder to read and some parsers treat it as a heading.', location: field.location });
      }
    }
  }
  return check('formatting', 'Formatting', f, 'No stray formatting marks, decorative punctuation or all-capital text detected.', 'Some text has formatting signals that may not read well.');
}

// --- 10. entries ---

export function entriesCheck({ data }: AtsInput): AtsCheck {
  const f: Draft[] = [];
  const dup = <T>(items: T[], key: (item: T) => string, message: string, location: (i: number) => AtsLocation) => {
    const seen = new Set<string>();
    items.forEach((item, i) => {
      const k = key(item).toLowerCase().replace(/\s+/g, ' ').trim();
      if (!k.replace(/\|/g, '')) return;
      if (seen.has(k)) f.push({ status: 'check', message, location: location(i) });
      seen.add(k);
    });
  };
  data.experience.forEach((e, i) => {
    if (!hasText(e.title, e.company)) {
      const empty = !hasText(e.location, e.start, e.end, e.summary, ...e.bullets);
      f.push({ status: 'issue', message: empty ? 'Empty experience entry; it prints as a blank block.' : 'This experience entry has no job title or company.', location: { section: 'experience', label: `Experience ${i + 1}` } });
    }
  });
  data.education.forEach((e, i) => {
    if (!hasText(e.degree, e.school)) f.push({ status: 'issue', message: 'This education entry has no degree or school.', location: { section: 'education', label: `Education ${i + 1}` } });
  });
  data.projects.forEach((p, i) => {
    if (!hasText(p.name) && hasText(p.description, ...p.bullets)) f.push({ status: 'check', message: 'This project has no name.', location: { section: 'projects', label: `Project ${i + 1}` } });
  });
  data.certifications.forEach((c, i) => {
    if (!hasText(c.name) && hasText(c.org, c.date)) f.push({ status: 'check', message: 'This certification has no name.', location: { section: 'certifications', label: `Certification ${i + 1}` } });
  });
  dup(data.experience, (e) => `${e.title}|${e.company}|${e.start}`, 'This experience entry repeats an earlier one.', (i) => ({ section: 'experience', label: `Experience ${i + 1}` }));
  dup(data.education, (e) => `${e.degree}|${e.school}|${e.date}`, 'This education entry repeats an earlier one.', (i) => ({ section: 'education', label: `Education ${i + 1}` }));
  return check('entries', 'Entries', f, 'Every entry has a title, and none repeats.', 'Some entries are empty, untitled or repeated.');
}

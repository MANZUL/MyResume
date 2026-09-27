import type { ResumeData } from '../resume/types';
import type { TemplateConfig } from '../templates/templates';
import { isOrdered, parseDateField, type DateStyle, type ParsedDate } from './dates';
import { textFields, type TextField } from './fields';
import { renderedHeadings, templateTextFacts, trackingFor, type Tracking } from './template-facts';
import type { Language } from '../i18n/languages';
import { text, type AnalysisText } from '../i18n/analysis-text';
import { englishText } from '../../i18n/analysis';
import { at, entry, loc, personal, reference, section } from './locations';
import type { AtsCheck, AtsDetection, AtsFinding, AtsLocation, AtsRuleId, AtsStatus } from './types';

// Ten deterministic checks. Each is conservative: it reports only what the data (or
// the template's verified rendering) shows, and stays quiet when unsure.

export interface AtsInput {
  data: ResumeData;
  template: TemplateConfig;
  /**
   * The resume's language. The rules and messages are English (see analysisSupport), but
   * what the export contains (heading text, letter-spacing) follows this language.
   */
  language: Language;
  /** Defaults to the renderer's tracking for the language; tests pass other values to exercise the rule. */
  tracking?: Tracking;
}

type Draft = Omit<AtsFinding, 'id'>;

// Every sentence is a message code (analysis.ats.* in the app catalog) plus parameters;
// `message`, `title`, `summary` and location `label` are the English rendering of the
// same codes, kept for the English rule pack's callers and tests.

const draft = (status: Draft['status'], value: AnalysisText, location?: AtsLocation): Draft => ({
  status,
  message: englishText(value),
  messageText: value,
  ...(location ? { location } : {}),
});
const ats = (key: string, params?: Record<string, string | number | AnalysisText>) => text(`analysis.ats.${key}`, params);

/** A check's title and its readable / with-findings summaries are codes under analysis.ats.<rule>. */
function check(rule: AtsRuleId, key: string, findings: Draft[], titleParams?: Record<string, AnalysisText>, readableParams?: Record<string, string>, readableKey = 'readable'): AtsCheck {
  const withIds: AtsFinding[] = findings.map((f, i) => ({ ...f, id: `${rule}:${i}` }));
  const status: AtsStatus = withIds.some((f) => f.status === 'issue') ? 'issue' : withIds.length ? 'check' : 'readable';
  const titleText = ats(`${key}.title`, titleParams);
  const summaryText = withIds.length ? ats(`${key}.withFindings`) : ats(`${key}.${readableKey}`, readableParams);
  return { rule, title: englishText(titleText), titleText, status, summary: englishText(summaryText), summaryText, findings: withIds };
}

/** User text shown inside a message, shortened (the quotes are part of each message). */
const clip = (s: string) => (s.length > 40 ? `${s.slice(0, 37)}…` : s);
const codePoint = (c: string) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;

// --- 1. contact ---

const EMAIL = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const PHONE_CHARS = /^\+?[\d\s().\-/]+(?:\s*(?:x|ext\.?)\s*\d{1,6})?$/i;

export function contactCheck({ data }: AtsInput): { check: AtsCheck; detected: AtsDetection[] } {
  const c = data.contact;
  const f: Draft[] = [];
  const name = data.name.trim();
  if (!name) f.push(draft('issue', ats('contact.noName'), personal('name')));
  else if (/[@\d]/.test(name)) f.push(draft('check', ats('contact.nameHasDigits', { value: clip(name) }), personal('name')));

  const email = c.email.trim();
  if (!email) f.push(draft('issue', ats('contact.noEmail'), personal('email')));
  else if (!EMAIL.test(email)) f.push(draft('issue', ats('contact.badEmail', { value: clip(email) }), personal('email')));

  const phone = c.phone.trim();
  const digits = phone.replace(/\D/g, '').length;
  if (!phone) f.push(draft('check', ats('contact.noPhone'), personal('phone')));
  else if (!PHONE_CHARS.test(phone) || digits < 7 || digits > 15) {
    f.push(draft('check', ats('contact.badPhone', { value: clip(phone) }), personal('phone')));
  }

  if (!c.location.trim()) f.push(draft('check', ats('contact.noLocation'), personal('location')));

  for (const key of ['linkedin', 'website'] as const) {
    const value = c[key].trim();
    if (value && /\s/.test(value)) f.push(draft('issue', ats(`contact.${key}HasSpace`), personal(key)));
    else if (value && !/\.[a-z]{2,}/i.test(value)) f.push(draft('check', ats('contact.badUrl', { value: clip(value) }), personal(key)));
  }

  const detected: AtsDetection[] = [
    detection('name', Boolean(name)),
    detection('email', EMAIL.test(email)),
    detection('phone', Boolean(phone) && digits >= 7 && digits <= 15),
    detection('location', Boolean(c.location.trim())),
    detection('linkOrWebsite', Boolean(c.linkedin.trim() || c.website.trim())),
  ];
  return { check: check('contact', 'contact', f), detected };
}

// --- 2. sections ---

const hasText = (...values: string[]) => values.some((v) => v.trim() !== '');

function detection(key: string, detected: boolean): AtsDetection {
  const labelText = ats(`detected.${key}`);
  return { label: englishText(labelText), labelText, detected };
}

export function sectionsCheck({ data, language }: AtsInput): { check: AtsCheck; detected: AtsDetection[] } {
  const present = {
    summary: hasText(data.summary.tagline, ...data.summary.bullets),
    skills: data.summary.skills.some((s) => s.trim()),
    experience: data.experience.some((e) => hasText(e.title, e.company, e.summary, ...e.bullets)),
    education: data.education.some((e) => hasText(e.degree, e.school)),
    certifications: data.certifications.some((c) => hasText(c.name)),
    projects: data.projects.some((p) => hasText(p.name, p.description, ...p.bullets)),
    awards: data.awards.some((a) => a.trim()),
  };
  const f: Draft[] = [];
  if (!present.experience) f.push(draft('issue', ats('sections.noExperience'), section('experience', 'experience')));
  if (!present.education) f.push(draft('check', ats('sections.noEducation'), section('education', 'education')));
  if (!present.skills) f.push(draft('check', ats('sections.noSkills'), section('summary', 'skills')));
  return {
    // The rendered headings are document text in the resume's language (data here).
    check: check('sections', 'sections', f, undefined, { headings: renderedHeadings(language).join(', ') }),
    detected: (Object.keys(present) as (keyof typeof present)[]).map((key) => detection(`${key}Section`, present[key])),
  };
}

// --- 3. template text (letter-spacing) ---

export function templateTextCheck({ template, tracking, language }: AtsInput): AtsCheck {
  const facts = templateTextFacts(template, tracking ?? trackingFor(language));
  const f: Draft[] = [];
  const parts = facts.nameLetterSpaced && facts.headingsLetterSpaced ? 'both' : facts.nameLetterSpaced ? 'name' : facts.headingsLetterSpaced ? 'headings' : null;
  if (parts) f.push(draft('issue', ats('templateText.spaced', { parts: ats(`templateText.parts.${parts}`) })));
  // The template's name is its catalog display name.
  return check('template-text', 'templateText', f, { template: text(template.nameKey) });
}

// --- 4. layout ---

export function layoutCheck({ template }: AtsInput): AtsCheck {
  const facts = templateTextFacts(template);
  return check('layout', 'layout', [], undefined, undefined, facts.splitHeader ? 'readableSplit' : 'readable');
}

// --- 5. characters ---

/** Ranges that commonly break parsing or render as boxes. Letters of every script are fine. */
const DECORATIVE: { test: (cp: number) => boolean; status: 'issue' | 'check'; what: string }[] = [
  { test: (cp) => cp === 0xfffd, status: 'issue', what: 'broken' },
  { test: (cp) => (cp >= 0xe000 && cp <= 0xf8ff) || cp >= 0xf0000, status: 'issue', what: 'iconFont' },
  { test: (cp) => cp >= 0x1d400 && cp <= 0x1d7ff, status: 'issue', what: 'fancyLetters' },
  { test: (cp) => cp >= 0x1f000 && cp <= 0x1faff, status: 'issue', what: 'emoji' },
  { test: (cp) => cp >= 0x2600 && cp <= 0x27bf, status: 'check', what: 'symbol' },
  { test: (cp) => cp >= 0x25a0 && cp <= 0x25ff, status: 'check', what: 'shape' },
  { test: (cp) => cp >= 0x2500 && cp <= 0x259f, status: 'check', what: 'boxDrawing' },
  { test: (cp) => cp >= 0xff01 && cp <= 0xff5e, status: 'check', what: 'fullWidth' },
];

export function charactersCheck({ data }: AtsInput): AtsCheck {
  const f: Draft[] = [];
  for (const field of textFields(data)) {
    for (const char of field.value) {
      const cp = char.codePointAt(0)!;
      const hit = DECORATIVE.find((d) => d.test(cp));
      if (!hit) continue;
      f.push(draft(hit.status, ats('characters.contains', { what: ats(`characters.what.${hit.what}`), char, codePoint: codePoint(char) }), field.location));
      break; // one finding per field
    }
  }
  return check('characters', 'characters', f);
}

// --- 6. invisible characters ---

const INVISIBLE = /[\u200B\u2060\uFEFF\u00AD\u2028\u2029\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;
const ONE_LINE_KINDS: readonly TextField['kind'][] = ['name', 'contact', 'line', 'date'];

export function invisibleCheck({ data }: AtsInput): AtsCheck {
  const f: Draft[] = [];
  for (const field of textFields(data)) {
    const m = INVISIBLE.exec(field.value);
    if (m) {
      f.push(draft('issue', ats('invisible.character', { codePoint: codePoint(m[0]) }), field.location));
    } else if (ONE_LINE_KINDS.includes(field.kind) && /[\r\n]/.test(field.value)) {
      f.push(draft('check', ats('invisible.lineBreak'), field.location));
    }
  }
  return check('invisible', 'invisible', f);
}

// --- 7. bullets ---

// ">" is not listed: "> 99.9% uptime" means "greater than".
const MANUAL_BULLET = /^\s*([•◦▪▫●○■□◆◇►▸‣⁃∙·*–—-]|\d{1,2}[.)])\s+/;
/** Each item list with its place (a location) and how a message refers to an item in it. */
const itemLists = (data: ResumeData): { items: string[]; location: (i: number) => AtsLocation; ref: (i: number) => AnalysisText }[] => [
  { items: data.summary.bullets, location: (i) => loc('summary', text('analysis.location.summaryBullet', { n: i + 1 })), ref: (i) => reference('summaryBullet', { n: i + 1 }) },
  { items: data.summary.skills, location: (i) => loc('summary', text('analysis.location.skill', { n: i + 1 })), ref: (i) => reference('skill', { n: i + 1 }) },
  ...data.experience.map((e, n) => ({
    items: e.bullets,
    location: (i: number) => at('experience', n, text('analysis.location.field.accomplishment', { n: i + 1 })),
    ref: (i: number) => reference('experienceAccomplishment', { entry: n + 1, n: i + 1 }),
  })),
  ...data.projects.map((p, n) => ({
    items: p.bullets,
    location: (i: number) => at('projects', n, text('analysis.location.field.accomplishment', { n: i + 1 })),
    ref: (i: number) => reference('projectAccomplishment', { entry: n + 1, n: i + 1 }),
  })),
  { items: data.awards, location: (i) => loc('awards', text('analysis.location.award', { n: i + 1 })), ref: (i) => reference('award', { n: i + 1 }) },
];

export function bulletsCheck({ data }: AtsInput): AtsCheck {
  const f: Draft[] = [];
  for (const list of itemLists(data)) {
    const seen = new Map<string, number>();
    list.items.forEach((item, i) => {
      const location = list.location(i);
      const glyph = MANUAL_BULLET.exec(item);
      if (glyph) f.push(draft('check', ats('bullets.manualBullet', { glyph: glyph[1] }), location));
      if (/[\r\n]/.test(item.trim())) f.push(draft('check', ats('bullets.lineBreak'), location));
      const key = item.replace(MANUAL_BULLET, '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (key) {
        if (seen.has(key)) f.push(draft('check', ats('bullets.repeats', { item: list.ref(seen.get(key)!) }), location));
        else seen.set(key, i);
      }
    });
  }
  return check('bullets', 'bullets', f);
}

// --- 8. dates ---

export function datesCheck({ data }: AtsInput): AtsCheck {
  const f: Draft[] = [];
  const styles = new Set<Exclude<DateStyle, 'present'>>();
  const parse = (value: string, location: AtsLocation): ParsedDate[] | null => {
    if (!value.trim()) return [];
    const parsed = parseDateField(value);
    if (!parsed) f.push(draft('check', ats('dates.unreadable', { value: clip(value.trim()) }), location));
    else for (const d of parsed) if (d.style !== 'present') styles.add(d.style);
    return parsed;
  };
  data.experience.forEach((e, i) => {
    const startAt = at('experience', i, text('analysis.location.field.startDate'));
    const endAt = at('experience', i, text('analysis.location.field.endDate'));
    const start = parse(e.start, startAt);
    const end = parse(e.end, endAt);
    const titled = hasText(e.title, e.company);
    if (titled && !e.start.trim() && !e.end.trim()) f.push(draft('check', ats('dates.noDates'), startAt));
    else if (e.start.trim() && !e.end.trim()) f.push(draft('check', ats('dates.noEnd'), endAt));
    else if (!e.start.trim() && e.end.trim()) f.push(draft('check', ats('dates.noStart'), startAt));
    if (start?.length === 1 && end?.length === 1 && !isOrdered(start[0], end[0])) {
      f.push(draft('check', ats('dates.startAfterEnd'), startAt));
    }
  });
  data.education.forEach((e, i) => {
    const dateAt = at('education', i, text('analysis.location.field.date'));
    const range = parse(e.date, dateAt);
    if (range?.length === 2 && !isOrdered(range[0], range[1])) f.push(draft('check', ats('dates.reversed'), dateAt));
  });
  data.certifications.forEach((c, i) => parse(c.date, at('certifications', i, text('analysis.location.field.date'))));
  if (styles.has('month-name') && styles.has('numeric')) f.push(draft('check', ats('dates.mixedStyles')));
  return check('dates', 'dates', f);
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
      f.push(draft('check', ats('formatting.marks'), field.location));
      continue;
    }
    if (/([!?*~=_#|])\1{2,}|\.{4,}|-{3,}/.test(v)) {
      f.push(draft('check', ats('formatting.punctuation'), field.location));
      continue;
    }
    if (PROSE_KINDS.includes(field.kind)) {
      const words = v.match(/\p{L}+/gu) ?? [];
      const letters = words.join('');
      if (words.length >= 4 && letters.length >= 20 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) {
        f.push(draft('check', ats('formatting.allCaps'), field.location));
      }
    }
  }
  return check('formatting', 'formatting', f);
}

// --- 10. entries ---

export function entriesCheck({ data }: AtsInput): AtsCheck {
  const f: Draft[] = [];
  const dup = <T>(items: T[], key: (item: T) => string, message: AnalysisText, location: (i: number) => AtsLocation) => {
    const seen = new Set<string>();
    items.forEach((item, i) => {
      const k = key(item).toLowerCase().replace(/\s+/g, ' ').trim();
      if (!k.replace(/\|/g, '')) return;
      if (seen.has(k)) f.push(draft('check', message, location(i)));
      seen.add(k);
    });
  };
  data.experience.forEach((e, i) => {
    if (!hasText(e.title, e.company)) {
      const empty = !hasText(e.location, e.start, e.end, e.summary, ...e.bullets);
      f.push(draft('issue', ats(empty ? 'entries.emptyExperience' : 'entries.untitledExperience'), entry('experience', i)));
    }
  });
  data.education.forEach((e, i) => {
    if (!hasText(e.degree, e.school)) f.push(draft('issue', ats('entries.untitledEducation'), entry('education', i)));
  });
  data.projects.forEach((p, i) => {
    if (!hasText(p.name) && hasText(p.description, ...p.bullets)) f.push(draft('check', ats('entries.untitledProject'), entry('projects', i)));
  });
  data.certifications.forEach((c, i) => {
    if (!hasText(c.name) && hasText(c.org, c.date)) f.push(draft('check', ats('entries.untitledCertification'), entry('certifications', i)));
  });
  dup(data.experience, (e) => `${e.title}|${e.company}|${e.start}`, ats('entries.repeatedExperience'), (i) => entry('experience', i));
  dup(data.education, (e) => `${e.degree}|${e.school}|${e.date}`, ats('entries.repeatedEducation'), (i) => entry('education', i));
  return check('entries', 'entries', f);
}

import {
  emptyCertification,
  emptyEducation,
  emptyExperience,
  emptyProject,
  emptyResume,
  type Experience,
  type ResumeData,
} from '../resume/types';

// Rule-based resume parser. Runs fully on-device with no AI and no network:
// it only copies text that is present in the source, so it can never invent facts.
// Anything it cannot place confidently is left for the user to fill in.

type SectionKey =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'certifications'
  | 'projects'
  | 'awards';

const SECTION_PATTERNS: [SectionKey, RegExp][] = [
  ['summary', /^(professional\s+)?(summary|profile|objective|about(\s+me)?|career\s+summary|overview)$/],
  ['experience', /^(professional\s+|work\s+|relevant\s+)?(experience|employment(\s+history)?|work\s+history|career\s+history)$/],
  ['education', /^(education|academic\s+background|education\s*(&|and)\s*training|training)$/],
  ['skills', /^((core|technical|key)\s+)?(skills|competencies|expertise|technologies|skills\s*(&|and)\s*\w+)$/],
  ['certifications', /^(certifications?|licen[sc]es?|certifications?\s*(&|and)\s*licen[sc]es?|licen[sc]es?\s*(&|and)\s*certifications?)$/],
  ['projects', /^((selected|personal|key)\s+)?projects$/],
  ['awards', /^(awards?|honors?|achievements?|awards?\s*(&|and)\s*honors?|honors?\s*(&|and)\s*awards?)$/],
];

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /\+?\(?\d[\d\s().-]{7,}\d/;
const LINKEDIN = /(https?:\/\/)?(www\.)?linkedin\.com\/[^\s|,]+/i;
const URL = /(https?:\/\/)?(www\.)?[a-z0-9-]+\.(com|net|org|io|dev|me|co|ai|app|info)(\/[^\s|,]*)?/i;
const BULLET = /^\s*([•●▪◦‣∙·*\-–—]|\d+[.)])\s+/;
const MONTH = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE_TOKEN = `(${MONTH}\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})`;
const DATE_RANGE = new RegExp(`${DATE_TOKEN}\\s*(-|–|—|to)\\s*(${DATE_TOKEN}|present|current|now)`, 'i');
const SINGLE_DATE = new RegExp(`${DATE_TOKEN}$`, 'i');

export function detectSection(line: string): SectionKey | null {
  const normalized = line.toLowerCase().replace(/[:\s]+$/, '').replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > 40) return null;
  for (const [key, pattern] of SECTION_PATTERNS) {
    if (pattern.test(normalized)) return key;
  }
  return null;
}

const stripBullet = (line: string) => line.replace(BULLET, '').trim();
const isBullet = (line: string) => BULLET.test(line);

function splitTitleCompany(line: string): { title: string; company: string; location: string } {
  const cleaned = line.trim();
  const separators = [/\s+[|–—]\s+/, /\s+-\s+/, /\s+at\s+/i, /,\s+/];
  for (const separator of separators) {
    const pieces = cleaned.split(separator).map((p) => p.trim()).filter(Boolean);
    if (pieces.length >= 2) {
      return { title: pieces[0], company: pieces[1], location: pieces.slice(2).join(', ') };
    }
  }
  return { title: cleaned, company: '', location: '' };
}

function extractDates(line: string): { rest: string; start: string; end: string } | null {
  const match = line.match(DATE_RANGE);
  if (!match || match.index === undefined) return null;
  const [start, end] = match[0].split(/\s*(?:-|–|—|\bto\b)\s*/i);
  const rest = (line.slice(0, match.index) + line.slice(match.index + match[0].length))
    .replace(/[|,()–—-]\s*$/, '')
    .replace(/^\s*[|,()–—-]/, '')
    .trim();
  return { rest, start: (start ?? '').trim(), end: (end ?? '').trim() };
}

function splitList(text: string): string[] {
  return text
    .split(/[,;•●▪|]|\s{2,}|\s+-\s+/)
    .map((s) => s.replace(/^[a-z ]+:\s*/i, (label) => (label.length < 25 ? '' : label)).trim())
    .filter((s) => s.length > 0 && s.length <= 60);
}

export function parseResumeText(raw: string): ResumeData {
  const resume = emptyResume();
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\t/g, ' ').replace(/\s+$/, ''))
    .filter((line) => line.trim().length > 0);

  const buckets: Record<SectionKey | 'header', string[]> = {
    header: [], summary: [], experience: [], education: [], skills: [],
    certifications: [], projects: [], awards: [],
  };
  let current: SectionKey | 'header' = 'header';
  for (const line of lines) {
    const section = detectSection(line);
    if (section) {
      current = section;
      continue;
    }
    buckets[current].push(line);
  }

  parseHeader(buckets.header, resume);

  // Summary: first sentence-like line becomes the tagline, bullets stay bullets.
  for (const line of buckets.summary) {
    if (isBullet(line)) resume.summary.bullets.push(stripBullet(line));
    else if (!resume.summary.tagline) resume.summary.tagline = line.trim();
    else resume.summary.tagline = `${resume.summary.tagline} ${line.trim()}`;
  }

  resume.summary.skills = Array.from(new Set(buckets.skills.flatMap((line) => splitList(stripBullet(line)))));
  resume.experience = parseExperience(buckets.experience);
  resume.education = parseEducation(buckets.education);

  resume.certifications = buckets.certifications.map((line) => {
    const item = emptyCertification();
    let text = stripBullet(line);
    const date = text.match(SINGLE_DATE);
    if (date && date.index !== undefined) {
      item.date = date[0];
      text = text.slice(0, date.index).replace(/[\s,(|–—-]+$/, '');
    }
    const [name, ...org] = text.split(/\s+[|–—-]\s+|,\s+/);
    item.name = (name ?? '').trim();
    item.org = org.join(', ').trim();
    return item;
  });

  let project: ReturnType<typeof emptyProject> | null = null;
  for (const line of buckets.projects) {
    if (isBullet(line) && project) {
      project.bullets.push(stripBullet(line));
    } else if (!isBullet(line)) {
      project = emptyProject();
      const [name, ...description] = line.trim().split(/\s+[|–—-]\s+|:\s+/);
      project.name = (name ?? '').trim();
      project.description = description.join(' – ').trim();
      resume.projects.push(project);
    }
  }

  resume.awards = buckets.awards.map(stripBullet).filter(Boolean);
  return resume;
}

function parseHeader(lines: string[], resume: ResumeData) {
  const leftovers: string[] = [];
  for (const line of lines) {
    let rest = line;
    const take = (pattern: RegExp): string => {
      const match = rest.match(pattern);
      if (!match) return '';
      rest = rest.replace(match[0], ' ');
      return match[0].trim();
    };
    if (!resume.contact.email) resume.contact.email = take(EMAIL);
    if (!resume.contact.linkedin) resume.contact.linkedin = take(LINKEDIN);
    if (!resume.contact.phone) resume.contact.phone = take(PHONE);
    if (!resume.contact.website) resume.contact.website = take(URL);
    const remaining = rest
      .split(/\s*[|•·]\s*|\s{2,}/)
      .map((part) => part.trim())
      .filter((part) => part.length > 1);
    leftovers.push(...remaining);
  }

  // First leftover that looks like a name (2–5 words, no digits) is the name.
  const nameIndex = leftovers.findIndex((part) => /^[^\d@]{2,60}$/.test(part) && part.split(/\s+/).length <= 5);
  if (nameIndex >= 0) {
    resume.name = leftovers[nameIndex];
    leftovers.splice(nameIndex, 1);
  }
  // A "City, ST" style fragment becomes the location.
  const locationIndex = leftovers.findIndex((part) => /^[A-Za-z .'-]+,\s*[A-Za-z .]{2,}$/.test(part));
  if (locationIndex >= 0) {
    resume.contact.location = leftovers[locationIndex];
    leftovers.splice(locationIndex, 1);
  }
  // Anything else in the header reads like a headline; use it as the tagline.
  if (leftovers.length && !resume.summary.tagline) {
    resume.summary.tagline = leftovers.join(' · ');
  }
}

function parseExperience(lines: string[]): Experience[] {
  const entries: Experience[] = [];
  let entry: Experience | null = null;
  let headerLines = 0;

  const start = (): Experience => {
    const next = emptyExperience();
    entries.push(next);
    headerLines = 0;
    return next;
  };

  for (const line of lines) {
    if (isBullet(line)) {
      entry ??= start();
      entry.bullets.push(stripBullet(line));
      continue;
    }
    const dates = extractDates(line);
    // A new role starts on a dated line, or on a plain line after bullets.
    if (!entry || (dates && (entry.start || entry.bullets.length)) || (!dates && entry.bullets.length)) {
      entry = start();
    }
    const current = entry;
    const text = dates ? dates.rest : line.trim();
    if (dates) {
      current.start = dates.start;
      current.end = dates.end;
    }
    if (!text) continue;
    if (headerLines === 0) {
      const parts = splitTitleCompany(text);
      current.title = parts.title;
      current.company = parts.company;
      current.location = parts.location;
    } else if (headerLines === 1 && !current.company) {
      const parts = splitTitleCompany(text);
      current.company = parts.title;
      current.location = parts.company || parts.location;
    } else {
      current.summary = current.summary ? `${current.summary} ${text}` : text;
    }
    headerLines += 1;
  }
  return entries;
}

function parseEducation(lines: string[]) {
  const entries: ReturnType<typeof emptyEducation>[] = [];
  let entry: ReturnType<typeof emptyEducation> | null = null;
  let headerLines = 0;
  for (const line of lines) {
    let text = stripBullet(line);
    const range = extractDates(text);
    let date = '';
    if (range) {
      date = [range.start, range.end].filter(Boolean).join(' – ');
      text = range.rest;
    } else {
      const single = text.match(SINGLE_DATE);
      if (single && single.index !== undefined) {
        date = single[0];
        text = text.slice(0, single.index).replace(/[\s,(|–—-]+$/, '');
      }
    }
    const looksLikeDegree = /\b(bachelor|master|associate|doctor|ph\.?d|mba|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|diploma|certificate|degree)\b/i.test(text);
    if (!entry || (looksLikeDegree && entry.degree) || headerLines >= 3) {
      entry = emptyEducation();
      entries.push(entry);
      headerLines = 0;
    }
    if (date && !entry.date) entry.date = date;
    if (!text) continue;
    if (/honou?rs|cum laude|gpa|dean'?s list|scholar/i.test(text) && (entry.degree || entry.school)) {
      entry.honors = entry.honors ? `${entry.honors}; ${text}` : text;
    } else if (looksLikeDegree && !entry.degree) {
      const [degree, ...rest] = text.split(/\s+[|–—-]\s+|,\s+(?=[A-Z])/);
      entry.degree = (degree ?? '').trim();
      if (rest.length && !entry.school) entry.school = rest.join(', ').trim();
    } else if (!entry.school) {
      const [school, ...rest] = text.split(/\s+[|–—-]\s+/);
      entry.school = (school ?? '').trim();
      if (rest.length) entry.location = rest.join(', ').trim();
    } else if (!entry.degree) {
      entry.degree = text;
    } else if (!entry.location) {
      entry.location = text;
    }
    headerLines += 1;
  }
  return entries;
}

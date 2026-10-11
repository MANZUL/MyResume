import { isLanguage, type Language } from '../i18n/languages';
import { JOB_DESCRIPTION_MAX } from '../job-match/types';
import { LOCAL_PROFILE_FIELDS, type LocalProfile } from '../profile/local-profile';
import type { ResumeData } from '../resume/types';
import { isHexColor } from '../shared/text';
import { getTemplate, TEMPLATES } from '../templates/templates';

// My Resume backup file, format "my-resume-backup", version 1.
//
// A UTF-8 JSON document holding everything the user can lose with the app:
//
//   format          "my-resume-backup"
//   version         1 (an integer; the file layout, not the app version)
//   createdAt       ISO 8601 UTC timestamp of the backup
//   settings        { appLanguage: "en" | "de" | "fr" | "es" | "ar" | null }
//   profile         the Local Profile (7 text fields + updatedAt), or null when it is empty
//   currentResumeId the id of the current resume, or null
//   resumes[]       { id, title, templateId, accent, language, createdAt, updatedAt,
//                     data: the full resume content, targetJob: { title, company, description,
//                     updatedAt } | null }
//
// INCLUDED: every resume with all of its content, its language, template, accent color, title and
// timestamps; the job description saved for it (Job Match); the Local Profile; the app language;
// which resume is current. Resume ids are kept because the current-resume pointer and the job
// descriptions refer to them.
//
// NOT INCLUDED (on purpose): export files, export handles and the export history, the database's
// own tables, columns and version, autosave state and every other transient screen state, the
// paper-size choice (a session value), analysis results (they are recomputed), and anything
// from the removed purchase code. The file holds no credential, token or secret.
//
// COMPATIBILITY POLICY
//  - `version` is checked first. A file with a higher version is refused as unsupported and
//    nothing is changed. A change that older readers could misread MUST raise the version.
//  - Within version 1 every field above is REQUIRED (except `settings`, `profile`,
//    `currentResumeId` and `targetJob`, which may be missing or null); a missing or wrongly typed
//    field makes the whole file invalid.
//  - Fields this version does not know are IGNORED (so a later, compatible writer may add
//    optional fields). They are not restored. Nothing this version knows is dropped.
//  - Template ids, languages and accent colors are validated against the current app; a value the
//    app does not know makes the file invalid, so it is never silently replaced by a default.
//  - Everything is validated before anything is written, and the file is restored all or nothing.
//
// The file is NOT encrypted. It contains personal details; where it is saved is up to the user.

export const BACKUP_FORMAT = 'my-resume-backup';
export const BACKUP_VERSION = 1;

/** Largest backup file accepted: 20 MiB. A resume is tens of kilobytes; this allows hundreds. */
export const BACKUP_MAX_BYTES = 20 * 1024 * 1024;
export const BACKUP_MAX_RESUMES = 500;

const MAX_ID = 128;
// Generous on purpose: the app limits few fields, and a backup it wrote must always be restorable.
const MAX_TITLE = 10_000;
const MAX_FIELD = 200_000;
const MAX_LIST = 5_000;

export type BackupErrorCode =
  | 'invalid' // not a valid backup file
  | 'unsupported-version' // written by a newer version of the format
  | 'too-large'
  | 'read-failed' // the file could not be read
  | 'write-failed' // the backup could not be created or shared
  | 'database' // the database refused; nothing was changed
  | 'unsaved-changes' // current edits could not be saved first; nothing was changed
  | 'busy'; // another storage operation is running

export class BackupError extends Error {
  /** `detail` names the field (for example "resumes[2].accent"), never its content. */
  constructor(
    readonly code: BackupErrorCode,
    readonly detail = '',
  ) {
    super(`Backup error: ${code}${detail ? ` (${detail})` : ''}`);
    this.name = 'BackupError';
  }
}

export interface BackupTargetJob {
  title: string;
  company: string;
  description: string;
  updatedAt: number;
}

export interface BackupResume {
  id: string;
  title: string;
  templateId: string;
  accent: string;
  language: Language;
  createdAt: number;
  updatedAt: number;
  data: ResumeData;
  targetJob: BackupTargetJob | null;
}

export type BackupProfile = LocalProfile;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  settings: { appLanguage: Language | null };
  profile: BackupProfile | null;
  currentResumeId: string | null;
  resumes: BackupResume[];
}

/** What the database holds, read at one moment. */
export interface BackupSnapshot {
  resumes: BackupResume[];
  currentResumeId: string | null;
  profile: BackupProfile | null;
  appLanguage: Language | null;
  /** Rows that could not be read (corrupted); they are not in `resumes`. */
  unreadable: number;
}

export function buildBackup(snapshot: BackupSnapshot, now: number): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date(now).toISOString(),
    settings: { appLanguage: snapshot.appLanguage },
    profile: snapshot.profile,
    currentResumeId: snapshot.currentResumeId,
    resumes: snapshot.resumes,
  };
}

/** UTF-8 JSON, two-space indented. Arabic and accented text are written as typed (no escaping). */
export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 2);
}

/** "my-resume-backup-2026-10-22.json" (the UTC date of the backup). */
export function backupFileName(now: number): string {
  return `my-resume-backup-${new Date(now).toISOString().slice(0, 10)}.json`;
}

// --- validation ---

const fail = (path: string): never => {
  throw new BackupError('invalid', path);
};

type Json = Record<string, unknown>;

const object = (value: unknown, path: string): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : fail(path);

const text = (value: unknown, path: string, max = MAX_FIELD): string =>
  typeof value === 'string' && value.length <= max ? value : fail(path);

const integer = (value: unknown, path: string): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fail(path);

const list = (value: unknown, path: string, max = MAX_LIST): unknown[] =>
  Array.isArray(value) && value.length <= max ? value : fail(path);

const strings = (value: unknown, path: string): string[] => list(value, path).map((item, i) => text(item, `${path}[${i}]`));

function contact(value: unknown, path: string): ResumeData['contact'] {
  const v = object(value, path);
  return {
    phone: text(v.phone, `${path}.phone`),
    email: text(v.email, `${path}.email`),
    location: text(v.location, `${path}.location`),
    linkedin: text(v.linkedin, `${path}.linkedin`),
    website: text(v.website, `${path}.website`),
  };
}

function resumeData(value: unknown, path: string): ResumeData {
  const v = object(value, path);
  const summary = object(v.summary, `${path}.summary`);
  return {
    name: text(v.name, `${path}.name`),
    contact: contact(v.contact, `${path}.contact`),
    summary: {
      tagline: text(summary.tagline, `${path}.summary.tagline`),
      bullets: strings(summary.bullets, `${path}.summary.bullets`),
      skills: strings(summary.skills, `${path}.summary.skills`),
    },
    experience: list(v.experience, `${path}.experience`).map((item, i) => {
      const p = `${path}.experience[${i}]`;
      const e = object(item, p);
      return {
        title: text(e.title, `${p}.title`),
        company: text(e.company, `${p}.company`),
        location: text(e.location, `${p}.location`),
        start: text(e.start, `${p}.start`),
        end: text(e.end, `${p}.end`),
        summary: text(e.summary, `${p}.summary`),
        bullets: strings(e.bullets, `${p}.bullets`),
      };
    }),
    education: list(v.education, `${path}.education`).map((item, i) => {
      const p = `${path}.education[${i}]`;
      const e = object(item, p);
      return {
        degree: text(e.degree, `${p}.degree`),
        school: text(e.school, `${p}.school`),
        location: text(e.location, `${p}.location`),
        date: text(e.date, `${p}.date`),
        honors: text(e.honors, `${p}.honors`),
      };
    }),
    certifications: list(v.certifications, `${path}.certifications`).map((item, i) => {
      const p = `${path}.certifications[${i}]`;
      const c = object(item, p);
      return { name: text(c.name, `${p}.name`), org: text(c.org, `${p}.org`), date: text(c.date, `${p}.date`) };
    }),
    projects: list(v.projects, `${path}.projects`).map((item, i) => {
      const p = `${path}.projects[${i}]`;
      const o = object(item, p);
      return { name: text(o.name, `${p}.name`), description: text(o.description, `${p}.description`), bullets: strings(o.bullets, `${p}.bullets`) };
    }),
    awards: strings(v.awards, `${path}.awards`),
  };
}

function targetJob(value: unknown, path: string): BackupTargetJob | null {
  if (value === undefined || value === null) return null;
  const v = object(value, path);
  return {
    title: text(v.title, `${path}.title`, 200),
    company: text(v.company, `${path}.company`, 200),
    description: text(v.description, `${path}.description`, JOB_DESCRIPTION_MAX),
    updatedAt: integer(v.updatedAt, `${path}.updatedAt`),
  };
}

function profile(value: unknown): BackupProfile | null {
  if (value === undefined || value === null) return null;
  const v = object(value, 'profile');
  const result = { name: '', email: '', phone: '', location: '', headline: '', linkedin: '', website: '', updatedAt: 0 };
  for (const field of LOCAL_PROFILE_FIELDS) result[field] = text(v[field], `profile.${field}`, 2000);
  result.updatedAt = integer(v.updatedAt, 'profile.updatedAt');
  return result;
}

function resume(value: unknown, index: number): BackupResume {
  const path = `resumes[${index}]`;
  const v = object(value, path);
  const templateId = text(v.templateId, `${path}.templateId`, MAX_ID);
  // getTemplate falls back to a default for unknown ids; a backup must name a real one.
  if (!TEMPLATES.some((template) => template.id === templateId) || getTemplate(templateId).id !== templateId) fail(`${path}.templateId`);
  const accent = text(v.accent, `${path}.accent`, 7);
  if (!isHexColor(accent)) fail(`${path}.accent`);
  const language = v.language;
  if (typeof language !== 'string' || !isLanguage(language)) fail(`${path}.language`);
  const id = text(v.id, `${path}.id`, MAX_ID);
  if (!id) fail(`${path}.id`);
  return {
    id,
    title: text(v.title, `${path}.title`, MAX_TITLE),
    templateId,
    accent,
    language: language as Language,
    createdAt: integer(v.createdAt, `${path}.createdAt`),
    updatedAt: integer(v.updatedAt, `${path}.updatedAt`),
    data: resumeData(v.data, `${path}.data`),
    targetJob: targetJob(v.targetJob, `${path}.targetJob`),
  };
}

/**
 * Checks a backup file's text completely, before anything is written, and returns a clean
 * copy holding only the fields this version knows. Throws BackupError: 'too-large',
 * 'unsupported-version' or 'invalid'. File names and MIME types are never consulted.
 */
export function parseBackup(raw: string): BackupFile {
  if (raw.length > BACKUP_MAX_BYTES) throw new BackupError('too-large');
  let json: unknown;
  try {
    json = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    throw new BackupError('invalid', 'json');
  }
  const root = object(json, 'file');
  if (root.format !== BACKUP_FORMAT) fail('format');
  const version = root.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) fail('version');
  if ((version as number) > BACKUP_VERSION) throw new BackupError('unsupported-version', String(version));

  const createdAt = text(root.createdAt, 'createdAt', 64);
  if (Number.isNaN(Date.parse(createdAt))) fail('createdAt');
  const settings = root.settings === undefined || root.settings === null ? {} : object(root.settings, 'settings');
  const appLanguage = settings.appLanguage;
  if (appLanguage !== undefined && appLanguage !== null && (typeof appLanguage !== 'string' || !isLanguage(appLanguage))) fail('settings.appLanguage');

  const resumes = list(root.resumes, 'resumes', BACKUP_MAX_RESUMES).map(resume);
  const ids = new Set<string>();
  for (const [index, item] of resumes.entries()) {
    if (ids.has(item.id)) fail(`resumes[${index}].id`); // duplicate ids would overwrite each other
    ids.add(item.id);
  }
  const current = root.currentResumeId;
  if (current !== undefined && current !== null && (typeof current !== 'string' || !ids.has(current))) fail('currentResumeId');

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    settings: { appLanguage: (appLanguage ?? null) as Language | null },
    profile: profile(root.profile),
    currentResumeId: (current ?? null) as string | null,
    resumes,
  };
}

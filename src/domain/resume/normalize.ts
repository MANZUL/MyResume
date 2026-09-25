import { isHexColor } from '../shared/text';
import { getTemplate } from '../templates/templates';
import type {
  Certification,
  Education,
  Experience,
  Project,
  ResumeData,
  StoredResume,
} from './types';

// Repairs resume data read from storage. Stored JSON can be missing fields or
// have wrong types (older app versions, interrupted writes, manual edits of a
// backup). Repair means: keep every valid value, replace missing or invalid
// values with empty defaults, drop list items that are not the right shape.
// It never invents content.

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const strList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const objList = <T>(value: unknown, map: (item: Json) => T): T[] =>
  Array.isArray(value) ? value.filter(isObject).map(map) : [];

export function normalizeResumeData(value: unknown): ResumeData {
  const data = isObject(value) ? value : {};
  const contact = isObject(data.contact) ? data.contact : {};
  const summary = isObject(data.summary) ? data.summary : {};
  return {
    name: str(data.name),
    contact: {
      phone: str(contact.phone),
      email: str(contact.email),
      location: str(contact.location),
      linkedin: str(contact.linkedin),
      website: str(contact.website),
    },
    summary: {
      tagline: str(summary.tagline),
      bullets: strList(summary.bullets),
      skills: strList(summary.skills),
    },
    experience: objList<Experience>(data.experience, (item) => ({
      title: str(item.title),
      company: str(item.company),
      location: str(item.location),
      start: str(item.start),
      end: str(item.end),
      summary: str(item.summary),
      bullets: strList(item.bullets),
    })),
    education: objList<Education>(data.education, (item) => ({
      degree: str(item.degree),
      school: str(item.school),
      location: str(item.location),
      date: str(item.date),
      honors: str(item.honors),
    })),
    certifications: objList<Certification>(data.certifications, (item) => ({
      name: str(item.name),
      org: str(item.org),
      date: str(item.date),
    })),
    projects: objList<Project>(data.projects, (item) => ({
      name: str(item.name),
      description: str(item.description),
      bullets: strList(item.bullets),
    })),
    awards: strList(data.awards),
  };
}

const finiteTime = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

/**
 * Repairs a stored resume record. Returns null only when the record has no
 * usable id, because without an id it cannot be addressed or saved.
 */
export function normalizeStoredResume(value: unknown, now: number): StoredResume | null {
  if (!isObject(value)) return null;
  const id = str(value.id).trim();
  if (!id) return null;
  const template = getTemplate(str(value.templateId));
  const accent = str(value.accent);
  const updatedAt = finiteTime(value.updatedAt, now);
  return {
    id,
    title: str(value.title),
    templateId: template.id,
    accent: isHexColor(accent) ? accent : template.defaultAccent,
    data: normalizeResumeData(value.data),
    createdAt: finiteTime(value.createdAt, updatedAt),
    updatedAt,
  };
}

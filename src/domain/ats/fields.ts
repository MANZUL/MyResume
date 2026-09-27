import type { ResumeData } from '../resume/types';
import { text } from '../i18n/analysis-text';
import { at, loc, personal } from './locations';
import type { AtsLocation } from './types';

// Every text value of a resume, with where it is in the editor. Rules iterate this
// instead of knowing the data shape.

export type FieldKind = 'name' | 'contact' | 'line' | 'paragraph' | 'item' | 'skill' | 'date';

export interface TextField {
  value: string;
  kind: FieldKind;
  /** Stable key, e.g. "experience.1.bullets.2". */
  key: string;
  location: AtsLocation;
}

export function textFields(data: ResumeData): TextField[] {
  const out: TextField[] = [];
  const add = (value: string, kind: FieldKind, key: string, location: AtsLocation) => {
    if (typeof value === 'string' && value !== '') out.push({ value, kind, key, location });
  };
  const field = (key: string, params?: Record<string, number>) => text(`analysis.location.field.${key}`, params);
  add(data.name, 'name', 'name', personal('name'));
  for (const key of ['email', 'phone', 'location', 'linkedin', 'website'] as const) {
    add(data.contact[key], 'contact', `contact.${key}`, personal(key));
  }
  add(data.summary.tagline, 'paragraph', 'summary.tagline', loc('summary', text('analysis.location.tagline')));
  data.summary.bullets.forEach((b, i) => add(b, 'item', `summary.bullets.${i}`, loc('summary', text('analysis.location.summaryBullet', { n: i + 1 }))));
  data.summary.skills.forEach((s, i) => add(s, 'skill', `summary.skills.${i}`, loc('summary', text('analysis.location.skill', { n: i + 1 }))));
  data.experience.forEach((e, i) => {
    const on = (f: ReturnType<typeof field>) => at('experience', i, f);
    add(e.title, 'line', `experience.${i}.title`, on(field('jobTitle')));
    add(e.company, 'line', `experience.${i}.company`, on(field('company')));
    add(e.location, 'line', `experience.${i}.location`, on(field('location')));
    add(e.start, 'date', `experience.${i}.start`, on(field('startDate')));
    add(e.end, 'date', `experience.${i}.end`, on(field('endDate')));
    add(e.summary, 'paragraph', `experience.${i}.summary`, on(field('shortSummary')));
    e.bullets.forEach((b, j) => add(b, 'item', `experience.${i}.bullets.${j}`, on(field('accomplishment', { n: j + 1 }))));
  });
  data.education.forEach((e, i) => {
    const on = (f: ReturnType<typeof field>) => at('education', i, f);
    add(e.degree, 'line', `education.${i}.degree`, on(field('degree')));
    add(e.school, 'line', `education.${i}.school`, on(field('school')));
    add(e.location, 'line', `education.${i}.location`, on(field('location')));
    add(e.date, 'date', `education.${i}.date`, on(field('date')));
    add(e.honors, 'line', `education.${i}.honors`, on(field('honors')));
  });
  data.certifications.forEach((c, i) => {
    const on = (f: ReturnType<typeof field>) => at('certifications', i, f);
    add(c.name, 'line', `certifications.${i}.name`, on(field('name')));
    add(c.org, 'line', `certifications.${i}.org`, on(field('organization')));
    add(c.date, 'date', `certifications.${i}.date`, on(field('date')));
  });
  data.projects.forEach((p, i) => {
    const on = (f: ReturnType<typeof field>) => at('projects', i, f);
    add(p.name, 'line', `projects.${i}.name`, on(field('projectName')));
    add(p.description, 'paragraph', `projects.${i}.description`, on(field('shortDescription')));
    p.bullets.forEach((b, j) => add(b, 'item', `projects.${i}.bullets.${j}`, on(field('accomplishment', { n: j + 1 }))));
  });
  data.awards.forEach((a, i) => add(a, 'item', `awards.${i}`, loc('awards', text('analysis.location.award', { n: i + 1 }))));
  return out;
}

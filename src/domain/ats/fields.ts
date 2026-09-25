import type { ResumeData } from '../resume/types';
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
  const personal = (label: string): AtsLocation => ({ section: 'personal', label });
  add(data.name, 'name', 'name', personal('Full Name'));
  const contactLabels = { email: 'Email', phone: 'Phone', location: 'Location', linkedin: 'LinkedIn', website: 'Website' } as const;
  for (const key of Object.keys(contactLabels) as (keyof typeof contactLabels)[]) {
    add(data.contact[key], 'contact', `contact.${key}`, personal(contactLabels[key]));
  }
  const summary = (label: string): AtsLocation => ({ section: 'summary', label });
  add(data.summary.tagline, 'paragraph', 'summary.tagline', summary('Tagline'));
  data.summary.bullets.forEach((b, i) => add(b, 'item', `summary.bullets.${i}`, summary(`Summary bullet ${i + 1}`)));
  data.summary.skills.forEach((s, i) => add(s, 'skill', `summary.skills.${i}`, summary(`Skill ${i + 1}`)));
  data.experience.forEach((e, i) => {
    const at = (label: string): AtsLocation => ({ section: 'experience', label: `Experience ${i + 1} · ${label}` });
    add(e.title, 'line', `experience.${i}.title`, at('Job Title'));
    add(e.company, 'line', `experience.${i}.company`, at('Company'));
    add(e.location, 'line', `experience.${i}.location`, at('Location'));
    add(e.start, 'date', `experience.${i}.start`, at('Start Date'));
    add(e.end, 'date', `experience.${i}.end`, at('End Date'));
    add(e.summary, 'paragraph', `experience.${i}.summary`, at('Short Summary'));
    e.bullets.forEach((b, j) => add(b, 'item', `experience.${i}.bullets.${j}`, at(`Accomplishment ${j + 1}`)));
  });
  data.education.forEach((e, i) => {
    const at = (label: string): AtsLocation => ({ section: 'education', label: `Education ${i + 1} · ${label}` });
    add(e.degree, 'line', `education.${i}.degree`, at('Degree'));
    add(e.school, 'line', `education.${i}.school`, at('School'));
    add(e.location, 'line', `education.${i}.location`, at('Location'));
    add(e.date, 'date', `education.${i}.date`, at('Date'));
    add(e.honors, 'line', `education.${i}.honors`, at('Honors'));
  });
  data.certifications.forEach((c, i) => {
    const at = (label: string): AtsLocation => ({ section: 'certifications', label: `Certification ${i + 1} · ${label}` });
    add(c.name, 'line', `certifications.${i}.name`, at('Name'));
    add(c.org, 'line', `certifications.${i}.org`, at('Organization'));
    add(c.date, 'date', `certifications.${i}.date`, at('Date'));
  });
  data.projects.forEach((p, i) => {
    const at = (label: string): AtsLocation => ({ section: 'projects', label: `Project ${i + 1} · ${label}` });
    add(p.name, 'line', `projects.${i}.name`, at('Project Name'));
    add(p.description, 'paragraph', `projects.${i}.description`, at('Short Description'));
    p.bullets.forEach((b, j) => add(b, 'item', `projects.${i}.bullets.${j}`, at(`Accomplishment ${j + 1}`)));
  });
  data.awards.forEach((a, i) => add(a, 'item', `awards.${i}`, { section: 'awards', label: `Award ${i + 1}` }));
  return out;
}

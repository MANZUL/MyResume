// The editor's seven sections, in editor order. Resume Score warnings point at
// one of them, and the "Improve" link reopens the editor on that section.

export const EDITOR_SECTIONS = ['personal', 'summary', 'experience', 'education', 'certifications', 'projects', 'awards'] as const;
export type EditorSection = (typeof EDITOR_SECTIONS)[number];

/** Section titles as in the web editor (spec parity). */
export const SECTION_TITLES: Record<EditorSection, string> = {
  personal: 'Personal Information',
  summary: 'Summary & Skills',
  experience: 'Experience',
  education: 'Education',
  certifications: 'Certifications',
  projects: 'Projects',
  awards: 'Awards',
};

/**
 * Reads the `section` route parameter. Only the seven known section ids are accepted;
 * anything else (missing, empty, arrays, other strings, inherited object keys) is null.
 */
export function parseSectionParam(value: unknown): EditorSection | null {
  if (typeof value !== 'string') return null;
  return (EDITOR_SECTIONS as readonly string[]).includes(value) ? (value as EditorSection) : null;
}

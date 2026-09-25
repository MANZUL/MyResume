import type { EditorSection } from '../../domain/resume/sections';

/** Resume Check copy, as in the web tool. */
export const CHECK_COPY = {
  title: 'Resume Score',
  working: 'What is working',
  attention: 'Needs attention',
  improve: 'Improve',
  disclaimer: 'Designed for reliable parsing with standard headings and readable text. No ATS guarantee is implied.',
} as const;

/**
 * Where "Improve" goes: back to this resume's editor, on the warning's section.
 * `jump` is new for every tap, so the same section can be opened again.
 */
export function improveHref(resumeId: string, section: EditorSection, jump: number) {
  return { pathname: '/resume/[id]' as const, params: { id: resumeId, section, jump: String(jump) } };
}

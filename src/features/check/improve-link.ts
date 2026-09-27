import type { EditorSection } from '../../domain/resume/sections';

/**
 * Where "Improve" goes: back to this resume's editor, on the warning's section.
 * `jump` is new for every tap, so the same section can be opened again.
 */
export function improveHref(resumeId: string, section: EditorSection, jump: number) {
  return { pathname: '/resume/[id]' as const, params: { id: resumeId, section, jump: String(jump) } };
}

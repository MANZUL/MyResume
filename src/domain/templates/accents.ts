import { getTemplate } from './templates';

// The accent colors offered in the preview: the template's default accent plus the
// spec's 8 presets (MANZUL/Resume home.tsx:623). Any valid color can be used.
export const PRESET_ACCENTS = [
  '#171717', '#1A365D', '#0F766E', '#065F46', '#B45309', '#9F1239', '#4338CA', '#E63946',
] as const;

export function accentsFor(templateId: string): string[] {
  return Array.from(new Set([getTemplate(templateId).defaultAccent, ...PRESET_ACCENTS]));
}

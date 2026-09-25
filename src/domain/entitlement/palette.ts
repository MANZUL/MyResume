import { getTemplate } from '../templates/templates';

// FREE colors: the template's default accent plus the spec's 8 presets
// (MANZUL/Resume home.tsx:623). Any other color is a PREMIUM custom accent.
export const FREE_PRESET_ACCENTS = [
  '#171717', '#1A365D', '#0F766E', '#065F46', '#B45309', '#9F1239', '#4338CA', '#E63946',
] as const;

export function freeAccentsFor(templateId: string): string[] {
  return Array.from(new Set([getTemplate(templateId).defaultAccent, ...FREE_PRESET_ACCENTS]));
}

export function isFreeAccent(templateId: string, accent: string): boolean {
  const normalized = accent.trim().toUpperCase();
  return freeAccentsFor(templateId).some((color) => color.toUpperCase() === normalized);
}

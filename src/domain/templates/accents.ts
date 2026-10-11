import { normalizeHexColor } from '../shared/text';
import { getTemplate } from './templates';

// The accent colors offered in the preview: the template's default accent plus the
// spec's 8 presets (MANZUL/Resume home.tsx:623). Any valid color can be used.
export const PRESET_ACCENTS = [
  '#171717', '#1A365D', '#0F766E', '#065F46', '#B45309', '#9F1239', '#4338CA', '#E63946',
] as const;

/** Shown in the error message for a color that is not six hex digits. */
export const CUSTOM_COLOR_EXAMPLE = '#A85432';

/**
 * Validates a color typed by the user before it is applied. A valid one (six hex digits, "#"
 * optional) comes back as "#RRGGBB"; anything else leaves `current` untouched.
 */
export function customAccent(input: string, current: string): { valid: boolean; accent: string } {
  const color = normalizeHexColor(input);
  return color ? { valid: true, accent: color } : { valid: false, accent: current };
}

export function accentsFor(templateId: string): string[] {
  return Array.from(new Set([getTemplate(templateId).defaultAccent, ...PRESET_ACCENTS]));
}

import type { PaperSize } from '../render/render-html';

// The paper size an export starts with, before the user picks one. Letter is the standard in
// the United States, Canada and a few Latin American countries and the Philippines; every
// other country uses A4. The country comes from the device locale tag (for example "de-DE")
// when the platform reports one. When it does not (a bare "en" or "ar"), the default is Letter,
// which is what the PDF export always used before the choice existed. This is a starting
// point only: the Preview screen shows the selection and never claims it follows the region.

const LETTER_REGIONS = new Set(['US', 'CA', 'MX', 'GT', 'SV', 'HN', 'NI', 'CR', 'PA', 'DO', 'PR', 'CO', 'VE', 'CL', 'BO', 'PH']);

/** The region of a BCP 47 / POSIX locale tag ("en-US", "zh-Hans-CN", "es_MX"), or null. */
export function regionOf(tag: string): string | null {
  const match = /^[A-Za-z]{2,3}(?:[-_][A-Za-z]{4})?[-_]([A-Za-z]{2})(?:[-_@.]|$)/.exec(tag.trim());
  return match ? match[1].toUpperCase() : null;
}

export function defaultPaperSize(localeTags: readonly string[]): PaperSize {
  for (const tag of localeTags) {
    const region = regionOf(tag);
    if (region) return LETTER_REGIONS.has(region) ? 'letter' : 'a4';
  }
  return 'letter';
}

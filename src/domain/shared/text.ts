export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Convert a hex color like #1B2B47 to rgba with given opacity
export function tintHex(hex: string, opacity: number): string {
  const cleanHex = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(cleanHex)) return hex;
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

// Letters and digits kept in file names. Explicit ranges, not \p{L}, so the result is
// the same on every JavaScript engine (Hermes on iOS/Android, Node in tests):
// ASCII, Latin-1 and Latin Extended letters, combining marks, Greek, Cyrillic, Hebrew,
// Arabic letters and digits (not Arabic punctuation), Latin Extended Additional,
// Hiragana/Katakana, CJK and Hangul. Everything else (spaces, punctuation, path and
// shell characters, emoji, control and bidi-control characters) is a separator.
const NAME_CHAR =
  '0-9a-z\\u00DF-\\u00F6\\u00F8-\\u02AF\\u0300-\\u036F\\u0370-\\u03FF\\u0400-\\u052F\\u05D0-\\u05EA' +
  '\\u0610-\\u061A\\u0620-\\u0669\\u066E-\\u06D3\\u06D5-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF' +
  '\\u1E00-\\u1EFF\\u3040-\\u30FF\\u4E00-\\u9FFF\\uAC00-\\uD7AF';
const SEPARATORS = new RegExp(`[^${NAME_CHAR}]+`, 'g');
// Zero-width and bidi-control characters are dropped, not turned into separators, so they
// cannot join or reorder visible parts of a name (e.g. a reversed extension).
const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
// Names Windows cannot save, even with an extension (files are shared to desktops too).
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
const MAX_NAME_CHARS = 60;

/**
 * A readable, safe file name (without extension). Unicode letters are kept:
 * "Zoë Müller" → "zoë-müller", "محمد أحمد" → "محمد-أحمد". Deterministic: NFC, lower case,
 * separators collapsed to "-", at most 60 characters, never empty, never a reserved name.
 */
export function fileSafeName(name: string, fallback = 'resume'): string {
  let value = name || '';
  try {
    value = value.normalize('NFC');
  } catch {
    // Engines without normalize keep the text as typed.
  }
  value = value.replace(INVISIBLE, '').toLowerCase().replace(SEPARATORS, '-').replace(/^-+|-+$/g, '');
  value = Array.from(value).slice(0, MAX_NAME_CHARS).join('').replace(/-+$/, '');
  if (!value) return fallback;
  return RESERVED.test(value) ? `${value}-${fallback}` : value;
}

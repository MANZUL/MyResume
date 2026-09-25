// Conservative date grammar for the ATS dates check (English, V1). A value is
// "recognized" only in formats parsers commonly read: "Mar 2020", "March 2020",
// "03/2020", "2020-03", "2020", "Present"; ranges "X – Y" and "Expected X".

export type DateStyle = 'month-name' | 'numeric' | 'year' | 'present';

export interface ParsedDate {
  style: DateStyle;
  /** Comparable value: year * 12 + month (month 0 when unknown). Present = Infinity. */
  value: number;
  hasMonth: boolean;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const PRESENT = /^(present|current|now|today|ongoing)$/i;
const MIN_YEAR = 1950;
const MAX_YEAR = 2100;

function monthIndex(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (w === 'sept') return 8;
  const i = MONTHS.findIndex((m) => w === m || (w.length > 3 && m === w.slice(0, 3) && fullMonth(m).startsWith(w)));
  return i;
}
const fullMonth = (abbr: string) =>
  ({ jan: 'january', feb: 'february', mar: 'march', apr: 'april', may: 'may', jun: 'june', jul: 'july', aug: 'august', sep: 'september', oct: 'october', nov: 'november', dec: 'december' })[abbr]!;

const validYear = (y: number) => y >= MIN_YEAR && y <= MAX_YEAR;

/** Parses one date, or returns null when the format is not recognized. */
export function parseDate(raw: string): ParsedDate | null {
  const s = raw.trim();
  if (PRESENT.test(s)) return { style: 'present', value: Infinity, hasMonth: false };
  let m = /^([A-Za-z]{3,9}\.?)\s+(\d{4})$/.exec(s);
  if (m) {
    const month = monthIndex(m[1]);
    const year = Number(m[2]);
    return month >= 0 && validYear(year) ? { style: 'month-name', value: year * 12 + month + 1, hasMonth: true } : null;
  }
  m = /^(\d{1,2})\/(\d{4})$/.exec(s) ?? null;
  if (m) {
    const [month, year] = [Number(m[1]), Number(m[2])];
    return month >= 1 && month <= 12 && validYear(year) ? { style: 'numeric', value: year * 12 + month, hasMonth: true } : null;
  }
  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) {
    const [year, month] = [Number(m[1]), Number(m[2])];
    return month >= 1 && month <= 12 && validYear(year) ? { style: 'numeric', value: year * 12 + month, hasMonth: true } : null;
  }
  m = /^(\d{4})$/.exec(s);
  if (m) {
    const year = Number(m[1]);
    return validYear(year) ? { style: 'year', value: year * 12, hasMonth: false } : null;
  }
  return null;
}

/** A single field may hold one date, "Expected <date>", or a range "<date> – <date>". */
export function parseDateField(raw: string): ParsedDate[] | null {
  const s = raw.trim().replace(/^expected\s+/i, '');
  const parts = s.split(/\s*(?:–|—|-|\bto\b)\s*/i).filter((p) => p !== '');
  // A bare "2020-03" is one numeric date, not a range.
  const single = parseDate(s);
  if (single) return [single];
  if (parts.length !== 2) return null;
  const range = parts.map(parseDate);
  return range.every((d): d is ParsedDate => d !== null) ? range : null;
}

/** start ≤ end, comparing months only when both have one. */
export function isOrdered(start: ParsedDate, end: ParsedDate): boolean {
  if (end.style === 'present') return true;
  if (start.style === 'present') return false;
  if (start.hasMonth && end.hasMonth) return start.value <= end.value;
  return Math.floor(start.value / 12) <= Math.floor(end.value / 12);
}

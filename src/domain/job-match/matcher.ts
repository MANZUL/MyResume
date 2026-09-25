import { TAXONOMY, type TaxonomyTerm } from './taxonomy';

// Boundary-aware, case-aware matching of taxonomy terms in one line of text.
// - A term never matches inside a longer word or name: "Java" is not found in
//   "JavaScript", "C" is not found in "C++" or "Cloud", "SQL" is not found in "MySQL".
// - Where terms overlap, the longest wins ("React Native" is not also "React").
// - Short or ambiguous terms have extra gates (case, sentence start, list context).

export interface Hit {
  termId: string;
  start: number;
  end: number;
}

// Characters that continue a word or a technology name.
const WORD = 'A-Za-z0-9\\u00C0-\\u024F';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function aliasSource(alias: string, plural: boolean): string {
  // Hyphens first (optional hyphen or space), then spaces (any run of spaces or hyphens).
  let source = escape(alias).replace(/-/g, '[\\s-]?').replace(/ /g, '[\\s\\u00A0-]+');
  if (plural && /[A-Za-z]$/.test(alias)) source += '(?:e?s)?';
  const before = alias.startsWith('.') ? `(?<![${WORD}])` : `(?<![${WORD}+#.])`;
  // Not followed by a word character, "+"/"#" (C → C++), or ".x" (Node → Node.js).
  const after = `(?![${WORD}+#]|\\.[${WORD}])`;
  return `${before}(?:${source})${after}`;
}

interface Compiled {
  term: TaxonomyTerm;
  regex: RegExp;
}

const COMPILED: readonly Compiled[] = TAXONOMY.map((term) => {
  const sources = [...term.aliases.map((a) => aliasSource(a, Boolean(term.plural))), ...(term.patterns ?? [])];
  return { term, regex: new RegExp(sources.join('|'), term.caseSensitive ? 'g' : 'gi') };
});

const TERMS_BY_ID = new Map(TAXONOMY.map((term) => [term.id, term]));
export const termById = (id: string) => TERMS_BY_ID.get(id);

/** Programming languages: the anchors that confirm a list-context term ("Python, R and SQL"). */
const LANGUAGE_IDS = new Set(['python', 'java', 'javascript', 'typescript', 'csharp', 'cpp', 'c', 'go', 'rust', 'ruby', 'php', 'kotlin', 'swift', 'scala', 'r', 'sql', 'bash']);
const SEPARATOR_ONLY = /^[\s,/&()]*(?:\b(?:and|or)\b)?[\s,/&()]*$/i;

const atSentenceStart = (line: string, index: number) => /^\s*(?:[-*•]\s*)?$/.test(line.slice(0, index)) || /[.!?:]\s+$/.test(line.slice(0, index));

export interface FindOptions {
  /**
   * The line is one entry of a Skills list: it names a skill by definition, so the
   * sentence-start gate does not apply, and a short spelling ("R", "Go") counts when it
   * is the whole entry.
   */
  skillEntry?: boolean;
}

/** Every accepted taxonomy hit in one line, sorted by position. */
export function findHits(line: string, options: FindOptions = {}): Hit[] {
  const candidates: (Hit & { gated: boolean })[] = [];
  for (const { term, regex } of COMPILED) {
    regex.lastIndex = 0;
    for (const m of line.matchAll(regex)) {
      if (!m[0]) continue;
      if (!options.skillEntry && term.notSentenceStart?.includes(m[0]) && atSentenceStart(line, m.index)) continue;
      const short = Boolean(term.listContext?.includes(m[0]));
      // In a Skills entry a short spelling counts only as the whole entry ("R"), never inside
      // another name ("Go-to-Market").
      if (short && options.skillEntry && line.trim() !== m[0]) continue;
      const gated = short && !options.skillEntry;
      candidates.push({ termId: term.id, start: m.index, end: m.index + m[0].length, gated });
    }
  }
  // Longest first; drop anything overlapping an accepted hit.
  candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const accepted: (Hit & { gated: boolean })[] = [];
  for (const c of candidates) if (!accepted.some((a) => c.start < a.end && a.start < c.end)) accepted.push(c);
  accepted.sort((a, b) => a.start - b.start);

  // List-context spellings ("R", "Go", "C") survive only next to a confirmed language.
  const confirmed = new Set(accepted.filter((h) => !h.gated));
  let changed = true;
  while (changed) {
    changed = false;
    accepted.forEach((h, i) => {
      if (confirmed.has(h)) return;
      const neighbours = [accepted[i - 1], accepted[i + 1]].filter(Boolean);
      const ok = neighbours.some((n) => {
        if (!confirmed.has(n) || !LANGUAGE_IDS.has(n.termId)) return false;
        const gap = n.start > h.start ? line.slice(h.end, n.start) : line.slice(n.end, h.start);
        return SEPARATOR_ONLY.test(gap);
      });
      if (ok) {
        confirmed.add(h);
        changed = true;
      }
    });
  }
  return accepted.filter((h) => confirmed.has(h)).map(({ termId, start, end }) => ({ termId, start, end }));
}

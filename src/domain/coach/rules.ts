import { BULLET_FIELDS, type CoachCategory, type CoachContext, type CoachFinding, type CoachFix, type CoachRuleId } from './types';
import {
  A_BEFORE_VOWEL_PREFIXES,
  ALLOWED_REPEATS,
  BUZZWORDS,
  CAPITALIZABLE_FIRST_WORDS,
  FILLER_WORDS,
  OUTCOME_VERBS,
  PASSIVE_PARTICIPLES,
  PAST_OPENERS,
  QUANTITY_WORDS,
  VERB_TENSES,
  WEAK_OPENERS,
  WORDY_PHRASES,
} from './wordlists';

// Each rule is conservative: it fires only on listed words and patterns, and returns
// nothing when it is unsure (owner decision: no findings for the sake of findings).

type Rule = (text: string, context: CoachContext) => Omit<CoachFinding, 'textKey'>[];

interface Word {
  w: string;
  start: number;
  end: number;
}

const WORD = /[A-Za-z][A-Za-z'’-]*/g;
const words = (text: string): Word[] => [...text.matchAll(WORD)].map((m) => ({ w: m[0], start: m.index, end: m.index + m[0].length }));
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const isUpperStart = (s: string) => /^[A-Z]/.test(s);
/** Gives `replacement` the capitalisation of `original`'s first letter. */
const matchCase = (replacement: string, original: string) => (isUpperStart(original) ? capitalize(replacement) : lowerFirst(replacement));
const isBullet = (context: CoachContext) => BULLET_FIELDS.includes(context.field);
/** True when index is the start of the text or of a sentence. */
const atSentenceStart = (text: string, index: number) => /^\s*$/.test(text.slice(0, index)) || /[.!?]\s+$/.test(text.slice(0, index));

type RuleFinding = Omit<CoachFinding, 'textKey'>;

function finding(rule: CoachRuleId, category: CoachCategory, start: number, end: number, message: string, fix?: CoachFix): RuleFinding {
  return { id: `${rule}:${start}:${end}`, rule, category, start, end, message, ...(fix ? { fix } : {}) };
}

type Tense = 'present' | 'past';
/** Tense of a bullet's first word, or null when unsure. */
function tenseOf(opener: string, lenient: boolean): Tense | null {
  const word = opener.toLowerCase();
  if (word in VERB_TENSES || (word.endsWith('s') && word.slice(0, -1) in VERB_TENSES) || (word.endsWith('es') && word.slice(0, -2) in VERB_TENSES)) {
    return 'present';
  }
  if (PAST_OPENERS.has(word)) return 'past';
  if (lenient && /^[a-z]{3,}ed$/.test(word)) return 'past';
  return null;
}

// --- impact ---

const weakOpener: Rule = (text, context) => {
  if (!isBullet(context)) return [];
  for (const { phrase, options } of WEAK_OPENERS) {
    const m = new RegExp(`^(\\s*)(${escapeRe(phrase)})(?=\\s)`, 'i').exec(text);
    if (!m) continue;
    const start = m[1].length;
    const end = start + m[2].length;
    const next = words(text.slice(end))[0];
    // "Responsible for managing…" would need the verb rewritten: not a safe fix, so skip.
    if (!next || /ing$/i.test(next.w)) return [];
    return [
      finding('weak-opener', 'impact', start, end, `"${m[2]}" is a weak opener. Pick a verb that says what you did; these keep the same level of claim.`, {
        kind: 'choices',
        options: options.map((option) => matchCase(option, m[2])),
      }),
    ];
  }
  return [];
};

const passive: Rule = (text) => {
  const out: RuleFinding[] = [];
  for (const m of text.matchAll(/\b(was|were|is|are|been|being)\s+(?:[a-z]+ly\s+)?([a-z]+)\b/gi)) {
    if (!PASSIVE_PARTICIPLES.has(m[2].toLowerCase()) || /[A-Z]/.test(m[2])) continue;
    out.push(finding('passive', 'impact', m.index, m.index + m[0].length, `Passive wording ("${m[0]}") hides who did the work. If you did it, start with the action.`));
  }
  return out;
};

const repeatedOpener: Rule = (text, context) => {
  if (!isBullet(context)) return [];
  const first = words(text)[0];
  if (!first || !atSentenceStart(text, first.start)) return [];
  const opener = first.w.toLowerCase();
  if (!tenseOf(opener, false)) return [];
  const same = context.siblings.filter((s) => s.opener === opener).length;
  if (same < 2) return [];
  return [finding('repeated-opener', 'impact', first.start, first.end, `${same + 1} bullets in this entry start with "${first.w}". Varying the opening verb reads better.`)];
};

// --- measurable ---

const measurable: Rule = (text, context) => {
  if (context.field !== 'experienceBullet') return [];
  const lower = words(text).map((w) => w.w.toLowerCase());
  // Only when the bullet's main claim is an outcome ("Reduced costs…"); an outcome verb
  // in a subordinate clause ("…a loop that reduced…") is not confident enough.
  if (!OUTCOME_VERBS.has(lower[0] ?? '')) return [];
  if (/\d|%|\$|€|£/.test(text) || lower.some((w) => QUANTITY_WORDS.has(w))) return [];
  const start = text.length - text.trimStart().length;
  return [finding('measurable', 'measurable', start, text.trimEnd().length, 'Can you add a measurable result here?')];
};

// --- concise ---

const filler: Rule = (text) => {
  const out: RuleFinding[] = [];
  const all = words(text);
  all.forEach((word, i) => {
    const lower = word.w.toLowerCase();
    if (!FILLER_WORDS.includes(lower)) return;
    const sentenceStart = atSentenceStart(text, word.start);
    if (word.w !== lower && !(sentenceStart && word.w === capitalize(lower))) return; // proper noun or acronym
    const next = all[i + 1];
    if (!next || text.slice(word.end, next.start) !== ' ') return;
    const replacement = sentenceStart ? capitalize(next.w) : next.w;
    out.push(finding('filler', 'concise', word.start, next.end, `"${word.w}" adds little; removing it keeps the meaning.`, { kind: 'preview', replacement }));
  });
  return out;
};

const buzzword: Rule = (text) => {
  const out: RuleFinding[] = [];
  for (const phrase of BUZZWORDS) {
    for (const m of text.matchAll(new RegExp(`(?<![\\w-])${escapeRe(phrase)}(?![\\w-])`, 'gi'))) {
      out.push(finding('buzzword', 'professional', m.index, m.index + m[0].length, `"${m[0]}" is a generic description; a specific result says more.`));
    }
  }
  return out;
};

const longBullet: Rule = (text, context) => {
  if (!isBullet(context)) return [];
  const count = text.trim().split(/\s+/).filter(Boolean).length;
  if (count <= 32) return [];
  const start = text.length - text.trimStart().length;
  return [finding('long-bullet', 'concise', start, text.trimEnd().length, `This bullet has ${count} words. Aim for 32 or fewer so the result is easy to scan.`)];
};

const wordy: Rule = (text) => {
  const out: RuleFinding[] = [];
  const taken: [number, number][] = [];
  const phrases = [...WORDY_PHRASES].sort((a, b) => b.phrase.length - a.phrase.length);
  for (const { phrase, replacement } of phrases) {
    for (const m of text.matchAll(new RegExp(`\\b${escapeRe(phrase)}\\b`, 'gi'))) {
      const start = m.index;
      const end = start + m[0].length;
      if (taken.some(([a, b]) => start < b && a < end)) continue;
      taken.push([start, end]);
      out.push(finding('wordy', 'concise', start, end, `"${m[0]}" can be shorter: "${replacement}".`, { kind: 'preview', replacement: matchCase(replacement, m[0]) }));
    }
  }
  return out;
};

// --- professional ---

const firstPerson: Rule = (text) => {
  const out: RuleFinding[] = [];
  for (const m of text.matchAll(/(?<![\w/.’'-])(I|me|my|myself|mine|Me|My|Myself|Mine)(?![\w/’'.-])/g)) {
    const word = m[1];
    if (word !== 'I' && word !== word.toLowerCase() && !atSentenceStart(text, m.index)) continue;
    const start = m.index;
    let fix: CoachFix | undefined;
    let end = start + word.length;
    // "I led the team" → "Led the team": only when a known past-tense verb follows at the start.
    if (word === 'I' && atSentenceStart(text, start)) {
      const verb = /^ ([a-z]+)\b/.exec(text.slice(end));
      if (verb && PAST_OPENERS.has(verb[1])) {
        end = end + verb[0].length;
        fix = { kind: 'preview', replacement: capitalize(verb[1]) };
      }
    }
    out.push(finding('first-person', 'professional', start, end, `Resumes usually leave out "${word}"; start with the action instead.`, fix));
  }
  return out;
};

// --- grammar (mechanics and tense) ---

const spacing: Rule = (text) => {
  const out: RuleFinding[] = [];
  if (!text.trim()) return out;
  const lead = text.length - text.trimStart().length;
  if (lead > 0) out.push(finding('spacing', 'grammar', 0, lead, 'Extra space at the start.', { kind: 'auto', replacement: '' }));
  for (const m of text.matchAll(/(?<=\S)[ \t]{2,}(?=\S)/g)) {
    out.push(finding('spacing', 'grammar', m.index, m.index + m[0].length, 'Extra space between words.', { kind: 'auto', replacement: ' ' }));
  }
  const trimmedEnd = text.trimEnd().length;
  if (trimmedEnd < text.length) out.push(finding('spacing', 'grammar', trimmedEnd, text.length, 'Extra space at the end.', { kind: 'auto', replacement: '' }));
  return out;
};

const capitalization: Rule = (text) => {
  const first = words(text)[0];
  if (!first || !atSentenceStart(text, first.start) || first.start !== text.length - text.trimStart().length) return [];
  if (first.w !== first.w.toLowerCase() || !CAPITALIZABLE_FIRST_WORDS.has(first.w)) return [];
  return [finding('capitalization', 'grammar', first.start, first.start + 1, 'Start with a capital letter.', { kind: 'auto', replacement: first.w[0].toUpperCase() })];
};

const finalPeriod: Rule = (text, context) => {
  if (!isBullet(context) || context.siblings.length < 2) return [];
  const trimmed = text.trimEnd();
  if (!trimmed) return [];
  const end = trimmed.length;
  if (context.siblings.every((s) => s.endsWithPeriod) && /[A-Za-z0-9)]$/.test(trimmed)) {
    return [finding('final-period', 'grammar', end, end, 'The other bullets in this entry end with a period.', { kind: 'auto', replacement: '.' })];
  }
  const abbreviation = /\b(etc|inc|ltd|co|jr|sr|e\.g|i\.e|u\.s)\.$/i.test(trimmed);
  if (context.siblings.every((s) => !s.endsWithPeriod) && /[^.]\.$/.test(trimmed) && !abbreviation) {
    return [finding('final-period', 'grammar', end - 1, end, 'The other bullets in this entry do not end with a period.', { kind: 'auto', replacement: '' })];
  }
  return [];
};

const repeatedWord: Rule = (text) => {
  const out: RuleFinding[] = [];
  // Lookahead, so each word can be both the second of one pair and the first of the next.
  for (const m of text.matchAll(/\b([A-Za-z]+)\b(?=(\s+)([A-Za-z]+)\b)/g)) {
    if (m[1].toLowerCase() !== m[3].toLowerCase() || ALLOWED_REPEATS.has(m[1].toLowerCase())) continue;
    if (isUpperStart(m[3])) continue; // "Walla Walla", names
    const start = m.index + m[1].length;
    out.push(finding('repeated-word', 'grammar', start, start + m[2].length + m[3].length, `"${m[3]}" is repeated.`, { kind: 'auto', replacement: '' }));
  }
  return out;
};

const aAn: Rule = (text) => {
  const out: RuleFinding[] = [];
  for (const m of text.matchAll(/(?<![\w'’-])(a|an|A|An)\s+([a-z][a-z-]*)/g)) {
    const [article, next] = [m[1], m[2]];
    if (isUpperStart(article) && !atSentenceStart(text, m.index)) continue; // "Plan A is…"
    const vowelStart = /^[aeio]/.test(next) && !A_BEFORE_VOWEL_PREFIXES.some((p) => next.startsWith(p));
    const consonantStart = /^[bcdfgjklmnpqrstvwyz]/.test(next);
    const lower = article.toLowerCase();
    let replacement: string | null = null;
    if (lower === 'a' && vowelStart) replacement = 'an';
    if (lower === 'an' && consonantStart) replacement = 'a';
    if (!replacement) continue;
    out.push(finding('a-an', 'grammar', m.index, m.index + article.length, `Use "${replacement}" before "${next}".`, { kind: 'auto', replacement: matchCase(replacement, article) }));
  }
  return out;
};

const tense: Rule = (text, context) => {
  if (!isBullet(context) || context.siblings.length < 2) return [];
  const first = words(text)[0];
  if (!first || first.start !== text.length - text.trimStart().length) return [];
  const mine = tenseOf(first.w, false);
  if (!mine) return [];
  const theirs = context.siblings.map((s) => tenseOf(s.opener, true));
  if (theirs.some((t) => t === null)) return []; // unsure about a sibling
  if (!theirs.every((t) => t !== mine)) return [];
  return [
    finding('tense', 'grammar', first.start, first.end, `The other bullets in this entry use the ${theirs[0]} tense; this one starts with "${first.w}" (${mine} tense).`),
  ];
};

export const RULES: readonly { id: string; run: Rule }[] = [
  { id: 'weak-opener', run: weakOpener },
  { id: 'passive', run: passive },
  { id: 'repeated-opener', run: repeatedOpener },
  { id: 'measurable', run: measurable },
  { id: 'filler', run: filler },
  { id: 'buzzword', run: buzzword },
  { id: 'long-bullet', run: longBullet },
  { id: 'wordy', run: wordy },
  { id: 'first-person', run: firstPerson },
  { id: 'spacing', run: spacing },
  { id: 'capitalization', run: capitalization },
  { id: 'final-period', run: finalPeriod },
  { id: 'repeated-word', run: repeatedWord },
  { id: 'a-an', run: aAn },
  { id: 'tense', run: tense },
];

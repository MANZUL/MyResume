// Fixed word lists for the Writing Coach (English, V1). Conservative on purpose:
// a rule only fires on entries listed here.

/**
 * Weak openers and their NEUTRAL alternatives. An alternative never claims more
 * than the original (no "Led", "Managed", "Owned" for "Helped with").
 */
export const WEAK_OPENERS: readonly { phrase: string; options: readonly string[] }[] = [
  { phrase: 'helped with', options: ['Supported', 'Contributed to', 'Assisted with'] },
  { phrase: 'assisted with', options: ['Supported', 'Contributed to'] },
  { phrase: 'was involved in', options: ['Contributed to', 'Participated in'] },
  { phrase: 'worked on', options: ['Contributed to'] },
  { phrase: 'responsible for', options: ['Handled'] },
];

/** Adverbs that can be removed without changing the claim. */
export const FILLER_WORDS: readonly string[] = ['very', 'really', 'extremely', 'basically', 'actually', 'truly', 'successfully'];

/** Generic self-descriptions: flagged with advice only (removing them could break the sentence). */
export const BUZZWORDS: readonly string[] = [
  'results-driven', 'results-oriented', 'hard-working', 'hardworking', 'go-getter', 'self-starter',
  'team player', 'detail-oriented', 'think outside the box', 'synergy', 'passionate',
];

/** Wordy phrase → plain phrase. Replacements use only function words (see COACH_ALLOWED_WORDS). */
export const WORDY_PHRASES: readonly { phrase: string; replacement: string }[] = [
  { phrase: 'due to the fact that', replacement: 'because' },
  { phrase: 'in order to', replacement: 'to' },
  { phrase: 'a large number of', replacement: 'many' },
  { phrase: 'at this point in time', replacement: 'now' },
  { phrase: 'on a daily basis', replacement: 'daily' },
  { phrase: 'on a weekly basis', replacement: 'weekly' },
  { phrase: 'on a monthly basis', replacement: 'monthly' },
  { phrase: 'in the event that', replacement: 'if' },
  { phrase: 'with the exception of', replacement: 'except' },
  { phrase: 'for the purpose of', replacement: 'for' },
  { phrase: 'prior to', replacement: 'before' },
  { phrase: 'has the ability to', replacement: 'can' },
  { phrase: 'is able to', replacement: 'can' },
  { phrase: 'utilized', replacement: 'used' },
  { phrase: 'utilize', replacement: 'use' },
  { phrase: 'utilizes', replacement: 'uses' },
  { phrase: 'utilizing', replacement: 'using' },
];

/**
 * The only words a fix may add. Neutral verbs from WEAK_OPENERS plus the function
 * words of WORDY_PHRASES and a/an. Nothing here is a fact, skill, employer, date,
 * technology or achievement, and none of it raises a claim.
 */
export const COACH_ALLOWED_WORDS: ReadonlySet<string> = new Set([
  'supported', 'contributed', 'to', 'assisted', 'with', 'participated', 'in', 'handled',
  'because', 'many', 'now', 'daily', 'weekly', 'monthly', 'if', 'except', 'for', 'before', 'can',
  'use', 'used', 'uses', 'using', 'a', 'an',
]);

/** Verbs that claim more than a neutral contribution. A fix may never introduce one. */
export const ELEVATED_CLAIM_WORDS: ReadonlySet<string> = new Set([
  'led', 'lead', 'leading', 'managed', 'manage', 'owned', 'own', 'spearheaded', 'drove', 'directed', 'headed',
  'oversaw', 'architected', 'founded', 'created', 'built', 'launched', 'delivered', 'achieved', 'developed',
  'designed', 'established', 'pioneered', 'championed', 'transformed', 'grew', 'increased', 'reduced', 'improved',
]);

/** Past participles for the passive check. Honours ("was awarded", "was promoted") are excluded on purpose. */
export const PASSIVE_PARTICIPLES: ReadonlySet<string> = new Set([
  'created', 'developed', 'designed', 'implemented', 'launched', 'managed', 'built', 'completed', 'delivered',
  'established', 'introduced', 'organized', 'improved', 'reduced', 'increased', 'handled', 'maintained',
  'written', 'performed', 'conducted', 'prepared', 'produced', 'executed', 'led', 'coordinated', 'deployed',
]);

/**
 * Verbs whose base form is not also a common noun at the start of a bullet,
 * with their past tense. Used for tense consistency and repeated openers.
 */
export const VERB_TENSES: Readonly<Record<string, string>> = {
  manage: 'managed', develop: 'developed', create: 'created', maintain: 'maintained', coordinate: 'coordinated',
  implement: 'implemented', deliver: 'delivered', analyze: 'analyzed', write: 'wrote', oversee: 'oversaw',
  handle: 'handled', reduce: 'reduced', improve: 'improved', increase: 'increased', launch: 'launched',
  organize: 'organized', mentor: 'mentored', prepare: 'prepared', conduct: 'conducted', establish: 'established',
  negotiate: 'negotiated', collaborate: 'collaborated', optimize: 'optimized', streamline: 'streamlined',
  facilitate: 'facilitated', spearhead: 'spearheaded', grow: 'grew', deploy: 'deployed', automate: 'automated',
};

/** Irregular or common past-tense openers that are not in VERB_TENSES values. */
export const PAST_OPENERS: ReadonlySet<string> = new Set([
  ...Object.values(VERB_TENSES), 'led', 'built', 'ran', 'drove', 'won', 'made', 'sold', 'taught', 'designed',
  'supported', 'owned', 'launched', 'partnered', 'trained', 'planned', 'tested', 'presented',
]);

/** Outcome verbs: a bullet using one without any quantity gets the measurable question. */
export const OUTCOME_VERBS: ReadonlySet<string> = new Set([
  'increased', 'increase', 'increasing', 'reduced', 'reduce', 'reducing', 'improved', 'improve', 'improving',
  'grew', 'grow', 'growing', 'decreased', 'decrease', 'cut', 'saved', 'save', 'boosted', 'boost',
  'accelerated', 'lowered', 'raised', 'expanded', 'shortened',
]);

/** Words that already express a quantity. */
export const QUANTITY_WORDS: ReadonlySet<string> = new Set([
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'twenty',
  'thirty', 'fifty', 'hundred', 'hundreds', 'thousand', 'thousands', 'million', 'millions', 'billion', 'dozen',
  'dozens', 'double', 'doubled', 'triple', 'tripled', 'half', 'halved', 'twice', 'percent',
  'third', 'thirds', 'quarter', 'fifth', 'tenth', 'twofold', 'threefold', 'fourfold', 'tenfold',
]);

/**
 * Lower-case first words that are safe to capitalise (common English words that are
 * never a lower-case product name like "npm" or "iOS").
 */
export const CAPITALIZABLE_FIRST_WORDS: ReadonlySet<string> = new Set([
  ...Object.keys(VERB_TENSES), ...PAST_OPENERS, ...FILLER_WORDS, 'the', 'a', 'an', 'and', 'with', 'for', 'helped',
  'assisted', 'worked', 'responsible', 'was', 'were', 'participated', 'contributed', 'handled', 'strategic',
  'experienced', 'senior', 'product', 'team', 'customer', 'data', 'internal', 'weekly', 'monthly', 'daily',
]);

/** Adjacent repeats that are correct English. */
export const ALLOWED_REPEATS: ReadonlySet<string> = new Set(['that', 'had']);

/** "a" is right before these although they start with a vowel letter; "an" is right before silent-h words. */
export const A_BEFORE_VOWEL_PREFIXES: readonly string[] = ['one', 'once', 'eu', 'ewe', 'uni', 'use', 'usu', 'ur', 'uti'];

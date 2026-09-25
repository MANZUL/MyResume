import { COACH_ALLOWED_WORDS, ELEVATED_CLAIM_WORDS } from './wordlists';

// The no-fact invariant (plan §1, owner decision for step 8): a Coach fix may not add
// a number, percentage, currency, skill, employer, date, technology, achievement or
// a stronger claim than the source. Adapted from the web's source-grounding checks,
// but stricter: new words may come ONLY from COACH_ALLOWED_WORDS (function words and
// neutral verbs), never from a general editorial list.

const tokens = (text: string) => text.toLowerCase().match(/[a-z][a-z0-9]*(?:\+\+|#)?/g) ?? [];
/** Numbers end with a digit, so "v2.1." contains 2.1, not "2.1.". */
const numbers = (text: string) => text.match(/\d(?:[\d.,]*\d)?/g) ?? [];
const count = (text: string, char: string) => text.split(char).length - 1;

export type GroundingFailure = 'new_number' | 'new_symbol' | 'new_word' | 'elevated_claim';

/** Null when `output` adds nothing factual to `source`; otherwise the first failure found. */
export function groundingFailure(output: string, source: string): GroundingFailure | null {
  const sourceNumbers = new Set(numbers(source));
  if (numbers(output).some((n) => !sourceNumbers.has(n))) return 'new_number';
  for (const symbol of ['%', '$', '€', '£', '+', '#', '@']) {
    if (count(output, symbol) > count(source, symbol)) return 'new_symbol';
  }
  const sourceTokens = new Set(tokens(source));
  const added = tokens(output).filter((t) => !sourceTokens.has(t));
  if (added.some((t) => ELEVATED_CLAIM_WORDS.has(t))) return 'elevated_claim';
  if (added.some((t) => !COACH_ALLOWED_WORDS.has(t))) return 'new_word';
  return null;
}

export const isGrounded = (output: string, source: string) => groundingFailure(output, source) === null;

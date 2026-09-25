import { isGrounded } from './grounding';
import { RULES } from './rules';
import {
  COACH_FIELDS,
  COACH_LIMITS,
  CoachFixRejectedError,
  CoachInputError,
  CoachStaleFindingError,
  type CoachContext,
  type CoachField,
  type CoachFinding,
  type CoachReport,
  type SiblingSummary,
} from './types';

// Entry points of the Writing Coach engine. Pure: callers (PremiumTools) do the
// entitlement checks. Apply is safe by construction:
//   1. the finding must be reproduced by analysing the current text (else stale);
//   2. only its own span changes;
//   3. the result must pass the grounding check (no new fact), or nothing changes.

/** Summarises the other bullets of the entry for context-aware rules (read-only: first word + final period). */
export function buildCoachContext(field: CoachField, siblings: readonly string[] = []): CoachContext {
  return {
    field,
    siblings: siblings
      .filter((s) => typeof s === 'string' && s.trim())
      .map((s) => ({
        opener: (/[A-Za-z][A-Za-z'’-]*/.exec(s)?.[0] ?? '').toLowerCase(),
        endsWithPeriod: /\.$/.test(s.trim()),
      })),
  };
}

/** Length + FNV-1a hash: a compact key for "this exact text". */
export function textKey(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length}:${hash.toString(16)}`;
}

const contextLength = (siblings: readonly SiblingSummary[]) => siblings.reduce((sum, s) => sum + s.opener.length + 1, 0);

function validate(text: unknown, context: CoachContext): asserts text is string {
  if (typeof text !== 'string') throw new CoachInputError('invalid_context');
  if (text.length > COACH_LIMITS.maxTextLength) throw new CoachInputError('text_too_long');
  if (!context || !COACH_FIELDS.includes(context.field) || !Array.isArray(context.siblings)) throw new CoachInputError('invalid_context');
  for (const s of context.siblings) {
    if (typeof s?.opener !== 'string' || typeof s.endsWithPeriod !== 'boolean' || s.opener.length > COACH_LIMITS.maxOpenerLength) {
      throw new CoachInputError('invalid_context');
    }
  }
  if (contextLength(context.siblings) > COACH_LIMITS.maxContextLength) throw new CoachInputError('context_too_long');
}

export function analyzeText(text: string, context: CoachContext): CoachReport {
  validate(text, context);
  const key = textKey(text);
  const findings = RULES.flatMap((rule) => rule.run(text, context)).map((f) => ({ ...f, textKey: key }));
  const order = new Map(RULES.map((rule, i) => [rule.id, i]));
  findings.sort((a, b) => a.start - b.start || order.get(a.rule)! - order.get(b.rule)!);
  const unique = findings.filter((f, i) => findings.findIndex((g) => g.id === f.id) === i);
  return { text, field: context.field, findings: unique };
}

const sameFinding = (a: CoachFinding, b: CoachFinding) =>
  a.id === b.id && a.textKey === b.textKey && a.start === b.start && a.end === b.end && JSON.stringify(a.fix ?? null) === JSON.stringify(b.fix ?? null);

/** Applies a finding the caller got from analyzeText on exactly this text and context. */
export function applyFix(text: string, context: CoachContext, finding: CoachFinding, choice?: number): string {
  if (finding?.textKey !== textKey(text)) throw new CoachStaleFindingError();
  const current = analyzeText(text, context).findings.find((f) => sameFinding(f, finding));
  if (!current) throw new CoachStaleFindingError();
  return applyVerifiedFix(text, current, choice);
}

/** The last gate before text changes: span-local replacement, then the grounding check. */
export function applyVerifiedFix(text: string, finding: CoachFinding, choice?: number): string {
  const fix = finding.fix;
  if (!fix) throw new CoachFixRejectedError('no_fix');
  if (!Number.isInteger(finding.start) || !Number.isInteger(finding.end) || finding.start < 0 || finding.end > text.length || finding.start > finding.end) {
    throw new CoachFixRejectedError('out_of_range');
  }
  let replacement: string;
  if (fix.kind === 'choices') {
    if (typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice >= fix.options.length) {
      throw new CoachFixRejectedError('invalid_choice');
    }
    replacement = fix.options[choice];
  } else {
    replacement = fix.replacement;
  }
  const output = text.slice(0, finding.start) + replacement + text.slice(finding.end);
  if (!isGrounded(output, text)) throw new CoachFixRejectedError('not_grounded');
  return output;
}

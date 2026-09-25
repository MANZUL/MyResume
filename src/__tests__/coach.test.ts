import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeText, applyFix, applyVerifiedFix, buildCoachContext, textKey } from '../domain/coach/coach';
import { groundingFailure } from '../domain/coach/grounding';
import {
  COACH_FIELDS,
  CoachFixRejectedError,
  CoachInputError,
  CoachStaleFindingError,
  type CoachField,
  type CoachFinding,
  type CoachRuleId,
} from '../domain/coach/types';
import { COACH_ALLOWED_WORDS, ELEVATED_CLAIM_WORDS, WEAK_OPENERS, WORDY_PHRASES } from '../domain/coach/wordlists';
import { PremiumRequiredError } from '../domain/entitlement/features';
import { MemoryEntitlementCacheStore } from '../services/entitlement/cache-store';
import { EntitlementService } from '../services/entitlement/entitlement-service';
import { FakeStoreProvider } from '../services/entitlement/fake-store';
import { PaywallCoordinator } from '../services/entitlement/paywall';
import { PremiumGate } from '../services/entitlement/premium-gate';
import { PremiumTools } from '../services/premium/premium-tools';
import { STRONG, WEAK, type CorpusEntry } from './fixtures/coach-corpus';

const SRC = join(__dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

const analyze = (text: string, field: CoachField = 'experienceBullet', siblings: string[] = []) =>
  analyzeText(text, buildCoachContext(field, siblings));
const rulesOf = (text: string, field?: CoachField, siblings?: string[]) => analyze(text, field, siblings).findings.map((f) => f.rule);
const only = (rule: CoachRuleId, text: string, field?: CoachField, siblings?: string[]) =>
  analyze(text, field, siblings).findings.filter((f) => f.rule === rule);
const covered = (text: string, f: CoachFinding) => text.slice(f.start, f.end);

// --- 1. rules: positive, negative, borderline ---

describe('rules: positive, negative and borderline cases', () => {
  it('weak opener: neutral choices only, bullets only, skipped when the verb would need rewriting', () => {
    const [f] = only('weak-opener', 'Helped with the migration of billing');
    expect(covered('Helped with the migration of billing', f)).toBe('Helped with');
    expect(f.fix).toEqual({ kind: 'choices', options: ['Supported', 'Contributed to', 'Assisted with'] });
    expect(only('weak-opener', 'Was involved in the redesign')[0].fix).toEqual({ kind: 'choices', options: ['Contributed to', 'Participated in'] });
    expect(only('weak-opener', 'helped with the launch')[0].fix).toEqual({ kind: 'choices', options: ['supported', 'contributed to', 'assisted with'] });
    // negative
    expect(only('weak-opener', 'Led the migration of billing')).toEqual([]);
    expect(only('weak-opener', 'Helped with the migration', 'tagline')).toEqual([]);
    expect(only('weak-opener', 'Supported the team that helped with hiring')).toEqual([]);
    // borderline: would need the gerund rewritten, or nothing follows
    expect(only('weak-opener', 'Responsible for managing vendor relationships')).toEqual([]);
    expect(only('weak-opener', 'Worked on building the dashboard')).toEqual([]);
    expect(only('weak-opener', 'Helped with')).toEqual([]);
  });

  it('filler: removable adverbs, never acronyms or hyphenated words', () => {
    const [f] = only('filler', 'Successfully launched the pricing page');
    expect(f.fix).toEqual({ kind: 'preview', replacement: 'Launched' });
    expect(only('filler', 'Built a very fast parser')[0].fix).toEqual({ kind: 'preview', replacement: 'fast' });
    expect(only('filler', 'Built a fast parser')).toEqual([]);
    expect(only('filler', 'Built the VERY telescope control software')).toEqual([]); // acronym
    expect(only('filler', 'Built a very-large index')).toEqual([]); // hyphenated
    expect(only('filler', 'It was fast, very.')).toEqual([]); // nothing to keep after it
  });

  it('buzzwords: advice only', () => {
    const f = only('buzzword', 'Results-driven engineer and team player', 'tagline');
    expect(f.map((x) => covered('Results-driven engineer and team player', x))).toEqual(['Results-driven', 'team player']);
    expect(f.every((x) => !x.fix)).toBe(true);
    expect(only('buzzword', 'Drove results for the payments team')).toEqual([]);
  });

  it('passive voice: listed participles only; honours are not flagged', () => {
    expect(only('passive', 'The API was developed in Go').map((f) => covered('The API was developed in Go', f))).toEqual(['was developed']);
    expect(only('passive', 'Reports were quickly written by hand')).toHaveLength(1);
    expect(only('passive', 'Developed the API in Go')).toEqual([]);
    expect(only('passive', 'Was awarded Engineer of the Year')).toEqual([]);
    expect(only('passive', 'Was promoted twice in two years')).toEqual([]);
    expect(only('passive', 'The team is interested in data')).toEqual([]);
    expect(only('passive', 'The pipeline was built')[0].fix).toBeUndefined(); // advice only
  });

  it('first person: "I <past verb>" can drop the pronoun; other uses are advice; I/O and product names are not flagged', () => {
    const [f] = only('first-person', 'I led the migration');
    expect(f.fix).toEqual({ kind: 'preview', replacement: 'Led' });
    expect(only('first-person', 'Built my first compiler')[0].fix).toBeUndefined();
    expect(only('first-person', 'I think the migration went well')[0].fix).toBeUndefined(); // "think" is not a known verb
    expect(only('first-person', 'Built the I/O layer')).toEqual([]);
    expect(only('first-person', 'Wrote firmware for the ME chip')).toEqual([]);
    expect(only('first-person', "I'm the owner of the payments API")).toEqual([]); // conservative
  });

  it('long bullet: more than 32 words, bullets only', () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
    expect(only('long-bullet', words(32))).toEqual([]);
    expect(only('long-bullet', words(33))[0].message).toBe('This bullet has 33 words. Aim for 32 or fewer so the result is easy to scan.');
    expect(only('long-bullet', words(40), 'tagline')).toEqual([]);
    expect(only('long-bullet', words(40), 'projectBullet')).toHaveLength(1);
  });

  it('measurable: only a question, only when an experience bullet leads with an outcome and has no quantity', () => {
    const [f] = only('measurable', 'Reduced costs for the operations team');
    expect(f.message).toBe('Can you add a measurable result here?');
    expect(f.fix).toBeUndefined();
    for (const text of [
      'Reduced costs by 20%', 'Reduced costs by a third', 'Grew revenue twofold', 'Cut spend by $40k',
      'Instituted a review that reduced churn', 'Led the migration',
    ]) {
      expect(only('measurable', text), text).toEqual([]);
    }
    expect(only('measurable', 'Reduced costs for the team', 'projectBullet')).toEqual([]);
  });

  it('spacing: double spaces and leading/trailing spaces; line breaks are kept', () => {
    expect(only('spacing', 'Built  the API').map((f) => f.fix)).toEqual([{ kind: 'auto', replacement: ' ' }]);
    expect(only('spacing', ' Built the API ').map((f) => [f.start, f.end])).toEqual([[0, 1], [14, 15]]);
    expect(only('spacing', 'Built the API')).toEqual([]);
    expect(only('spacing', 'Line one\nLine two', 'experienceSummary')).toEqual([]);
  });

  it('capitalization: only known English first words, never product names', () => {
    expect(only('capitalization', 'led the team')[0].fix).toEqual({ kind: 'auto', replacement: 'L' });
    expect(only('capitalization', 'npm package maintainer')).toEqual([]);
    expect(only('capitalization', 'iOS app for field teams')).toEqual([]);
    expect(only('capitalization', 'kubectl plugin author')).toEqual([]);
    expect(only('capitalization', 'Led the team')).toEqual([]);
  });

  it('final period: only when every other bullet agrees', () => {
    expect(only('final-period', 'Shipped the app', 'experienceBullet', ['Built the API.', 'Wrote the docs.'])[0].fix).toEqual({ kind: 'auto', replacement: '.' });
    expect(only('final-period', 'Shipped the app.', 'experienceBullet', ['Built the API', 'Wrote the docs'])[0].fix).toEqual({ kind: 'auto', replacement: '' });
    expect(only('final-period', 'Shipped the app', 'experienceBullet', ['Built the API.', 'Wrote the docs'])).toEqual([]); // mixed
    expect(only('final-period', 'Shipped the app', 'experienceBullet', ['Built the API.'])).toEqual([]); // one sibling
    expect(only('final-period', 'Shipped docs, SDKs, etc.', 'experienceBullet', ['Built the API', 'Wrote the docs'])).toEqual([]);
    expect(only('final-period', 'Shipped the app', 'tagline', ['Built the API.', 'Wrote the docs.'])).toEqual([]);
  });

  it('repeated words: removes the second; "that that" and names are fine', () => {
    const text = 'Led the the migration';
    const [f] = only('repeated-word', text);
    expect(covered(text, f)).toBe(' the');
    expect(only('repeated-word', 'Proved that that approach scales')).toEqual([]);
    expect(only('repeated-word', 'Opened an office in Walla Walla')).toEqual([]);
  });

  it('a/an: by the next word\'s sound, conservatively', () => {
    expect(only('a-an', 'Led a analysis of churn')[0].fix).toEqual({ kind: 'auto', replacement: 'an' });
    expect(only('a-an', 'Built an dashboard')[0].fix).toEqual({ kind: 'auto', replacement: 'a' });
    expect(only('a-an', 'A analysis of churn', 'experienceSummary')[0].fix).toEqual({ kind: 'auto', replacement: 'An' });
    for (const text of [
      'Launched a unique referral program', 'Ran a one-time migration', 'Led an hour-long review', 'Hired an MBA intern',
      'Ordered an x-ray machine', 'Plan A is ready for rollout', 'Built a European data center', 'Led an honest review',
    ]) {
      expect(only('a-an', text), text).toEqual([]);
    }
  });

  it('tense: only against siblings whose tense is certain and uniform', () => {
    const past = ['Led the platform team', 'Built the deploy pipeline'];
    expect(only('tense', 'Manage the release calendar', 'experienceBullet', past)).toHaveLength(1);
    expect(only('tense', 'Managed the release calendar', 'experienceBullet', ['Lead the platform team', 'Manage the budget'])).toEqual([]); // "lead" is unsure
    expect(only('tense', 'Manage the release calendar', 'experienceBullet', ['Led the platform team', 'Team offsites every quarter'])).toEqual([]); // unsure sibling
    expect(only('tense', 'Manage the release calendar', 'experienceBullet', ['Led the platform team', 'Develop the roadmap'])).toEqual([]); // mixed
    expect(only('tense', 'Lead engineer for payments', 'experienceBullet', past)).toEqual([]); // "Lead" may be a noun
    expect(only('tense', 'Manage the calendar', 'experienceBullet', ['Led the team'])).toEqual([]); // one sibling
  });

  it('repeated opener: the third bullet with the same verb', () => {
    expect(only('repeated-opener', 'Led the hiring', 'experienceBullet', ['Led the platform team', 'Led the reviews'])).toHaveLength(1);
    expect(only('repeated-opener', 'Led the hiring', 'experienceBullet', ['Led the platform team', 'Built the API'])).toEqual([]);
    expect(only('repeated-opener', 'The hiring plan', 'experienceBullet', ['The platform team', 'The reviews'])).toEqual([]); // not a verb
  });

  it('wordy phrases: previewed replacements that keep the case', () => {
    const text = 'Utilized SQL in order to build reports on a weekly basis';
    expect(only('wordy', text).map((f) => [covered(text, f), f.fix])).toEqual([
      ['Utilized', { kind: 'preview', replacement: 'Used' }],
      ['in order to', { kind: 'preview', replacement: 'to' }],
      ['on a weekly basis', { kind: 'preview', replacement: 'weekly' }],
    ]);
    expect(only('wordy', 'Sorted orders to ship faster')).toEqual([]);
  });
});

// --- 2. corpus: false positives, coverage, before/after ---

const fixable = (f: CoachFinding) => Boolean(f.fix);

/** Applies every fix (first choice for choices) until none remain; returns the final text. */
function applyAll(entry: CorpusEntry): { text: string; applied: number } {
  let text = entry.text;
  let applied = 0;
  for (let guard = 0; guard < 50; guard++) {
    const context = buildCoachContext(entry.field, entry.siblings ?? []);
    const next = analyzeText(text, context).findings.find(fixable);
    if (!next) break;
    text = applyFix(text, context, next, next.fix!.kind === 'choices' ? 0 : undefined);
    applied++;
  }
  return { text, applied };
}

const findingsIn = (entries: CorpusEntry[], texts?: string[]) =>
  entries.reduce((n, e, i) => n + analyzeText(texts ? texts[i] : e.text, buildCoachContext(e.field, e.siblings ?? [])).findings.length, 0);

describe('corpus', () => {
  it('well-written text produces no findings (no false positives)', () => {
    for (const entry of STRONG) expect(rulesOf(entry.text, entry.field, entry.siblings), entry.text).toEqual([]);
    expect(STRONG.length).toBeGreaterThanOrEqual(30);
  });

  it('weak drafts exercise every rule', () => {
    const seen = new Set(WEAK.flatMap((e) => rulesOf(e.text, e.field, e.siblings)));
    expect([...seen].sort()).toEqual([
      'a-an', 'buzzword', 'capitalization', 'filler', 'final-period', 'first-person', 'long-bullet', 'measurable',
      'passive', 'repeated-opener', 'repeated-word', 'spacing', 'tense', 'weak-opener', 'wordy',
    ]);
  });

  it('before/after: applying every safe fix leaves only advice (no fixable finding remains)', () => {
    const before = findingsIn(WEAK);
    const results = WEAK.map(applyAll);
    const after = findingsIn(WEAK, results.map((r) => r.text));
    expect(before).toBe(35);
    expect(after).toBe(11);
    for (const [i, entry] of WEAK.entries()) {
      const remaining = analyzeText(results[i].text, buildCoachContext(entry.field, entry.siblings ?? [])).findings;
      expect(remaining.filter(fixable), entry.text).toEqual([]);
    }
  });
});

// --- 3. no-fact invariant ---

const ADVERSARIAL: CorpusEntry[] = [
  { field: 'experienceBullet', text: 'helped with the  the rollout of an new system in order to cut 3 outages' },
  { field: 'experienceBullet', text: 'I led a audit very successfully, utilizing Python on a daily basis' },
  { field: 'tagline', text: ' very  experienced engineer ' },
  { field: 'projectDescription', text: 'A app that is able to utilize 2 APIs prior to launch' },
  { field: 'projectBullet', text: 'Worked on the the C++ engine in order to ship v2.1', siblings: ['Built the parser.', 'Wrote the tests.'] },
];

/** Independent re-statement of the invariant (not the production checker). */
function addsNoFact(output: string, source: string): string | null {
  const nums = (t: string) => new Set(t.match(/\d(?:[\d.,]*\d)?/g) ?? []);
  const src = nums(source);
  for (const n of nums(output)) if (!src.has(n)) return `number ${n}`;
  for (const sym of ['%', '$', '€', '£', '#', '+']) if (output.split(sym).length > source.split(sym).length) return `symbol ${sym}`;
  const words = (t: string) => t.toLowerCase().match(/[a-z][a-z0-9]*/g) ?? [];
  const srcWords = new Set(words(source));
  for (const w of words(output)) {
    if (srcWords.has(w)) continue;
    if (ELEVATED_CLAIM_WORDS.has(w)) return `stronger claim "${w}"`;
    if (!COACH_ALLOWED_WORDS.has(w)) return `new word "${w}"`;
  }
  return null;
}

describe('no-fact invariant', () => {
  const entries = [...STRONG, ...WEAK, ...ADVERSARIAL];

  it('every fix and every choice, on every corpus text: adds no fact and changes only its own span', () => {
    let checked = 0;
    for (const entry of entries) {
      const context = buildCoachContext(entry.field, entry.siblings ?? []);
      for (const finding of analyzeText(entry.text, context).findings.filter(fixable)) {
        const choices = finding.fix!.kind === 'choices' ? finding.fix!.options.map((_, i) => i) : [undefined];
        for (const choice of choices) {
          const output = applyFix(entry.text, context, finding, choice);
          expect(addsNoFact(output, entry.text), `${entry.text} → ${output}`).toBeNull();
          expect(output.startsWith(entry.text.slice(0, finding.start)), 'prefix kept').toBe(true);
          expect(output.endsWith(entry.text.slice(finding.end)), 'suffix kept').toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(40);
  });

  it('the fixed word lists cannot add facts or raise a claim', () => {
    for (const w of COACH_ALLOWED_WORDS) expect(ELEVATED_CLAIM_WORDS.has(w), w).toBe(false);
    for (const { options } of WEAK_OPENERS) {
      for (const option of options) {
        for (const w of option.toLowerCase().split(' ')) {
          expect(COACH_ALLOWED_WORDS.has(w), option).toBe(true);
          expect(ELEVATED_CLAIM_WORDS.has(w), option).toBe(false);
        }
      }
    }
    for (const { replacement } of WORDY_PHRASES) {
      for (const w of replacement.split(' ')) expect(COACH_ALLOWED_WORDS.has(w), replacement).toBe(true);
    }
    expect(WEAK_OPENERS.find((o) => o.phrase === 'helped with')!.options).toEqual(['Supported', 'Contributed to', 'Assisted with']);
  });

  it('siblings are read-only: a fix returns only the chosen text and never touches another bullet', () => {
    const siblings = Object.freeze(['Built the API.', 'Wrote the docs.']);
    const before = JSON.stringify(siblings);
    const context = buildCoachContext('experienceBullet', siblings);
    const [f] = analyzeText('Shipped the app', context).findings.filter((x) => x.rule === 'final-period');
    expect(applyFix('Shipped the app', context, f)).toBe('Shipped the app.');
    expect(JSON.stringify(siblings)).toBe(before);
    expect(Object.keys(context.siblings[0]).sort()).toEqual(['endsWithPeriod', 'opener']); // only first word + period reach the rules
  });
});

// --- 4. grounding guard: forged fixes are rejected ---

const forged = (text: string, start: number, end: number, replacement: string): CoachFinding => ({
  id: 'forged', textKey: textKey(text), rule: 'wordy', category: 'concise', message: 'x', start, end, fix: { kind: 'preview', replacement },
});

describe('grounding guard rejects any fix that adds a fact', () => {
  const text = 'Supported the migration of billing';
  const end = text.length;
  for (const [label, replacement, reason] of [
    ['a number', 'Supported the migration of billing for 40 teams', 'new_number'],
    ['a percentage', 'Supported the migration of billing, cutting costs 5%', 'new_number'],
    ['a currency amount', 'Supported the migration of billing worth $', 'new_symbol'],
    ['a date', 'Supported the migration of billing in 2019', 'new_number'],
    ['a skill or technology', 'Supported the migration of billing to Kubernetes', 'new_word'],
    ['an employer', 'Supported the migration of billing at Google', 'new_word'],
    ['an achievement', 'Supported the award-winning migration of billing', 'new_word'],
    ['a stronger claim', 'Led the migration of billing', 'elevated_claim'],
    ['a stronger claim (managed)', 'Managed the migration of billing', 'elevated_claim'],
  ] as const) {
    it(`rejects ${label}`, () => {
      expect(groundingFailure(replacement, text)).toBe(reason);
      expect(() => applyVerifiedFix(text, forged(text, 0, end, replacement))).toThrow(new CoachFixRejectedError('not_grounded'));
    });
  }

  it('allows removals, reordering of existing words and the fixed function words', () => {
    expect(groundingFailure('Supported billing', text)).toBeNull();
    expect(groundingFailure('Supported the migration of billing daily', text)).toBeNull();
    expect(applyVerifiedFix(text, forged(text, 0, 9, 'Contributed to'))).toBe('Contributed to the migration of billing');
  });

  it('a forged finding cannot even reach the guard through applyFix (it must be reproduced by analysis)', () => {
    const context = buildCoachContext('experienceBullet');
    expect(() => applyFix(text, context, forged(text, 0, end, 'Supported billing'))).toThrow(CoachStaleFindingError);
  });
});

// --- 5. apply semantics ---

describe('applying suggestions', () => {
  const context = buildCoachContext('experienceBullet');

  it('stale: the text changed, the context changed, or the finding was altered', () => {
    const text = 'Led a analysis of churn';
    const [f] = analyzeText(text, context).findings;
    expect(() => applyFix('Led a analysis of churn drivers', context, f)).toThrow(CoachStaleFindingError);
    expect(() => applyFix(text, context, { ...f, fix: { kind: 'auto', replacement: 'the' } })).toThrow(CoachStaleFindingError);
    const withSiblings = buildCoachContext('experienceBullet', ['Built the API.', 'Wrote the docs.']);
    const [period] = analyzeText('Shipped the app', withSiblings).findings;
    expect(() => applyFix('Shipped the app', buildCoachContext('experienceBullet', ['Built the API', 'Wrote the docs']), period)).toThrow(CoachStaleFindingError);
  });

  it('a stale finding is refused before any analysis runs (even on text the engine would refuse)', () => {
    const [f] = analyzeText('Led a analysis', context).findings;
    expect(() => applyFix('x'.repeat(7000), context, f)).toThrow(CoachStaleFindingError);
  });

  it('choices need an explicit, valid choice (there is no default)', () => {
    const text = 'Helped with the rollout';
    const [f] = analyzeText(text, context).findings;
    for (const choice of [undefined, -1, 3, 1.5, Number.NaN]) {
      expect(() => applyFix(text, context, f, choice), String(choice)).toThrow(new CoachFixRejectedError('invalid_choice'));
    }
    expect(applyFix(text, context, f, 1)).toBe('Contributed to the rollout');
  });

  it('advice cannot be applied', () => {
    const text = 'Reduced costs for the team';
    const [f] = analyzeText(text, context).findings;
    expect(() => applyFix(text, context, f)).toThrow(new CoachFixRejectedError('no_fix'));
  });

  it('idempotent: applying a fix removes its finding; the same finding cannot be applied twice', () => {
    const text = 'Built  the the API';
    const findings = analyzeText(text, context).findings;
    const once = applyFix(text, context, findings[0]);
    expect(analyzeText(once, context).findings.map((f) => f.id)).not.toContain(findings[0].id);
    expect(() => applyFix(once, context, findings[0])).toThrow(CoachStaleFindingError);
    const fixedPoint = applyAll({ field: 'experienceBullet', text }).text;
    expect(fixedPoint).toBe('Built the API');
    expect(applyAll({ field: 'experienceBullet', text: fixedPoint }).applied).toBe(0);
  });

  it('is deterministic', () => {
    for (const entry of [...WEAK, ...ADVERSARIAL]) {
      const context2 = buildCoachContext(entry.field, entry.siblings ?? []);
      expect(analyzeText(entry.text, context2)).toEqual(analyzeText(entry.text, context2));
    }
  });
});

// --- 6. limits ---

describe('limits', () => {
  it('text: 6,000 characters accepted, 6,001 refused', () => {
    expect(() => analyze('a'.repeat(6000))).not.toThrow();
    expect(() => analyze('a'.repeat(6001))).toThrow(new CoachInputError('text_too_long'));
  });

  it('context: 300 characters accepted, 301+ refused; malformed context refused', () => {
    const siblings = (n: number) => Array.from({ length: n }, () => 'abcdefghi x'); // 9 letters + 1 = 10 each
    expect(() => analyze('Led the team', 'experienceBullet', siblings(30))).not.toThrow(); // 300
    expect(() => analyze('Led the team', 'experienceBullet', siblings(31))).toThrow(new CoachInputError('context_too_long'));
    const long = `${'a'.repeat(41)} word`;
    expect(() => analyze('Led the team', 'experienceBullet', [long])).toThrow(new CoachInputError('invalid_context'));
    expect(() => analyzeText('x', { field: 'summaryBullets' as CoachField, siblings: [] })).toThrow(new CoachInputError('invalid_context'));
    expect(() => analyzeText(42 as unknown as string, buildCoachContext('tagline'))).toThrow(new CoachInputError('invalid_context'));
  });
});

// --- 7. entitlement (PremiumTools is the only way in) ---

const T = 1_700_000_000_000;
function world(premium: boolean) {
  const store = new FakeStoreProvider({ storeNow: () => T });
  if (premium) store.setSubscription('active', T + 86_400_000);
  const entitlements = new EntitlementService(store, new MemoryEntitlementCacheStore(), () => T);
  return { store, tools: new PremiumTools(new PremiumGate(entitlements)), paywall: new PaywallCoordinator(entitlements) };
}

describe('entitlement', () => {
  it('FREE: refused before any analysis (even for text the engine would reject)', async () => {
    const free = world(false);
    await expect(free.tools.writingCoach('Helped with the launch', 'experienceBullet')).rejects.toEqual(new PremiumRequiredError('coach'));
    await expect(free.tools.writingCoach('x'.repeat(7000), 'experienceBullet')).rejects.toEqual(new PremiumRequiredError('coach'));
  });

  it('FREE: cannot apply a finding obtained earlier', async () => {
    const paid = world(true);
    const report = await paid.tools.writingCoach('Led a analysis', 'experienceBullet');
    await expect(world(false).tools.applyCoachFix('Led a analysis', 'experienceBullet', [], report.findings[0])).rejects.toEqual(new PremiumRequiredError('coach'));
  });

  it('PREMIUM: one check to analyse, another to apply', async () => {
    const paid = world(true);
    const before = paid.store.calls.verify;
    const report = await paid.tools.writingCoach('Led a analysis', 'experienceBullet');
    expect(paid.store.calls.verify - before).toBe(1);
    expect(await paid.tools.applyCoachFix('Led a analysis', 'experienceBullet', [], report.findings[0])).toBe('Led an analysis');
    expect(paid.store.calls.verify - before).toBe(2);
  });

  it('premium lost between analysis and apply → refused, no text returned', async () => {
    const paid = world(true);
    const report = await paid.tools.writingCoach('Led a analysis', 'experienceBullet');
    paid.store.refund();
    let result: string | null = null;
    await expect(
      paid.tools.applyCoachFix('Led a analysis', 'experienceBullet', [], report.findings[0]).then((r) => (result = r)),
    ).rejects.toEqual(new PremiumRequiredError('coach'));
    expect(result).toBeNull();
  });

  it('stale through the service', async () => {
    const paid = world(true);
    const report = await paid.tools.writingCoach('Led a analysis', 'experienceBullet');
    await expect(paid.tools.applyCoachFix('Led a analysis of churn', 'experienceBullet', [], report.findings[0])).rejects.toBeInstanceOf(CoachStaleFindingError);
  });

  it('a refused Coach request resumes through the existing paywall after subscribing', async () => {
    const w = world(false);
    let report: unknown = null;
    try {
      await w.tools.writingCoach('Led a analysis', 'experienceBullet');
    } catch (error) {
      if (error instanceof PremiumRequiredError) {
        w.paywall.request({ feature: error.feature, run: async () => void (report = await w.tools.writingCoach('Led a analysis', 'experienceBullet')) });
      }
    }
    expect(w.paywall.pendingFeature()).toBe('coach');
    await (await w.paywall.subscribe()).resume!();
    expect(report).toMatchObject({ findings: [{ rule: 'a-an' }] });
  });
});

// --- 8. architecture and scope ---

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.generated.ts') ? [path] : [];
  });
}
const valueImports = (source: string) =>
  [...source.matchAll(/^import\s+(?!type\s)[^;]*?from\s+['"]([^'"]+)['"]/gms)].map((m) => m[1]);

describe('architecture: Editor → PremiumTools → domain/coach', () => {
  it('domain/coach is pure (imports only itself)', () => {
    for (const file of sourceFiles(join(SRC, 'domain', 'coach'))) {
      for (const spec of [...read(relative(SRC, file)).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])) {
        expect(spec, relative(SRC, file)).toMatch(/^\.\/[\w-]+$/);
      }
    }
  });

  it('only PremiumTools runs the Coach engine; screens import its types only', () => {
    const owners = sourceFiles(SRC)
      .filter((file) => !file.includes(join('domain', 'coach')))
      .filter((file) => valueImports(readFileSync(file, 'utf8')).some((spec) => /domain\/coach\//.test(spec)))
      .map((file) => relative(SRC, file));
    expect(owners).toEqual([join('services', 'premium', 'premium-tools.ts')]);
    const entry = read('features/coach/CoachEntry.tsx');
    expect(entry).toContain('tools.writingCoach(');
    expect(entry).toContain('tools.applyCoachFix(');
    expect(entry).not.toMatch(/analyzeText|applyFix\(|applyVerifiedFix/);
  });

  it('the Coach is on exactly the five web fields, in editor order (no summary bullets)', () => {
    const editor = read('features/editor/EditorScreen.tsx');
    expect([...editor.matchAll(/<CoachEntry[^>]*?field="(\w+)"/gs)].map((m) => m[1])).toEqual([
      'tagline', 'experienceSummary', 'experienceBullet', 'projectDescription', 'projectBullet',
    ]);
    expect([...COACH_FIELDS]).toEqual(['tagline', 'experienceSummary', 'experienceBullet', 'projectDescription', 'projectBullet']);
    expect(editor).not.toMatch(/field="summaryBullets"/);
  });

  it('FREE sees only "Coach 🔒": no teaser, and no analysis outside the gated service call', () => {
    const entry = read('features/coach/CoachEntry.tsx');
    expect(entry).toMatch(/decision\.premium \? COACH_COPY\.open : COACH_COPY\.locked/);
    expect(read('features/coach/coach-copy.ts')).toContain("locked: 'Coach 🔒'");
    expect(read('features/coach/coach-copy.ts')).not.toMatch(/\d+ suggestion|found|issues/i);
    // The panel only renders for a premium decision.
    expect(entry).toMatch(/const open = report !== null && decision\.premium;/);
  });

  it('adds no dependency', () => {
    const pkg = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')) as { dependencies: object; devDependencies: object };
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      'docx', 'expo', 'expo-clipboard', 'expo-constants', 'expo-dev-client', 'expo-file-system', 'expo-linking', 'expo-print',
      'expo-router', 'expo-sharing', 'expo-splash-screen', 'expo-sqlite', 'expo-status-bar', 'expo-system-ui', 'pdfjs-dist',
      'react', 'react-native', 'react-native-safe-area-context', 'react-native-screens', 'react-native-webview',
    ]);
    expect(Object.keys(pkg.devDependencies).sort()).toEqual(['@types/react', 'eslint', 'eslint-config-expo', 'jszip', 'playwright-core', 'typescript', 'vitest']);
  });
});

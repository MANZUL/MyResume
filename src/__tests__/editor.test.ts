import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scoreResume } from '../domain/check/resume-score';
import { EDITOR_SECTIONS, parseSectionParam, SECTION_TITLES } from '../domain/resume/sections';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import { emptyCertification, emptyEducation, emptyExperience, emptyProject, emptyResume } from '../domain/resume/types';
import { CHECK_COPY, improveHref } from '../features/check/improve-link';
import { EDITOR_COPY } from '../features/editor/editor-copy';
import { applyKeyOp, applyListOp, syncKeys, type ListOp } from '../ui/entry-keys';

const SRC = join(__dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

// --- sections and the route parameter ---

describe('editor sections and the section route parameter', () => {
  it('has the seven editor sections, in editor order, with the web titles', () => {
    expect(EDITOR_SECTIONS).toEqual(['personal', 'summary', 'experience', 'education', 'certifications', 'projects', 'awards']);
    expect(Object.values(SECTION_TITLES)).toEqual([
      'Personal Information', 'Summary & Skills', 'Experience', 'Education', 'Certifications', 'Projects', 'Awards',
    ]);
  });

  it('parseSectionParam accepts exactly the seven sections', () => {
    for (const section of EDITOR_SECTIONS) expect(parseSectionParam(section)).toBe(section);
  });

  it('parseSectionParam rejects everything else', () => {
    for (const value of [
      undefined, null, '', ' personal', 'personal ', 'Personal', 'PERSONAL', 'skills', 'contact', 'personal;drop',
      '__proto__', 'constructor', 'toString', 'hasOwnProperty', ['personal'], ['summary', 'experience'], 42, true, {}, { section: 'personal' },
    ]) {
      expect(parseSectionParam(value), JSON.stringify(value)).toBeNull();
    }
  });
});

// --- Resume Score: rules unchanged (golden) ---

describe('Resume Score rules are unchanged (golden outputs)', () => {
  const partial = {
    ...SAMPLE_RESUME,
    contact: { ...SAMPLE_RESUME.contact, phone: '', location: '' },
    summary: { tagline: '', bullets: [], skills: ['SQL'] },
    education: [],
    experience: [{ ...SAMPLE_RESUME.experience[0], bullets: ['did stuff', 'x '.repeat(80), ' '] }],
  };
  const warnings = (data: Parameters<typeof scoreResume>[0]) => scoreResume(data).warnings.map((w) => `${w.id}→${w.section}`);

  it('sample resume', () => {
    expect(scoreResume(SAMPLE_RESUME)).toEqual({
      score: 100,
      strengths: ['Clear contact information', 'Focused summary', 'Experience has useful detail', 'Education section is present', 'Skills are easy to find'],
      warnings: [],
      categories: [
        { label: 'Content', status: 'Strong' },
        { label: 'Structure', status: 'Strong' },
        { label: 'Writing', status: 'Strong' },
        { label: 'ATS readability', status: 'Strong' },
      ],
    });
  });

  it('empty resume', () => {
    const result = scoreResume(emptyResume());
    expect(result.score).toBe(15);
    expect(result.strengths).toEqual(['ATS-friendly structure']);
    expect(warnings(emptyResume())).toEqual([
      'contact→personal', 'summary→summary', 'experience→experience', 'education→education', 'skills→summary',
    ]);
    expect(result.warnings.map((w) => w.message)).toEqual([
      'Add a reliable email, phone, and location.',
      'Add a short summary that positions you for the role.',
      'Add at least one experience entry if applicable.',
      'Add education or training if relevant to this role.',
      'Add several relevant skills you genuinely have.',
    ]);
    expect(result.categories.map((c) => c.status)).toEqual(['Needs attention', 'Needs attention', 'Needs attention', 'Strong']);
  });

  it('partial resume (short, long and blank bullets; the blank one exercises the null-safety guard)', () => {
    const result = scoreResume(partial);
    expect(result.score).toBe(48);
    expect(warnings(partial)).toEqual([
      'contact→personal', 'summary→summary', 'short-bullets→experience', 'education→education', 'skills→summary', 'action-verbs→experience',
    ]);
    expect(result.warnings.find((w) => w.id === 'short-bullets')?.message).toBe('2 experience bullets could be stronger.');
  });

  it('keeps the existing null-safety guard on the first word of a bullet', () => {
    // String.split always returns at least one element, so the guard has no observable
    // effect today; it is kept as it was (owner decision) and pinned here.
    expect(read('domain/check/resume-score.ts')).toContain("(bullet.trim().split(/\\s+/)[0] ?? '')");
  });

  it('every warning points at a real editor section', () => {
    for (const data of [SAMPLE_RESUME, emptyResume(), partial]) {
      for (const w of scoreResume(data).warnings) expect(EDITOR_SECTIONS).toContain(w.section);
    }
  });
});

// --- Improve navigation ---

describe('"Improve" goes back to the editor on the warning\'s section', () => {
  it('builds an editor href whose section parses back to the same section, with a fresh jump token', () => {
    for (const w of scoreResume(emptyResume()).warnings) {
      const href = improveHref('r1', w.section, 1000);
      expect(href).toEqual({ pathname: '/resume/[id]', params: { id: 'r1', section: w.section, jump: '1000' } });
      expect(parseSectionParam(href.params.section)).toBe(w.section);
    }
    expect(improveHref('r1', 'summary', 1).params.jump).not.toBe(improveHref('r1', 'summary', 2).params.jump);
  });

  it('the Tools screen returns to the editor (no new screen) and the editor reads only a parsed section', () => {
    const tools = read('features/tools/ToolsScreen.tsx');
    expect(tools).toMatch(/router\.dismissTo\(improveHref\(resume\.id, section, Date\.now\(\)\)\)/);
    const editor = read('features/editor/EditorScreen.tsx');
    expect(editor).toMatch(/const target = parseSectionParam\(section\);/);
  });
});

// --- stable keys ---

type Entry = { name: string };

interface KeyStrategy {
  init(items: Entry[], make: () => string): string[];
  apply(keys: string[], op: ListOp, items: Entry[], make: () => string): string[];
}

/** Applies ops to a list and its keys, and records (key → entry) after each step. */
function run(ops: ListOp[], strategy: KeyStrategy) {
  let counter = 0;
  const make = () => `k${++counter}`;
  let items: Entry[] = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
  let keys = strategy.init(items, make);
  const history: Map<string, Entry>[] = [new Map(keys.map((k, i) => [k, items[i]]))];
  for (const op of ops) {
    items = applyListOp(items, op, () => ({ name: `new${counter}` }));
    keys = strategy.apply(keys, op, items, make);
    history.push(new Map(keys.map((k, i) => [k, items[i]])));
  }
  return { items, keys, history };
}

const realKeys: KeyStrategy = {
  init: (items, make) => items.map(() => make()),
  apply: (keys, op, _items, make) => applyKeyOp(keys, op, make),
};
/** What `key={index}` amounts to. */
const indexKeys: KeyStrategy = {
  init: (items) => items.map((_, i) => `i${i}`),
  apply: (_keys, _op, items) => items.map((_, i) => `i${i}`),
};

/**
 * Keys are stable when (1) a key never points at a different entry than before, and
 * (2) an entry that is still in the list keeps the key it had (no remounting).
 */
function keysFollowItems(history: Map<string, Entry>[]): boolean {
  for (let step = 1; step < history.length; step++) {
    const before = history[step - 1];
    const after = history[step];
    for (const [key, item] of after) {
      for (let earlier = 0; earlier < step; earlier++) {
        const seen = history[earlier].get(key);
        if (seen && seen !== item) return false;
      }
    }
    const keyAfter = new Map([...after].map(([key, item]) => [item, key]));
    for (const [key, item] of before) {
      if (keyAfter.has(item) && keyAfter.get(item) !== key) return false;
    }
  }
  return true;
}

describe('stable keys stay with their entry (UI only)', () => {
  const scenarios: [string, ListOp[]][] = [
    ['add', [{ type: 'add' }, { type: 'add' }]],
    ['delete first', [{ type: 'remove', index: 0 }]],
    ['delete middle', [{ type: 'remove', index: 1 }]],
    ['reorder down', [{ type: 'move', from: 0, to: 1 }]],
    ['reorder up', [{ type: 'move', from: 2, to: 1 }]],
    ['mixed', [{ type: 'add' }, { type: 'move', from: 3, to: 2 }, { type: 'remove', index: 0 }, { type: 'move', from: 0, to: 1 }, { type: 'add' }]],
  ];

  for (const [label, ops] of scenarios) {
    it(`${label}: every key keeps pointing at the same entry; keys unique; one per entry`, () => {
      const { items, keys, history } = run(ops, realKeys);
      expect(keysFollowItems(history)).toBe(true);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).toHaveLength(items.length);
    });
  }

  it('after delete, the remaining entries keep their original keys', () => {
    expect(applyKeyOp(['k1', 'k2', 'k3'], { type: 'remove', index: 0 })).toEqual(['k2', 'k3']);
    expect(applyKeyOp(['k1', 'k2', 'k3'], { type: 'move', from: 0, to: 1 })).toEqual(['k2', 'k1', 'k3']);
    expect(applyKeyOp(['k1'], { type: 'add' }, () => 'k9')).toEqual(['k1', 'k9']);
  });

  it('negative control: index keys fail the same check (deleting or reordering re-points a key)', () => {
    expect(keysFollowItems(run([{ type: 'remove', index: 0 }], indexKeys).history)).toBe(false);
    expect(keysFollowItems(run([{ type: 'move', from: 0, to: 1 }], indexKeys).history)).toBe(false);
  });

  it('list and key operations are the same operation (moving out of range changes nothing)', () => {
    expect(applyListOp(['a', 'b'], { type: 'move', from: 1, to: 2 }, () => 'x')).toEqual(['a', 'b']);
    expect(applyListOp(['a', 'b'], { type: 'move', from: -1, to: 0 }, () => 'x')).toEqual(['a', 'b']);
    expect(applyListOp(['a', 'b', 'c'], { type: 'move', from: 2, to: 1 }, () => 'x')).toEqual(['a', 'c', 'b']);
  });

  it('syncKeys handles a list replaced from outside, deterministically (no new keys during render)', () => {
    expect(syncKeys(['k1', 'k2'], 2)).toEqual(['k1', 'k2']);
    expect(syncKeys(['k1', 'k2', 'k3'], 1)).toEqual(['k1']);
    expect(syncKeys(['k1'], 3)).toEqual(['k1', 'p1', 'p2']);
    expect(syncKeys(['k1'], 3)).toEqual(syncKeys(['k1'], 3));
  });

  it('the UI applies each list operation to the keys and the data together', () => {
    const editor = read('features/editor/EditorScreen.tsx');
    expect(editor).toMatch(/applyKeys\[key\]\(op\);\s*setData\(\(d\) => \(\{ \.\.\.d, \[key\]: applyListOp\(d\[key\] as unknown\[\], op, EMPTY_ITEM\[key\]\) \}\)\);/);
    for (const list of ['experience', 'education', 'certifications', 'projects']) {
      expect(editor).toContain(`key={${list === 'certifications' ? 'certification' : list === 'projects' ? 'project' : list}Keys[index]}`);
    }
    const components = read('ui/components.tsx');
    expect(components).toMatch(/applyKeys\(\{ type: 'remove', index \}\);\s*onChange\(items\.filter/);
    expect(components).toMatch(/applyKeys\(\{ type: 'add' \}\);\s*onChange\(\[\.\.\.items, ''\]\)/);
    expect(components).toContain('<View key={keys[index]}>');
  });

  it('keys are UI-only: resume data has no ids, and nothing indexes lists by position', () => {
    expect(Object.keys(emptyExperience()).sort()).toEqual(['bullets', 'company', 'end', 'location', 'start', 'summary', 'title']);
    expect(Object.keys(emptyEducation()).sort()).toEqual(['date', 'degree', 'honors', 'location', 'school']);
    expect(Object.keys(emptyCertification()).sort()).toEqual(['date', 'name', 'org']);
    expect(Object.keys(emptyProject()).sort()).toEqual(['bullets', 'description', 'name']);
    for (const file of ['features/editor/EditorScreen.tsx', 'ui/components.tsx']) {
      expect(read(file), file).not.toMatch(/key=\{(index|i)\}/);
    }
  });
});

// --- copy parity with the web editor ---

describe('web copy parity', () => {
  it('editor labels, placeholders and add labels match the web editor', () => {
    expect(EDITOR_COPY).toEqual({
      personal: { name: 'Full Name', email: 'Email', phone: 'Phone', location: 'Location', linkedin: 'LinkedIn', website: 'Website' },
      summary: {
        tagline: 'Tagline (One short line)', bullets: 'Summary Bullets', bulletsPlaceholder: 'Add a concise summary point',
        bulletsAdd: 'Add summary bullet', skills: 'Skills', skillsPlaceholder: 'Add a skill', skillsAdd: 'Add skill',
      },
      experience: {
        title: 'Job Title', company: 'Company', start: 'Start Date', end: 'End Date', location: 'Location',
        summary: 'Short Summary (Optional paragraph)', bullets: 'Accomplishments', bulletsAdd: 'Add accomplishment',
      },
      education: { degree: 'Degree', school: 'School', date: 'Date (Year)', location: 'Location', honors: 'Honors (Optional)' },
      certifications: { name: 'Certification Name', org: 'Organization', date: 'Date' },
      projects: {
        name: 'Project Name', description: 'Short Description', bullets: 'Accomplishments',
        bulletsPlaceholder: 'Add a project accomplishment', bulletsAdd: 'Add accomplishment',
      },
      awards: { list: 'Awards & Honors', placeholder: 'Add an award or honor', add: 'Add award' },
    });
  });

  it('the editor takes its labels from that copy (the resume title field is the only mobile-only label)', () => {
    const editor = read('features/editor/EditorScreen.tsx');
    expect(editor.match(/<(Field|StringListEditor)\s+label="[^"]*"/g)).toEqual(['<Field label="Resume title (only you see this)"']);
    // Mobile additions are kept.
    for (const kept of ['Move up', 'Move down', 'placeholder="Mar 2020"', 'placeholder="Present"', 'placeholder="City, State"']) {
      expect(editor).toContain(kept);
    }
  });

  it('empty string lists show the web hint', () => {
    const source = read('ui/components.tsx');
    expect(source).toContain("export const EMPTY_LIST_HINT = 'Nothing added. Leave this empty if you do not need it.';");
    expect(source).toMatch(/items\.length === 0 \? <Text style=\{styles\.emptyHint\}>\{EMPTY_LIST_HINT\}<\/Text> : null/);
  });

  it('Resume Check uses the web headings, "Improve" and the disclaimer', () => {
    expect(CHECK_COPY).toEqual({
      title: 'Resume Score',
      working: 'What is working',
      attention: 'Needs attention',
      improve: 'Improve',
      disclaimer: 'Designed for reliable parsing with standard headings and readable text. No ATS guarantee is implied.',
    });
    const check = read('features/check/CheckTool.tsx');
    expect(check).toMatch(/onPress=\{\(\) => onImprove\(w\.section\)\}/);
    // Web order: score, categories, what is working, needs attention, disclaimer.
    const order = ['CHECK_COPY.title', 'score.categories', 'CHECK_COPY.working', 'CHECK_COPY.attention', 'CHECK_COPY.disclaimer'].map((s) => check.indexOf(s));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

// --- Collapsible ---

describe('Collapsible supports optional control without changing default behaviour', () => {
  it('uses its own state unless `open` is passed, and keeps that state in step with every toggle', () => {
    const source = read('ui/components.tsx');
    expect(source).toMatch(/const \[internalOpen, setInternalOpen\] = useState\(initiallyOpen\);/);
    expect(source).toMatch(/const open = controlledOpen \?\? internalOpen;/);
    expect(source).toMatch(/setInternalOpen\(!open\);\s*onOpenChange\?\.\(!open\);/);
  });
});

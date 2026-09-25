import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyLocalProfile } from '../domain/profile/local-profile';
import type { StorageIssue } from '../domain/ports/repositories';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import { emptyResume, type StoredResume } from '../domain/resume/types';
import { initializeDatabase, type AppDatabase } from '../services/storage/sqlite/database';
import { openTestDatabase, tempDir, testId, type TestDatabase } from './helpers/node-sqlite';

let dir: ReturnType<typeof tempDir>;
let db: TestDatabase;
let app: AppDatabase;
let issues: StorageIssue[];
let clock: number;

async function start() {
  db = openTestDatabase(dir.file('app.db'));
  app = await initializeDatabase(db, { newId: testId, now: () => clock, onIssue: (issue) => issues.push(issue) });
}
async function restart() {
  await db.close();
  await start();
}

beforeEach(async () => {
  dir = tempDir();
  issues = [];
  clock = 10_000;
  await start();
});
afterEach(async () => {
  await db.close();
  dir.cleanup();
});

const resume = (id: string, createdAt: number, overrides: Partial<StoredResume> = {}): StoredResume => ({
  id,
  title: `Resume ${id}`,
  templateId: 'tech-builder',
  accent: '#3B5168',
  data: emptyResume(),
  createdAt,
  updatedAt: createdAt,
  ...overrides,
});

describe('resumes: CRUD and multiple resumes', () => {
  it('creates, reads, updates and deletes', async () => {
    await app.resumes.create(resume('r1', 1, { data: SAMPLE_RESUME }));
    expect(await app.resumes.get('r1')).toEqual(resume('r1', 1, { data: SAMPLE_RESUME }));

    const edited = { ...resume('r1', 1), title: 'Edited', templateId: 'creative-editorial', accent: '#A85432', updatedAt: 5 };
    edited.data = { ...SAMPLE_RESUME, name: 'New Name' };
    expect(await app.resumes.save(edited)).toBe(true);
    expect(await app.resumes.get('r1')).toEqual(edited);

    expect(await app.resumes.delete('r1')).toBe(true);
    expect(await app.resumes.get('r1')).toBeNull();
    expect(await app.resumes.delete('r1')).toBe(false);
  });

  it('keeps many resumes, listed newest first, independent of each other', async () => {
    for (let i = 1; i <= 5; i += 1) await app.resumes.create(resume(`r${i}`, i * 10));
    expect((await app.resumes.list()).map((r) => r.id)).toEqual(['r5', 'r4', 'r3', 'r2', 'r1']);
    await app.resumes.save({ ...resume('r3', 30), title: 'Only r3 changed', updatedAt: 99 });
    const list = await app.resumes.list();
    expect(list.find((r) => r.id === 'r3')?.title).toBe('Only r3 changed');
    expect(list.filter((r) => r.title.startsWith('Resume')).length).toBe(4);
  });

  it('stores template selection and allowed customization', async () => {
    await app.resumes.create(resume('r1', 1, { templateId: 'academic-scholar', accent: '#9F1239' }));
    await restart();
    expect(await app.resumes.get('r1')).toMatchObject({ templateId: 'academic-scholar', accent: '#9F1239' });
  });

  it('rejects duplicate ids and reports saves to a missing resume', async () => {
    await app.resumes.create(resume('r1', 1));
    await expect(app.resumes.create(resume('r1', 2))).rejects.toThrow();
    expect(await app.resumes.save(resume('ghost', 1))).toBe(false);
    expect(await app.resumes.get('ghost')).toBeNull();
  });

  it('persists across an app restart', async () => {
    await app.resumes.create(resume('r1', 1, { data: SAMPLE_RESUME }));
    await app.resumes.create(resume('r2', 2));
    await restart();
    expect((await app.resumes.list()).map((r) => r.id)).toEqual(['r2', 'r1']);
    expect((await app.resumes.get('r1'))?.data).toEqual(SAMPLE_RESUME);
  });
});

describe('resumes: active/current selection', () => {
  it('has no active resume by default and allows exactly one', async () => {
    await app.resumes.create(resume('r1', 1));
    await app.resumes.create(resume('r2', 2));
    expect(await app.resumes.getActiveId()).toBeNull();
    await app.resumes.setActive('r1');
    await app.resumes.setActive('r2');
    expect(await app.resumes.getActiveId()).toBe('r2');
    const activeCount = db.raw.prepare('SELECT COUNT(*) AS n FROM resumes WHERE is_active = 1').get() as { n: number };
    expect(activeCount.n).toBe(1);
  });

  it('is enforced by the database, not only by the repository', async () => {
    await app.resumes.create(resume('r1', 1));
    await app.resumes.create(resume('r2', 2));
    db.raw.exec("UPDATE resumes SET is_active = 1 WHERE id = 'r1'");
    expect(() => db.raw.exec("UPDATE resumes SET is_active = 1 WHERE id = 'r2'")).toThrow(/UNIQUE/);
  });

  it('survives restart, can be cleared, and is cleared when that resume is deleted', async () => {
    await app.resumes.create(resume('r1', 1));
    await app.resumes.setActive('r1');
    await restart();
    expect(await app.resumes.getActiveId()).toBe('r1');
    await app.resumes.setActive(null);
    expect(await app.resumes.getActiveId()).toBeNull();
    await app.resumes.setActive('r1');
    await app.resumes.delete('r1');
    expect(await app.resumes.getActiveId()).toBeNull();
  });

  it('selecting a missing id leaves no active resume', async () => {
    await app.resumes.create(resume('r1', 1));
    await app.resumes.setActive('r1');
    await app.resumes.setActive('missing');
    expect(await app.resumes.getActiveId()).toBeNull();
  });
});

describe('resumes: invalid or missing data', () => {
  const insertRaw = (id: string, dataJson: string, extra: { template?: string; accent?: string } = {}) =>
    db.raw
      .prepare('INSERT INTO resumes (id, title, template_id, accent, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, 't', extra.template ?? 'tech-builder', extra.accent ?? '#000000', dataJson, 1, 1);

  it('skips a row with unreadable JSON, reports it, and does not delete it', async () => {
    await app.resumes.create(resume('good', 2));
    insertRaw('broken', '{not json');
    expect((await app.resumes.list()).map((r) => r.id)).toEqual(['good']);
    expect(await app.resumes.get('broken')).toBeNull();
    expect(issues).toContainEqual({ table: 'resumes', id: 'broken', problem: 'data_json is not valid JSON' });
    const still = db.raw.prepare("SELECT COUNT(*) AS n FROM resumes WHERE id = 'broken'").get() as { n: number };
    expect(still.n).toBe(1);
  });

  it('repairs wrong-shaped content, unknown templates and invalid colors instead of crashing', async () => {
    insertRaw('odd', JSON.stringify({ name: 7, contact: null, summary: { bullets: ['ok', 3] }, experience: [{ title: 'Dev' }, 'x'] }), {
      template: 'no-such-template',
      accent: 'red; }',
    });
    const repaired = await app.resumes.get('odd');
    expect(repaired).not.toBeNull();
    expect(repaired?.templateId).toBe('corporate-boardroom');
    expect(repaired?.accent).toBe('#1B2B47');
    expect(repaired?.data.name).toBe('');
    expect(repaired?.data.contact.email).toBe('');
    expect(repaired?.data.summary.bullets).toEqual(['ok']);
    expect(repaired?.data.experience).toEqual([
      { title: 'Dev', company: '', location: '', start: '', end: '', summary: '', bullets: [] },
    ]);
  });

  it('returns null for missing records rather than throwing', async () => {
    expect(await app.resumes.get('nope')).toBeNull();
    expect(await app.resumes.list()).toEqual([]);
  });
});

describe('local profile', () => {
  it('starts empty, saves, updates the single row, and survives restart', async () => {
    expect(await app.profile.get()).toEqual(emptyLocalProfile());
    const profile = {
      name: 'Jane Doe', email: 'jane@example.com', phone: '555', location: 'Austin, TX',
      headline: 'Product Manager', linkedin: 'linkedin.com/in/jane', website: 'jane.dev', updatedAt: 42,
    };
    await app.profile.save(profile);
    await app.profile.save({ ...profile, headline: 'Director', updatedAt: 43 });
    await restart();
    expect(await app.profile.get()).toEqual({ ...profile, headline: 'Director', updatedAt: 43 });
    const rows = db.raw.prepare('SELECT COUNT(*) AS n FROM local_profile').get() as { n: number };
    expect(rows.n).toBe(1);
  });

  it('cannot hold a second profile row', async () => {
    await app.profile.save({ ...emptyLocalProfile(), name: 'A', updatedAt: 1 });
    expect(() =>
      db.raw.prepare("INSERT INTO local_profile (id, updated_at) VALUES (2, 1)").run(),
    ).toThrow(/CHECK/);
  });

  it('repairs invalid values instead of failing', async () => {
    await app.profile.save({ ...emptyLocalProfile(), name: 5 as unknown as string, email: 'a@b.c', updatedAt: Number.NaN });
    expect(await app.profile.get()).toMatchObject({ name: '', email: 'a@b.c', updatedAt: 0 });
  });
});

describe('export records', () => {
  beforeEach(async () => {
    await app.resumes.create(resume('r1', 1));
    await app.resumes.create(resume('r2', 2));
  });

  it('appends metadata and lists it newest first, per resume and overall', async () => {
    clock = 100;
    await app.exportRecords.add({ resumeId: 'r1', templateId: 'tech-builder', exportType: 'pdf', outcome: 'succeeded', accessReason: 'entitled', errorMessage: null });
    clock = 200;
    await app.exportRecords.add({ resumeId: 'r2', templateId: 'tech-builder', exportType: 'docx', outcome: 'denied', accessReason: 'not-configured', errorMessage: null });
    clock = 300;
    await app.exportRecords.add({ resumeId: 'r1', templateId: 'creative-studio', exportType: 'docx', outcome: 'failed', accessReason: 'entitled', errorMessage: 'Error: disk full' });

    expect((await app.exportRecords.listRecent(10)).map((r) => r.createdAt)).toEqual([300, 200, 100]);
    expect((await app.exportRecords.listRecent(1))[0]).toMatchObject({ outcome: 'failed', errorMessage: 'Error: disk full' });
    expect((await app.exportRecords.listForResume('r1')).map((r) => r.exportType)).toEqual(['docx', 'pdf']);
    await restart();
    expect(await app.exportRecords.listRecent(10)).toHaveLength(3);
  });

  it('keeps history when the resume is deleted (resume id becomes null)', async () => {
    await app.exportRecords.add({ resumeId: 'r1', templateId: 'tech-builder', exportType: 'pdf', outcome: 'succeeded', accessReason: 'entitled', errorMessage: null });
    await app.resumes.delete('r1');
    const [record] = await app.exportRecords.listRecent(5);
    expect(record.resumeId).toBeNull();
    expect(record.templateId).toBe('tech-builder');
  });

  it('rejects unknown export types and outcomes at the database level', async () => {
    const insert = (type: string, outcome: string) =>
      db.raw
        .prepare('INSERT INTO export_records (id, resume_id, template_id, export_type, outcome, access_reason, created_at) VALUES (?, NULL, ?, ?, ?, ?, 1)')
        .run(testId(), 'tech-builder', type, outcome, 'entitled');
    expect(() => insert('exe', 'succeeded')).toThrow(/CHECK/);
    expect(() => insert('pdf', 'stolen')).toThrow(/CHECK/);
  });
});

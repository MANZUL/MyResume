import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import { initializeDatabase } from '../services/storage/sqlite/database';
import { getSchemaVersion, migrate, MigrationError, SchemaTooNewError } from '../services/storage/sqlite/migrate';
import { MIGRATIONS, SCHEMA_VERSION, type Migration } from '../services/storage/sqlite/schema';
import { openTestDatabase, tempDir, testId, type TestDatabase } from './helpers/node-sqlite';

let dir: ReturnType<typeof tempDir>;
let open: TestDatabase[] = [];
const openDb = (name = 'app.db') => {
  const db = openTestDatabase(dir.file(name));
  open.push(db);
  return db;
};

beforeEach(() => {
  dir = tempDir();
  open = [];
});
afterEach(async () => {
  for (const db of open) await db.close();
  dir.cleanup();
});

const tables = (db: TestDatabase) =>
  (db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map(
    (row) => row.name,
  );
const columns = (db: TestDatabase, table: string) =>
  (db.raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name);

describe('schema version', () => {
  it('is explicit, starts at 1, and matches the last migration', () => {
    expect(SCHEMA_VERSION).toBe(2);
    expect(MIGRATIONS.map((m) => m.version)).toEqual([1, 2]);
  });
});

describe('fresh install', () => {
  it('creates exactly the three MVP tables and records the schema version', async () => {
    const db = openDb();
    expect(await getSchemaVersion(db)).toBe(0);
    const app = await initializeDatabase(db, { newId: testId });
    expect(app.migration).toEqual({ from: 0, to: SCHEMA_VERSION, applied: [1, 2] });
    expect(await getSchemaVersion(db)).toBe(SCHEMA_VERSION);
    expect(tables(db)).toEqual(['export_records', 'local_profile', 'resumes']);
    expect(await app.resumes.list()).toEqual([]);
  });

  it('enables WAL journaling and foreign keys on the connection', async () => {
    const db = openDb();
    await initializeDatabase(db, { newId: testId });
    expect((db.raw.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode).toBe('wal');
    expect((db.raw.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys).toBe(1);
  });

  it('export_records stores metadata only: no file path, uri or content column', async () => {
    const db = openDb();
    await initializeDatabase(db, { newId: testId });
    const exportColumns = columns(db, 'export_records');
    expect(exportColumns).toEqual([
      'id', 'resume_id', 'template_id', 'export_type', 'outcome', 'access_reason', 'error_message', 'created_at',
    ]);
    for (const table of ['resumes', 'local_profile', 'export_records']) {
      expect(columns(db, table).join(' ')).not.toMatch(/path|uri|file|blob|content/i);
    }
  });
});

describe('repeated migration and restart', () => {
  it('is idempotent: running again applies nothing and keeps data', async () => {
    const db = openDb();
    const first = await initializeDatabase(db, { newId: testId });
    await first.resumes.create({ id: 'r1', title: 'A', templateId: 'tech-builder', accent: '#000000', data: SAMPLE_RESUME, createdAt: 1, updatedAt: 1 });
    const again = await migrate(db, MIGRATIONS, { now: 1, legacyResumesJson: null });
    expect(again).toEqual({ from: SCHEMA_VERSION, to: SCHEMA_VERSION, applied: [] });
    expect((await first.resumes.list()).map((r) => r.id)).toEqual(['r1']);
  });

  it('survives an app restart (close + reopen) without re-running migrations', async () => {
    const db = openDb();
    const app = await initializeDatabase(db, { newId: testId });
    await app.resumes.create({ id: 'r1', title: 'Kept', templateId: 'tech-builder', accent: '#000000', data: SAMPLE_RESUME, createdAt: 1, updatedAt: 1 });
    await db.close();

    const reopened = openDb();
    const restarted = await initializeDatabase(reopened, { newId: testId });
    expect(restarted.migration).toEqual({ from: SCHEMA_VERSION, to: SCHEMA_VERSION, applied: [] });
    expect((await restarted.resumes.get('r1'))?.title).toBe('Kept');
  });
});

describe('importing the Step 1 key-value data (existing install)', () => {
  const legacy = JSON.stringify([
    { id: 'a', title: 'Valid', templateId: 'tech-builder', accent: '#123456', data: SAMPLE_RESUME, updatedAt: 500 },
    { id: 'b', title: 'Bad shape', templateId: 'nope', accent: 'red', data: { name: 42, experience: 'x' } },
    { title: 'No id — skipped' },
    'not an object',
    null,
  ]);

  it('imports valid records, repairs malformed ones, skips unusable ones', async () => {
    const db = openDb();
    const app = await initializeDatabase(db, { newId: testId, now: () => 999, readLegacyResumes: async () => legacy });
    const list = await app.resumes.list();
    expect(list.map((r) => r.id).sort()).toEqual(['a', 'b']);
    const a = await app.resumes.get('a');
    expect(a).toMatchObject({ title: 'Valid', accent: '#123456', createdAt: 500, updatedAt: 500 });
    expect(a?.data).toEqual(SAMPLE_RESUME);
    const b = await app.resumes.get('b');
    expect(b).toMatchObject({ templateId: 'corporate-boardroom', accent: '#1B2B47', createdAt: 999 });
    expect(b?.data.name).toBe('');
    expect(b?.data.experience).toEqual([]);
  });

  it('tolerates a missing, empty, non-JSON or unreadable legacy store', async () => {
    for (const reader of [async () => null, async () => '', async () => '{oops', async () => '{"not":"array"}']) {
      const db = openDb(`db-${Math.random()}.db`);
      const app = await initializeDatabase(db, { newId: testId, readLegacyResumes: reader });
      expect(await app.resumes.list()).toEqual([]);
      expect(await getSchemaVersion(db)).toBe(SCHEMA_VERSION);
    }
    const issues: string[] = [];
    const db = openDb('throws.db');
    const app = await initializeDatabase(db, {
      newId: testId,
      readLegacyResumes: async () => {
        throw new Error('disk error');
      },
      onIssue: (issue) => issues.push(issue.table),
    });
    expect(await app.resumes.list()).toEqual([]);
    expect(issues).toEqual(['legacy']);
  });

  it('imports only once: the legacy store is not read again after migration 1', async () => {
    const db = openDb();
    await initializeDatabase(db, { newId: testId, readLegacyResumes: async () => legacy });
    await db.close();
    let reads = 0;
    const reopened = openDb();
    const app = await initializeDatabase(reopened, {
      newId: testId,
      readLegacyResumes: async () => {
        reads += 1;
        return JSON.stringify([{ id: 'late', templateId: 'tech-builder', accent: '#000000', data: {} }]);
      },
    });
    expect(reads).toBe(0);
    expect(await app.resumes.get('late')).toBeNull();
  });
});

describe('upgrading an existing database and failure safety', () => {
  const NEXT = SCHEMA_VERSION + 1;
  const v2: Migration = {
    version: NEXT,
    name: 'test-only: add a column',
    async up(tx) {
      await tx.exec("ALTER TABLE resumes ADD COLUMN note TEXT NOT NULL DEFAULT ''");
    },
  };

  it('applies only the pending migrations to a database at an older version, keeping data', async () => {
    const db = openDb();
    const app = await initializeDatabase(db, { newId: testId });
    await app.resumes.create({ id: 'r1', title: 'Old', templateId: 'tech-builder', accent: '#000000', data: SAMPLE_RESUME, createdAt: 1, updatedAt: 1 });
    const result = await migrate(db, [...MIGRATIONS, v2], { now: 1, legacyResumesJson: null });
    expect(result).toEqual({ from: SCHEMA_VERSION, to: NEXT, applied: [NEXT] });
    expect(columns(db, 'resumes')).toContain('note');
    expect((await app.resumes.get('r1'))?.title).toBe('Old');
    expect(await migrate(db, [...MIGRATIONS, v2], { now: 1, legacyResumesJson: null })).toEqual({ from: NEXT, to: NEXT, applied: [] });
  });

  it('rolls a failed migration back completely and leaves the version unchanged', async () => {
    const db = openDb();
    const app = await initializeDatabase(db, { newId: testId });
    await app.resumes.create({ id: 'r1', title: 'Safe', templateId: 'tech-builder', accent: '#000000', data: SAMPLE_RESUME, createdAt: 1, updatedAt: 1 });
    const broken: Migration = {
      version: NEXT,
      name: 'test-only: fails halfway',
      async up(tx) {
        await tx.exec('CREATE TABLE half_done (x INTEGER)');
        await tx.exec('UPDATE resumes SET title = "changed"');
        throw new Error('boom');
      },
    };
    await expect(migrate(db, [...MIGRATIONS, broken], { now: 1, legacyResumesJson: null })).rejects.toBeInstanceOf(MigrationError);
    expect(await getSchemaVersion(db)).toBe(SCHEMA_VERSION);
    expect(tables(db)).not.toContain('half_done');
    expect((await app.resumes.get('r1'))?.title).toBe('Safe');
  });

  it('refuses a database written by a newer app version and does not touch it', async () => {
    const db = openDb();
    await initializeDatabase(db, { newId: testId });
    db.raw.exec('PRAGMA user_version = 7');
    await expect(initializeDatabase(db, { newId: testId })).rejects.toBeInstanceOf(SchemaTooNewError);
    expect(await getSchemaVersion(db)).toBe(7);
    expect(tables(db)).toEqual(['export_records', 'local_profile', 'resumes']);
  });

  it('v1 → v2 keeps every export record and its indexes, and then accepts image (png) records', async () => {
    const db = openDb();
    await migrate(db, MIGRATIONS.slice(0, 1), { now: 1, legacyResumesJson: null });
    expect(await getSchemaVersion(db)).toBe(1);
    const insert = db.raw.prepare(
      'INSERT INTO export_records (id, resume_id, template_id, export_type, outcome, access_reason, error_message, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)',
    );
    insert.run('e1', 'tech-builder', 'pdf', 'succeeded', 'verified', null, 10);
    insert.run('e2', 'corporate-boardroom', 'docx', 'failed', 'cached', 'Error: disk', 20);
    expect(() => insert.run('e3', 'tech-builder', 'png', 'succeeded', 'verified', null, 30)).toThrow(/CHECK/); // v1 refuses png
    expect(await migrate(db, MIGRATIONS, { now: 1, legacyResumesJson: null })).toEqual({ from: 1, to: 2, applied: [2] });
    expect(db.raw.prepare('SELECT id, template_id, export_type, outcome, access_reason, error_message, created_at FROM export_records ORDER BY id').all()).toEqual([
      { id: 'e1', template_id: 'tech-builder', export_type: 'pdf', outcome: 'succeeded', access_reason: 'verified', error_message: null, created_at: 10 },
      { id: 'e2', template_id: 'corporate-boardroom', export_type: 'docx', outcome: 'failed', access_reason: 'cached', error_message: 'Error: disk', created_at: 20 },
    ]);
    insert.run('e3', 'tech-builder', 'png', 'succeeded', 'verified', null, 30);
    expect(() => insert.run('e4', 'tech-builder', 'jpeg', 'succeeded', 'verified', null, 40)).toThrow(/CHECK/);
    const indexes = (db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'export_records' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
    expect(indexes).toEqual(['export_records_created_at', 'export_records_resume']);
    expect(tables(db)).toEqual(['export_records', 'local_profile', 'resumes']);
  });

  it('rejects a migration list with gaps', async () => {
    const db = openDb();
    const gap: Migration = { version: NEXT + 1, name: 'gap', up: async () => undefined };
    await expect(migrate(db, [...MIGRATIONS, gap], { now: 1, legacyResumesJson: null })).rejects.toThrow(/without gaps/);
  });
});

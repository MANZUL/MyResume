import { normalizeStoredResume } from '../../../domain/resume/normalize';
import type { SqlExecutor } from './sql';

// Versioned schema. The version lives in SQLite's PRAGMA user_version.
// Rules: never edit a released migration; add a new one with the next version.

export interface MigrationContext {
  now: number;
  /** JSON array of resumes saved by the Step 1 prototype key-value store, if any. */
  legacyResumesJson: string | null;
}

export interface Migration {
  version: number;
  name: string;
  up(tx: SqlExecutor, context: MigrationContext): Promise<void>;
}

const V1_TABLES = [
  `CREATE TABLE IF NOT EXISTS resumes (
     id           TEXT    PRIMARY KEY NOT NULL,
     title        TEXT    NOT NULL DEFAULT '',
     template_id  TEXT    NOT NULL,
     accent       TEXT    NOT NULL,
     data_json    TEXT    NOT NULL,
     is_active    INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
     created_at   INTEGER NOT NULL,
     updated_at   INTEGER NOT NULL
   )`,
  // At most one resume can be the current one.
  `CREATE UNIQUE INDEX IF NOT EXISTS resumes_single_active ON resumes (is_active) WHERE is_active = 1`,
  `CREATE INDEX IF NOT EXISTS resumes_created_at ON resumes (created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS local_profile (
     id          INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
     name        TEXT    NOT NULL DEFAULT '',
     email       TEXT    NOT NULL DEFAULT '',
     phone       TEXT    NOT NULL DEFAULT '',
     location    TEXT    NOT NULL DEFAULT '',
     headline    TEXT    NOT NULL DEFAULT '',
     linkedin    TEXT    NOT NULL DEFAULT '',
     website     TEXT    NOT NULL DEFAULT '',
     updated_at  INTEGER NOT NULL
   )`,
  // Metadata only: no file path or file content columns by design.
  `CREATE TABLE IF NOT EXISTS export_records (
     id             TEXT    PRIMARY KEY NOT NULL,
     resume_id      TEXT    REFERENCES resumes (id) ON DELETE SET NULL,
     template_id    TEXT    NOT NULL,
     export_type    TEXT    NOT NULL CHECK (export_type IN ('pdf', 'docx')),
     outcome        TEXT    NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'denied')),
     access_reason  TEXT    NOT NULL,
     error_message  TEXT,
     created_at     INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS export_records_created_at ON export_records (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS export_records_resume ON export_records (resume_id)`,
];

/** Imports resumes from the Step 1 key-value blob. Invalid entries are skipped, never fatal. */
async function importLegacyResumes(tx: SqlExecutor, context: MigrationContext): Promise<void> {
  if (!context.legacyResumesJson) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(context.legacyResumesJson);
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) return;
  for (const entry of parsed) {
    const resume = normalizeStoredResume(entry, context.now);
    if (!resume) continue;
    await tx.run(
      `INSERT OR IGNORE INTO resumes (id, title, template_id, accent, data_json, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [resume.id, resume.title, resume.templateId, resume.accent, JSON.stringify(resume.data), resume.createdAt, resume.updatedAt],
    );
  }
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial schema: resumes, local_profile, export_records',
    async up(tx, context) {
      for (const statement of V1_TABLES) await tx.exec(statement);
      await importLegacyResumes(tx, context);
    },
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

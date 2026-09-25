import type {
  ExportRecordRepository,
  LocalProfileRepository,
  ResumeRepository,
  StorageIssue,
  TargetJobRepository,
} from '../../../domain/ports/repositories';
import { SqliteExportRecordRepository } from './export-record-repository';
import { migrate, type MigrationResult } from './migrate';
import { SqliteLocalProfileRepository } from './profile-repository';
import { SqliteResumeRepository } from './resume-repository';
import { SqliteTargetJobRepository } from './target-job-repository';
import { MIGRATIONS, type Migration } from './schema';
import type { SqlDatabase } from './sql';

export interface AppDatabase {
  db: SqlDatabase;
  migration: MigrationResult;
  resumes: ResumeRepository;
  profile: LocalProfileRepository;
  exportRecords: ExportRecordRepository;
  targetJobs: TargetJobRepository;
}

export interface OpenOptions {
  newId: () => string;
  now?: () => number;
  /** Reads the Step 1 key-value blob; only consulted by the first migration. */
  readLegacyResumes?: () => Promise<string | null>;
  onIssue?: (issue: StorageIssue) => void;
  migrations?: readonly Migration[];
}

/** Configures the connection, runs migrations, and builds the repositories. */
export async function initializeDatabase(db: SqlDatabase, options: OpenOptions): Promise<AppDatabase> {
  const now = options.now ?? Date.now;
  const onIssue = options.onIssue ?? (() => undefined);
  await db.exec('PRAGMA journal_mode = WAL');
  await db.exec('PRAGMA foreign_keys = ON');

  const needsLegacy = options.readLegacyResumes !== undefined;
  let legacyResumesJson: string | null = null;
  const current = await db.get<{ user_version: number }>('PRAGMA user_version');
  if (needsLegacy && (current?.user_version ?? 0) === 0) {
    try {
      legacyResumesJson = (await options.readLegacyResumes?.()) ?? null;
    } catch {
      onIssue({ table: 'legacy', id: null, problem: 'could not read the Step 1 key-value store' });
    }
  }

  const migration = await migrate(db, options.migrations ?? MIGRATIONS, { now: now(), legacyResumesJson });
  return {
    db,
    migration,
    resumes: new SqliteResumeRepository(db, onIssue, now),
    profile: new SqliteLocalProfileRepository(db),
    exportRecords: new SqliteExportRecordRepository(db, options.newId, now, onIssue),
    targetJobs: new SqliteTargetJobRepository(db, now),
  };
}

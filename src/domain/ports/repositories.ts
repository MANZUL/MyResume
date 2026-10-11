import type { BackupFile, BackupSnapshot } from '../backup/backup-format';
import type { Language } from '../i18n/languages';
import type { ExportRecord, NewExportRecord } from '../export/export-record';
import type { TargetJob } from '../job-match/target-job';
import type { LocalProfile } from '../profile/local-profile';
import type { StoredResume } from '../resume/types';

// Storage ports. The domain and features depend on these interfaces only;
// the SQLite implementations live in services/storage.

export interface ResumeRepository {
  /** All resumes, newest first (by creation time). Unreadable rows are skipped and reported. */
  list(): Promise<StoredResume[]>;
  get(id: string): Promise<StoredResume | null>;
  /** Inserts a new resume. Fails if the id already exists. */
  create(resume: StoredResume): Promise<void>;
  /** Writes the full current state of an existing resume. Returns false if it no longer exists. */
  save(resume: StoredResume): Promise<boolean>;
  /** Deletes the resume. Returns false if it did not exist. */
  delete(id: string): Promise<boolean>;
  getActiveId(): Promise<string | null>;
  /** Marks one resume as the current one (or clears the selection with null). */
  setActive(id: string | null): Promise<void>;
}

export interface LocalProfileRepository {
  /** The saved profile, or an empty profile if none was saved yet. */
  get(): Promise<LocalProfile>;
  save(profile: LocalProfile): Promise<void>;
}

export interface ExportRecordRepository {
  add(record: NewExportRecord): Promise<ExportRecord>;
  listRecent(limit: number): Promise<ExportRecord[]>;
  listForResume(resumeId: string): Promise<ExportRecord[]>;
}

export interface TargetJobRepository {
  /** The saved job description for a resume, or null. */
  get(resumeId: string): Promise<TargetJob | null>;
  /** Saves (or replaces) the resume's job description. Returns false if the resume no longer exists. */
  save(job: TargetJob): Promise<boolean>;
}

export interface StorageIssue {
  table: string;
  id: string | null;
  problem: string;
}

/** Everything a backup holds, read and written as one unit. */
export interface BackupStore {
  /** Reads all backup data in one transaction, so it comes from a single moment. */
  snapshot(): Promise<BackupSnapshot>;
  /**
   * Replaces ALL resumes (and their saved job descriptions) with the backup's, sets the current
   * resume, replaces the Local Profile and applies the app language when the backup has one.
   * All of it commits or none of it does; the export history is kept (its links to resumes are cleared).
   */
  replaceAll(backup: BackupFile): Promise<void>;
}

/** App-wide settings (currently the app language). */
export interface SettingsRepository {
  /** The app language the user chose, or null if none was chosen yet. */
  getAppLanguage(): Promise<Language | null>;
  setAppLanguage(language: Language): Promise<void>;
}

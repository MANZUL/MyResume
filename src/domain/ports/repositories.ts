import type { ExportRecord, NewExportRecord } from '../export/export-record';
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

export interface StorageIssue {
  table: string;
  id: string | null;
  problem: string;
}

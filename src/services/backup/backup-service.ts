import {
  BackupError,
  BACKUP_MAX_BYTES,
  backupFileName,
  buildBackup,
  parseBackup,
  serializeBackup,
  type BackupFile,
} from '../../domain/backup/backup-format';
import type { Language } from '../../domain/i18n/languages';
import type { BackupStore } from '../../domain/ports/repositories';
import { LibraryBusyError, LibraryUnsavedError } from '../storage/resume-library';

// Local backup and restore (plan 19.16). No network: the file is written to the app's cache,
// handed to the operating system's share sheet, and removed again; a restore reads a file the user
// picks through the system file picker. Nothing is uploaded, logged or analysed.

/** The device side: files and the system sheets. Faked in tests; expo-backup-files.ts on devices. */
export interface BackupFiles {
  /** Writes `text` (UTF-8) into a fresh private temporary folder as `name` and returns its URI. */
  writeTemp(name: string, text: string): Promise<{ uri: string }>;
  /** Opens the share sheet for the file. */
  share(uri: string, name: string): Promise<void>;
  /** Removes a temporary file (and its folder). Never throws. */
  discard(uri: string): void;
  /**
   * Opens the system file picker. `canceled` when the user backed out. Otherwise the file's UTF-8
   * text; a file bigger than `maxBytes` is refused before it is read (`tooLarge`).
   */
  pick(maxBytes: number): Promise<{ canceled: true } | { canceled: false; tooLarge: true } | { canceled: false; tooLarge?: false; text: string }>;
}

/** Runs a storage operation with edits paused (ResumeLibrary.runExclusive). */
export type RunExclusive = <T>(operation: () => Promise<T>, options?: { reload?: boolean }) => Promise<T>;

export interface BackupServiceDeps {
  store: BackupStore;
  files: BackupFiles;
  exclusive: RunExclusive;
  now?: () => number;
}

/** A checked backup waiting for the user's confirmation. */
export interface PendingRestore {
  backup: BackupFile;
  /** Resumes in the file, and resumes on the device right now. */
  incoming: number;
  current: number;
}

export interface BackupResult {
  resumes: number;
  /** Resumes that could not be read and are therefore not in the backup. */
  unreadable: number;
}

export interface RestoreResult {
  resumes: number;
  /** The app language the backup carried, if any (the screen applies it). */
  appLanguage: Language | null;
}

/** Maps what the library throws to the backup error codes the screens show. */
function asBackupError(error: unknown, fallback: BackupError['code']): BackupError {
  if (error instanceof BackupError) return error;
  if (error instanceof LibraryBusyError) return new BackupError('busy');
  if (error instanceof LibraryUnsavedError) return new BackupError('unsaved-changes');
  return new BackupError(fallback);
}

export class BackupService {
  private readonly now: () => number;

  constructor(private readonly deps: BackupServiceDeps) {
    this.now = deps.now ?? Date.now;
  }

  /**
   * Creates the backup file and opens the share sheet. The data is read in one transaction while
   * edits are paused, after pending edits were written, so the file is one consistent snapshot.
   * The file is checked with the same validator a restore uses, so a backup that could not be
   * restored is never handed out.
   */
  async exportBackup(): Promise<BackupResult> {
    let file: { uri: string } | null = null;
    try {
      const { text, result } = await this.deps.exclusive(async () => {
        const snapshot = await this.deps.store.snapshot();
        const backup = buildBackup(snapshot, this.now());
        const serialized = serializeBackup(backup);
        try {
          parseBackup(serialized); // the file must pass its own validation
        } catch (error) {
          // The user's own data is outside what a restore would accept: say the backup failed, hand out nothing.
          throw new BackupError('write-failed', error instanceof BackupError ? error.detail : '');
        }
        return { text: serialized, result: { resumes: snapshot.resumes.length, unreadable: snapshot.unreadable } };
      });
      file = await this.deps.files.writeTemp(backupFileName(this.now()), text);
      await this.deps.files.share(file.uri, backupFileName(this.now()));
      // The receiving app may still be reading the file: it is removed at the next launch.
      return result;
    } catch (error) {
      if (file) this.deps.files.discard(file.uri); // a failed export leaves nothing behind
      throw asBackupError(error, 'write-failed');
    }
  }

  /**
   * Lets the user pick a file, and checks it completely WITHOUT changing anything. Returns null when
   * the picker was cancelled. Throws BackupError for an unreadable, oversized, malformed or
   * unsupported file.
   */
  async chooseBackup(currentResumes: number): Promise<PendingRestore | null> {
    let picked;
    try {
      picked = await this.deps.files.pick(BACKUP_MAX_BYTES);
    } catch {
      throw new BackupError('read-failed');
    }
    if (picked.canceled) return null;
    if (picked.tooLarge) throw new BackupError('too-large');
    const backup = parseBackup(picked.text); // throws invalid / unsupported-version / too-large
    return { backup, incoming: backup.resumes.length, current: currentResumes };
  }

  /**
   * Replaces ALL resumes on the device with the checked backup, all or nothing. Pending edits are
   * saved first (if they cannot be, nothing happens); edits are refused while it runs; on any
   * database failure the transaction rolls back and the data is exactly as it was.
   */
  async restore(pending: PendingRestore): Promise<RestoreResult> {
    try {
      await this.deps.exclusive(() => this.deps.store.replaceAll(pending.backup), { reload: true });
    } catch (error) {
      throw asBackupError(error, 'database');
    }
    return { resumes: pending.backup.resumes.length, appLanguage: pending.backup.settings.appLanguage };
  }
}

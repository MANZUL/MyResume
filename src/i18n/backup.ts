import { BackupError, BACKUP_MAX_BYTES } from '../domain/backup/backup-format';
import type { Translator } from './translate';

/** The user-facing text for a failed backup or restore, in the app language. */
export function backupErrorText(t: Translator['t'], error: unknown, operation: 'export' | 'restore'): string {
  const code = error instanceof BackupError ? error.code : operation === 'export' ? 'write-failed' : 'database';
  switch (code) {
    case 'invalid':
      return t('backup.errors.invalidFile');
    case 'unsupported-version':
      return t('backup.errors.unsupportedVersion');
    case 'too-large':
      return t('backup.errors.tooLarge', { max: BACKUP_MAX_BYTES / (1024 * 1024) });
    case 'read-failed':
      return t('backup.errors.readFailed');
    case 'unsaved-changes':
      return t('backup.errors.unsavedChanges');
    case 'busy':
      return t('backup.errors.busy');
    case 'database':
      return t('backup.errors.restoreFailed');
    default:
      return operation === 'export' ? t('backup.errors.exportFailed') : t('backup.errors.restoreFailed');
  }
}

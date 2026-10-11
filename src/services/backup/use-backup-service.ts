import { useMemo } from 'react';
import { useDatabase } from '../storage/database-context';
import { useResumeStore } from '../storage/resume-store';
import { BackupService } from './backup-service';
import { expoBackupFiles } from './expo-backup-files';

/** The app's backup service, wired to the on-device database and the library's edit lock. */
export function useBackupService(): BackupService {
  const { backup } = useDatabase();
  const { runExclusive } = useResumeStore();
  return useMemo(() => new BackupService({ store: backup, files: expoBackupFiles, exclusive: runExclusive }), [backup, runExclusive]);
}

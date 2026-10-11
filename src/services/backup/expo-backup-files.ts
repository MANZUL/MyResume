import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { newId } from '../../domain/shared/id';
import type { BackupFiles } from './backup-service';

// Device adapter for backup files: expo-file-system (private cache folder, system file picker)
// and expo-sharing (the system share sheet). Only the backup service uses it.

const backupsDir = () => new Directory(Paths.cache, 'backups');

export const expoBackupFiles: BackupFiles = {
  async writeTemp(name, text) {
    const dir = new Directory(backupsDir(), newId());
    dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, name);
    file.create({ overwrite: false }); // a fresh folder: never overwrites anything
    file.write(text); // UTF-8
    return { uri: file.uri };
  },

  async share(uri, name) {
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: name, UTI: 'public.json' });
  },

  discard(uri) {
    try {
      const file = new File(uri);
      const folder = file.parentDirectory;
      if (file.exists) file.delete();
      if (folder.exists) folder.delete();
    } catch {
      // Best effort: the launch purge removes anything left.
    }
  },

  async pick(maxBytes) {
    // The type filter only narrows what the picker offers; the content is what is validated.
    const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain', 'application/octet-stream'] });
    if (picked.canceled) return { canceled: true };
    const file = picked.result;
    if (file.size > maxBytes) return { canceled: false, tooLarge: true };
    return { canceled: false, text: await file.text() };
  },
};

/** Deletes every temporary backup file left by earlier runs. Call once at app start. */
export function purgeBackupFiles(): void {
  try {
    const dir = backupsDir();
    if (dir.exists) dir.delete();
  } catch {
    // Best effort: the OS may also clear the cache directory.
  }
}

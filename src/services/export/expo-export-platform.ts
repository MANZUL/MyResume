import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { ExportPlatform } from './export-service';
import { createFileExportPlatform, type ExportFileSystem, type FileRef } from './file-export-platform';

// Device adapters for the export platform: expo-file-system, expo-print and
// expo-sharing. Only ExportService (via use-export-service.ts) uses this.

const exportsDir = () => new Directory(Paths.cache, 'exports');

const expoFs: ExportFileSystem = {
  prepareFile(artifactId, name) {
    const dir = new Directory(exportsDir(), artifactId);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    return new File(dir, name);
  },
  writeBase64(file, base64) {
    const target = file as File;
    target.create({ overwrite: true });
    target.write(base64, { encoding: 'base64' });
  },
  async moveInto(sourceUri, target) {
    await new File(sourceUri).move(target as File);
  },
  deleteUri(uri) {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
  deleteArtifactDir(artifactId) {
    const dir = new Directory(exportsDir(), artifactId);
    if (dir.exists) dir.delete();
  },
  exists(file: FileRef) {
    return (file as File).exists;
  },
  purge() {
    const dir = exportsDir();
    if (dir.exists) dir.delete();
  },
};

let platform: (ExportPlatform & { purgeAll(): void }) | null = null;

/** One platform instance per app process. */
export function getExpoExportPlatform(): ExportPlatform {
  platform ??= createFileExportPlatform({
    fs: expoFs,
    print: {
      printToFile: ({ html, width, height, marginPt }) =>
        Print.printToFileAsync({ html, width, height, margins: { top: marginPt, bottom: marginPt, left: marginPt, right: marginPt } }),
    },
    share: {
      isAvailable: () => Sharing.isAvailableAsync(),
      // expo-sharing cannot tell whether the user completed or dismissed the sheet.
      share: async (uri, { mimeType, dialogTitle, uti }) => {
        await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI: uti });
        return 'unknown';
      },
    },
  });
  return platform;
}

/** Deletes every export artifact from previous sessions. Call once at app start. */
export function purgeExportArtifacts(): void {
  try {
    expoFs.purge();
  } catch {
    // Best effort: the OS may also clear the cache directory.
  }
}

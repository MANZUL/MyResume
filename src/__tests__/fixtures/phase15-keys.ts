// The catalog keys added after the pinned 445: phase 15 (storage failures, root error screen,
// import limit) phase 16 (paper-size selector) and phase 17 (custom color) and phase 18 (backup and restore), in every language. The earlier catalog tests pin the text of the 445 keys that existed
// before; they exclude these keys, so "every earlier value is unchanged" stays proven.
export const PHASE15_KEYS: ReadonlySet<string> = new Set([
  'storage.saveFailed',
  'storage.deleteFailed',
  'storage.loadFailedTitle',
  'storage.retry',
  'storage.dismiss',
  'crash.title',
  'crash.body',
  'import.tooLong',
  // Phase 16: the paper-size selector.
  'preview.paper.label',
  'preview.paper.letter',
  'preview.paper.a4',
  'preview.paper.hint',
  // Phase 17: the custom accent color input.
  'preview.customColor.label',
  'preview.customColor.placeholder',
  'preview.customColor.apply',
  'preview.customColor.invalid',
  // Phase 18: backup and restore.
  'nav.backup',
  'backup.intro',
  'backup.privacy',
  'backup.export',
  'backup.exportHint',
  'backup.restore',
  'backup.restoreHint',
  'backup.exporting',
  'backup.checking',
  'backup.restoring',
  'backup.confirmTitle',
  'backup.confirmBody',
  'backup.confirmCurrent',
  'backup.confirmIncoming',
  'backup.confirmReplace',
  'backup.restored',
  'backup.skipped',
  'backup.errors.invalidFile',
  'backup.errors.unsupportedVersion',
  'backup.errors.tooLarge',
  'backup.errors.readFailed',
  'backup.errors.exportFailed',
  'backup.errors.restoreFailed',
  'backup.errors.unsavedChanges',
  'backup.errors.busy',
]);

/** Leaves of a catalog as [key, value], without the phase-15 keys. */
export const withoutPhase15 = <T>(leaves: [string, T][]): [string, T][] => leaves.filter(([key]) => !PHASE15_KEYS.has(key));

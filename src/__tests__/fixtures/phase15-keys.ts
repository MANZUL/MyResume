// The catalog keys added in phase 15 (storage failures, root error screen, import limit),
// in every language. The earlier catalog tests pin the text of the 445 keys that existed
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
]);

/** Leaves of a catalog as [key, value], without the phase-15 keys. */
export const withoutPhase15 = <T>(leaves: [string, T][]): [string, T][] => leaves.filter(([key]) => !PHASE15_KEYS.has(key));

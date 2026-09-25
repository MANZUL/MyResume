import { SQLiteStorage } from 'expo-sqlite/kv-store';

// On-device key-value store backed by SQLite (replaces AsyncStorage).
// Step 2 of the migration plan replaces this blob store with proper SQLite
// repositories; until then it keeps the prototype's storage format unchanged.
export const kv = new SQLiteStorage('my-resume-kv.db');

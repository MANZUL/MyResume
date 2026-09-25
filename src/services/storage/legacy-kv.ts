import { SQLiteStorage } from 'expo-sqlite/kv-store';

// Step 1 stored all resumes as one JSON blob in this key-value database.
// Step 2 imports that blob once, inside schema migration 1, then removes the key.
const LEGACY_DB = 'my-resume-kv.db';
const LEGACY_KEY = 'resumes.v1';

export async function readLegacyResumes(): Promise<string | null> {
  return new SQLiteStorage(LEGACY_DB).getItemAsync(LEGACY_KEY);
}

export async function removeLegacyResumes(): Promise<void> {
  await new SQLiteStorage(LEGACY_DB).removeItemAsync(LEGACY_KEY);
}

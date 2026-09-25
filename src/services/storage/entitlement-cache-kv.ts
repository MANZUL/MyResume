import { SQLiteStorage } from 'expo-sqlite/kv-store';
import type { EntitlementCacheStore } from '../entitlement/cache-store';

// Device storage for the offline entitlement cache: its own small SQLite file,
// separate from the resume database and never part of user backups/exports.
const DB = 'my-resume-entitlement.db';
const KEY = 'entitlement.cache.v1';

export function createDeviceEntitlementCacheStore(): EntitlementCacheStore {
  const storage = new SQLiteStorage(DB);
  return {
    read: () => storage.getItemAsync(KEY),
    write: (value) => storage.setItemAsync(KEY, value),
    clear: async () => {
      await storage.removeItemAsync(KEY);
    },
  };
}

// Where the offline entitlement cache is kept. A separate store from the
// resume database, so subscription state is never mixed into user data or
// backups, and it can be cleared on its own.

export interface EntitlementCacheStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryEntitlementCacheStore implements EntitlementCacheStore {
  value: string | null = null;
  async read() {
    return this.value;
  }
  async write(value: string) {
    this.value = value;
  }
  async clear() {
    this.value = null;
  }
}

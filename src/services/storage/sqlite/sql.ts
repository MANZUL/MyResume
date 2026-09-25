// Minimal SQL surface the repositories and migrations need. Implemented by
// expo-sqlite on devices (expo-database.ts) and by node:sqlite in tests, so the
// same SQL runs against a real SQLite engine in both places.

export type SqlValue = string | number | null;

export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
}

export interface SqlDatabase extends SqlExecutor {
  /** Runs fn inside one exclusive transaction: all of it commits, or none of it does. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

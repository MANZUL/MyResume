import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { newId } from '../../domain/shared/id';
import type { StorageIssue } from '../../domain/ports/repositories';
import { initializeDatabase, type AppDatabase } from './sqlite/database';
import type { SqlDatabase, SqlExecutor, SqlValue } from './sqlite/sql';
import { readLegacyResumes, removeLegacyResumes } from './legacy-kv';

export const DATABASE_NAME = 'my-resume.db';

function executor(db: SQLiteDatabase): SqlExecutor {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params: SqlValue[] = []) => {
      const result = await db.runAsync(sql, params);
      return { changes: result.changes };
    },
    get: <T,>(sql: string, params: SqlValue[] = []) => db.getFirstAsync<T>(sql, params),
    all: <T,>(sql: string, params: SqlValue[] = []) => db.getAllAsync<T>(sql, params),
  };
}

function adapt(db: SQLiteDatabase): SqlDatabase {
  return {
    ...executor(db),
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      let result: T | undefined;
      // Exclusive: no other query on this connection can interleave with the transaction.
      await db.withExclusiveTransactionAsync(async (txn) => {
        result = await fn(executor(txn));
      });
      return result as T;
    },
    close: () => db.closeAsync(),
  };
}

/** Opens the app database on the device, migrates it, and imports Step 1 data once. */
export async function openAppDatabase(onIssue?: (issue: StorageIssue) => void): Promise<AppDatabase> {
  const db = adapt(await openDatabaseAsync(DATABASE_NAME));
  const app = await initializeDatabase(db, { newId, readLegacyResumes, onIssue });
  if (app.migration.from === 0 && app.migration.applied.includes(1)) {
    // Imported inside migration 1; the old blob is no longer needed.
    await removeLegacyResumes().catch(() => undefined);
  }
  return app;
}

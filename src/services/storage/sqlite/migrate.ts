import type { Migration, MigrationContext } from './schema';
import type { SqlDatabase } from './sql';

export class SchemaTooNewError extends Error {
  constructor(readonly found: number, readonly supported: number) {
    super(`The saved data uses schema version ${found}, but this app supports up to ${supported}.`);
    this.name = 'SchemaTooNewError';
  }
}

export class MigrationError extends Error {
  constructor(readonly version: number, readonly cause: unknown) {
    super(`Could not upgrade saved data to schema version ${version}.`);
    this.name = 'MigrationError';
  }
}

export interface MigrationResult {
  from: number;
  to: number;
  applied: number[];
}

export async function getSchemaVersion(db: SqlDatabase): Promise<number> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Applies pending migrations in order. Each migration and its version bump run
 * in one transaction, so a failure leaves the database at the last good
 * version. Running it again when up to date does nothing (idempotent).
 */
export async function migrate(
  db: SqlDatabase,
  migrations: readonly Migration[],
  context: MigrationContext,
): Promise<MigrationResult> {
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  ordered.forEach((migration, index) => {
    if (migration.version !== index + 1) throw new Error('Migrations must be numbered 1, 2, 3, … without gaps.');
  });
  const latest = ordered.length ? ordered[ordered.length - 1].version : 0;
  const from = await getSchemaVersion(db);
  if (from > latest) throw new SchemaTooNewError(from, latest);

  const applied: number[] = [];
  for (const migration of ordered) {
    if (migration.version <= from) continue;
    try {
      await db.transaction(async (tx) => {
        await migration.up(tx, context);
        // PRAGMA values cannot be bound as parameters; version is a checked integer.
        await tx.exec(`PRAGMA user_version = ${Math.trunc(migration.version)}`);
      });
    } catch (error) {
      throw new MigrationError(migration.version, error);
    }
    applied.push(migration.version);
  }
  return { from, to: Math.max(from, latest), applied };
}

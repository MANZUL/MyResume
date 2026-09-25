import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase, SqlExecutor, SqlValue } from '../../services/storage/sqlite/sql';

// Test adapter: the production SQL runs against a real SQLite engine (node:sqlite)
// on a real database file, so reopening the file simulates an app restart.

function executor(db: DatabaseSync): SqlExecutor {
  return {
    exec: async (sql) => {
      db.exec(sql);
    },
    run: async (sql, params: SqlValue[] = []) => {
      const result = db.prepare(sql).run(...params);
      return { changes: Number(result.changes) };
    },
    get: async <T,>(sql: string, params: SqlValue[] = []) =>
      ((db.prepare(sql).get(...params) as T | undefined) ?? null),
    all: async <T,>(sql: string, params: SqlValue[] = []) => db.prepare(sql).all(...params) as T[],
  };
}

export interface TestDatabase extends SqlDatabase {
  raw: DatabaseSync;
  closed: boolean;
}

export function openTestDatabase(path: string): TestDatabase {
  const raw = new DatabaseSync(path);
  let queue: Promise<unknown> = Promise.resolve();
  const base = executor(raw);
  const handle: TestDatabase = {
    ...base,
    raw,
    closed: false,
    transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      const run = queue.then(async () => {
        raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(base);
          raw.exec('COMMIT');
          return result;
        } catch (error) {
          raw.exec('ROLLBACK');
          throw error;
        }
      });
      queue = run.catch(() => undefined);
      return run;
    },
    async close() {
      if (!handle.closed) raw.close();
      handle.closed = true;
    },
  };
  return handle;
}

export function tempDir(): { dir: string; file: (name: string) => string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'my-resume-db-'));
  return { dir, file: (name) => join(dir, name), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

let counter = 0;
export const testId = () => `id-${(counter += 1).toString().padStart(6, '0')}`;

/** Manually advanced clock + timers for deterministic autosave tests. */
export class ManualTimers {
  time = 1_000_000;
  private tasks: { at: number; fn: () => void; handle: number }[] = [];
  private nextHandle = 1;
  now = () => this.time;
  setTimeout = (fn: () => void, ms: number) => {
    const handle = this.nextHandle++;
    this.tasks.push({ at: this.time + ms, fn, handle });
    return handle;
  };
  clearTimeout = (handle: unknown) => {
    this.tasks = this.tasks.filter((task) => task.handle !== handle);
  };
  /** Advances time, running due timers in order, and lets their promises settle. */
  async advance(ms: number) {
    const target = this.time + ms;
    for (;;) {
      const due = this.tasks.filter((task) => task.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.tasks = this.tasks.filter((task) => task !== due);
      this.time = due.at;
      due.fn();
      await settle();
    }
    this.time = target;
    await settle();
  }
}

export async function settle() {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

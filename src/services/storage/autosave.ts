// Controlled persistence for edits (plan §12).
//
// - Debounced: a burst of keystrokes becomes one write, `delayMs` after the last change.
// - Bounded: while the user keeps typing, a write still happens at least every `maxWaitMs`.
// - Ordered: one write per key at a time; the newest value always wins.
// - Flushable: callers force pending writes on screen blur and when the app goes to the
//   background, which is the last reliable moment before the OS may kill the process.
// - Failures keep the value pending so the next flush or edit retries it.

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

export const realTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export interface AutosaverOptions<T> {
  write(key: string, value: T): Promise<void>;
  onError?(key: string, error: unknown): void;
  delayMs?: number;
  maxWaitMs?: number;
  timers?: Timers;
}

interface Entry<T> {
  pending: { value: T } | null;
  firstChangeAt: number;
  timer: unknown;
  inFlight: Promise<void> | null;
}

export interface Autosaver<T> {
  schedule(key: string, value: T): void;
  /** Writes pending changes now (all keys, or one) and resolves when they are stored. */
  flush(key?: string): Promise<void>;
  /** Drops a pending change without writing it (e.g. the record was deleted). */
  cancel(key: string): void;
  hasPending(key?: string): boolean;
  dispose(): void;
}

export function createAutosaver<T>(options: AutosaverOptions<T>): Autosaver<T> {
  const delayMs = options.delayMs ?? 600;
  const maxWaitMs = options.maxWaitMs ?? 3000;
  const timers = options.timers ?? realTimers;
  const entries = new Map<string, Entry<T>>();
  let disposed = false;

  const entryFor = (key: string): Entry<T> => {
    let entry = entries.get(key);
    if (!entry) {
      entry = { pending: null, firstChangeAt: 0, timer: null, inFlight: null };
      entries.set(key, entry);
    }
    return entry;
  };

  const clearTimer = (entry: Entry<T>) => {
    if (entry.timer !== null) timers.clearTimeout(entry.timer);
    entry.timer = null;
  };

  const writeNow = (key: string): Promise<void> => {
    const entry = entryFor(key);
    clearTimer(entry);
    if (entry.inFlight) {
      // Chain after the running write so writes for one key never overlap.
      return entry.inFlight.then(() => (entry.pending ? writeNow(key) : undefined));
    }
    if (!entry.pending) return Promise.resolve();
    const { value } = entry.pending;
    entry.pending = null;
    entry.firstChangeAt = 0;
    const run = options
      .write(key, value)
      .catch((error: unknown) => {
        // Keep the unsaved value unless a newer edit already replaced it.
        if (!entry.pending) {
          entry.pending = { value };
          entry.firstChangeAt = timers.now();
        }
        options.onError?.(key, error);
      })
      .finally(() => {
        entry.inFlight = null;
      });
    entry.inFlight = run;
    return run;
  };

  return {
    schedule(key, value) {
      if (disposed) return;
      const entry = entryFor(key);
      const now = timers.now();
      if (!entry.pending) entry.firstChangeAt = now;
      entry.pending = { value };
      clearTimer(entry);
      const waitLeft = Math.max(0, entry.firstChangeAt + maxWaitMs - now);
      entry.timer = timers.setTimeout(() => {
        entry.timer = null;
        void writeNow(key);
      }, Math.min(delayMs, waitLeft));
    },
    async flush(key) {
      const keys = key === undefined ? [...entries.keys()] : [key];
      await Promise.all(keys.map((k) => writeNow(k)));
      // A write may have failed and re-queued its value; one more pass retries it once.
      const again = keys.filter((k) => entries.get(k)?.pending);
      if (again.length) await Promise.all(again.map((k) => writeNow(k)));
    },
    cancel(key) {
      const entry = entries.get(key);
      if (!entry) return;
      clearTimer(entry);
      entry.pending = null;
    },
    hasPending(key) {
      if (key !== undefined) {
        const entry = entries.get(key);
        return Boolean(entry && (entry.pending || entry.inFlight));
      }
      return [...entries.values()].some((entry) => entry.pending || entry.inFlight);
    },
    dispose() {
      disposed = true;
      for (const entry of entries.values()) clearTimer(entry);
    },
  };
}

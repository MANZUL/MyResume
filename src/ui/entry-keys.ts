import { useCallback, useState } from 'react';

// Stable React keys for list items, kept in the UI only. Resume data has no ids
// (it matches the spec's ResumeData), so keys are tracked next to the list and
// updated by the same add / remove / move operation that changes the data. This
// keeps each form, its open/closed state and its text input attached to the same
// entry after deleting or reordering, which index keys do not.

export type ListOp =
  | { type: 'add' }
  | { type: 'remove'; index: number }
  | { type: 'move'; from: number; to: number };

let counter = 0;
/** Unique within the app process. */
export const nextKey = (): string => `k${++counter}`;

/** Applies to a list the same operation applyKeyOp applies to its keys. */
export function applyListOp<T>(items: readonly T[], op: ListOp, added: () => T): T[] {
  switch (op.type) {
    case 'add':
      return [...items, added()];
    case 'remove':
      return items.filter((_, i) => i !== op.index);
    case 'move': {
      if (op.from < 0 || op.from >= items.length || op.to < 0 || op.to >= items.length) return [...items];
      const next = [...items];
      const [item] = next.splice(op.from, 1);
      next.splice(op.to, 0, item);
      return next;
    }
  }
}

export function applyKeyOp(keys: readonly string[], op: ListOp, makeKey: () => string = nextKey): string[] {
  return applyListOp(keys, op, makeKey);
}

/**
 * Brings keys in line with a list whose length changed by other means (e.g. the
 * list was replaced). Existing keys are kept by position; missing ones get a
 * deterministic positional key, so rendering never creates new keys.
 */
export function syncKeys(keys: readonly string[], length: number): string[] {
  if (keys.length === length) return keys as string[];
  if (keys.length > length) return keys.slice(0, length);
  return [...keys, ...Array.from({ length: length - keys.length }, (_, i) => `p${keys.length + i}`)];
}

/**
 * Stable keys for a list of `length` items. Call `apply(op)` in the same event
 * handler that applies `op` to the data.
 */
export function useStableKeys(length: number): readonly [string[], (op: ListOp) => void] {
  const [keys, setKeys] = useState<string[]>(() => Array.from({ length }, () => nextKey()));
  const current = syncKeys(keys, length);
  const apply = useCallback((op: ListOp) => setKeys((previous) => applyKeyOp(syncKeys(previous, length), op)), [length]);
  return [current, apply] as const;
}

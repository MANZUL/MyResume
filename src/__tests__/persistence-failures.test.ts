import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ResumeRepository } from '../domain/ports/repositories';
import { emptyResume, type ResumeData } from '../domain/resume/types';
import { de } from '../i18n/messages/de';
import { en } from '../i18n/messages/en';
import { es } from '../i18n/messages/es';
import { fr } from '../i18n/messages/fr';
import { ar } from '../i18n/messages/ar';
import { createTranslator } from '../i18n/translate';
import { ResumeLibrary } from '../services/storage/resume-library';
import { initializeDatabase, type AppDatabase } from '../services/storage/sqlite/database';
import { ManualTimers, openTestDatabase, tempDir, testId, type TestDatabase } from './helpers/node-sqlite';
import { PHASE15_KEYS } from './fixtures/phase15-keys';

// Phase 15: storage failures are visible and recoverable. Failure injection on a real
// SQLite database: the repository wrapper below fails on demand, then recovers.

const SRC = join(__dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

interface Failures {
  save: boolean;
  create: boolean;
  list: boolean;
  delete: boolean;
}

/** The real repository, with failures that can be switched on and off. */
function flaky(real: ResumeRepository, fail: Failures) {
  const calls = { save: 0, create: 0, list: 0, delete: 0 };
  const boom = (what: string) => new Error(`injected ${what} failure`);
  const repo: ResumeRepository = {
    list: async () => {
      calls.list += 1;
      if (fail.list) throw boom('list');
      return real.list();
    },
    get: (id) => real.get(id),
    create: async (resume) => {
      calls.create += 1;
      if (fail.create) throw boom('create');
      return real.create(resume);
    },
    save: async (resume) => {
      calls.save += 1;
      if (fail.save) throw boom('save');
      return real.save(resume);
    },
    delete: async (id) => {
      calls.delete += 1;
      if (fail.delete) throw boom('delete');
      return real.delete(id);
    },
    getActiveId: () => real.getActiveId(),
    setActive: (id) => real.setActive(id),
  };
  return { repo, calls };
}

const withName = (name: string): ResumeData => ({ ...emptyResume(), name });

describe('persistence failures are visible and recoverable', () => {
  let dir: ReturnType<typeof tempDir>;
  let db: TestDatabase;
  let app: AppDatabase;
  let timers: ManualTimers;
  let fail: Failures;
  let calls: ReturnType<typeof flaky>['calls'];
  let library: ResumeLibrary;
  const logged: string[] = [];

  beforeEach(async () => {
    dir = tempDir();
    db = openTestDatabase(dir.file('app.db'));
    app = await initializeDatabase(db, { newId: testId });
    timers = new ManualTimers();
    fail = { save: false, create: false, list: false, delete: false };
    const wrapped = flaky(app.resumes, fail);
    calls = wrapped.calls;
    logged.length = 0;
    library = new ResumeLibrary(wrapped.repo, { newId: testId, timers, now: timers.now, delayMs: 600, maxWaitMs: 3000, onError: (op) => void logged.push(op) });
    await library.load();
  });
  afterEach(async () => {
    library.dispose();
    await db.close();
    dir.cleanup();
  });

  /** A stored resume (created while storage works), then storage starts failing. */
  async function storedResume(name = 'Original') {
    const resume = library.create(withName(name), name);
    await library.flush();
    expect(library.getStatus()).toEqual({ loadFailed: false, saveFailed: false, deleteFailed: null });
    return resume;
  }
  const onDisk = async (id: string) => (await app.resumes.get(id))?.data.name ?? null;

  it('1. a failed save keeps the unsaved data, reports the failure, and writes nothing', async () => {
    const resume = await storedResume();
    fail.save = true;
    library.update(resume.id, { data: withName('Edited') });
    await library.flush();
    expect(library.getStatus().saveFailed).toBe(true);
    // Nothing is lost: the edit is still the resume on screen, and still waiting to be written.
    expect(library.get(resume.id)!.data.name).toBe('Edited');
    expect(library.hasPendingChanges(resume.id)).toBe(true);
    // And it is not claimed as saved: the database still holds the old value.
    expect(await onDisk(resume.id)).toBe('Original');
    expect(logged).toContain('save');
  });

  it('2. Retry writes the real pending data, and the error clears only once SQLite confirms', async () => {
    const resume = await storedResume();
    fail.save = true;
    library.update(resume.id, { data: withName('Edited') });
    await library.flush();
    expect(library.getStatus().saveFailed).toBe(true);

    fail.save = false;
    expect(await library.retrySave()).toBe(true);
    expect(library.getStatus().saveFailed).toBe(false);
    expect(await onDisk(resume.id)).toBe('Edited');
    expect(library.hasPendingChanges()).toBe(false);
    expect((await app.resumes.list()).length).toBe(1); // no duplicate row
  });

  it('3. a retry that fails leaves the error visible and the data pending; a later retry can still succeed', async () => {
    const resume = await storedResume();
    fail.save = true;
    library.update(resume.id, { data: withName('Edited') });
    await library.flush();
    expect(await library.retrySave()).toBe(false);
    expect(library.getStatus().saveFailed).toBe(true);
    expect(library.hasPendingChanges(resume.id)).toBe(true);
    expect(library.get(resume.id)!.data.name).toBe('Edited');
    fail.save = false;
    expect(await library.retrySave()).toBe(true);
    expect(await onDisk(resume.id)).toBe('Edited');
  });

  it('a newer edit after a failure is the value that gets written (the newest always wins)', async () => {
    const resume = await storedResume();
    fail.save = true;
    library.update(resume.id, { data: withName('First') });
    await library.flush();
    fail.save = false;
    library.update(resume.id, { data: withName('Second') });
    await library.flush();
    expect(library.getStatus().saveFailed).toBe(false);
    expect(await onDisk(resume.id)).toBe('Second');
  });

  it('there are no endless automatic retries: after a failure nothing is written until the user retries or edits again', async () => {
    const resume = await storedResume();
    const before = calls.save;
    fail.save = true;
    library.update(resume.id, { data: withName('Edited') });
    await timers.advance(600); // the debounced write runs and fails
    const attempts = calls.save;
    expect(attempts - before).toBe(1);
    expect(library.getStatus().saveFailed).toBe(true);
    await timers.advance(10 * 60 * 1000);
    expect(calls.save).toBe(attempts);
    // One Retry press never runs more than the failed write and one more attempt.
    await library.retrySave();
    expect(calls.save).toBeLessThanOrEqual(attempts + 2);
  });

  it('flushing on navigation or when the app leaves the foreground keeps a failed write pending instead of dropping it', async () => {
    const resume = await storedResume();
    fail.save = true;
    library.update(resume.id, { data: withName('Edited') });
    await library.flush(resume.id); // screen blur
    await library.flush(); // app goes to the background
    expect(library.hasPendingChanges(resume.id)).toBe(true);
    expect(library.getStatus().saveFailed).toBe(true);
    fail.save = false;
    await library.flush(); // the next lifecycle flush stores it
    expect(await onDisk(resume.id)).toBe('Edited');
    expect(library.getStatus().saveFailed).toBe(false);
  });

  it('7a. a failed create is surfaced, the new resume stays on screen, and Retry stores it once', async () => {
    fail.create = true;
    const resume = library.create(withName('Brand new'), 'Brand new');
    await library.flush();
    expect(library.getStatus().saveFailed).toBe(true);
    expect(library.get(resume.id)!.data.name).toBe('Brand new');
    expect(await app.resumes.get(resume.id)).toBeNull();
    fail.create = false;
    expect(await library.retrySave()).toBe(true);
    expect(await onDisk(resume.id)).toBe('Brand new');
    expect((await app.resumes.list()).length).toBe(1);
  });

  it('7b. a failed duplicate is surfaced the same way', async () => {
    const source = await storedResume('Source');
    fail.create = true;
    const copy = library.duplicate(source.id)!;
    await library.flush();
    expect(library.getStatus().saveFailed).toBe(true);
    expect(library.get(copy.id)).not.toBeNull();
    expect(await app.resumes.get(copy.id)).toBeNull();
    fail.create = false;
    expect(await library.retrySave()).toBe(true);
    expect(await onDisk(copy.id)).toBe('Source');
    expect((await app.resumes.list()).length).toBe(2);
  });

  it('4. a failed library load is an error state, never an empty library', async () => {
    const resume = await storedResume();
    library.dispose();
    const wrapped = flaky(app.resumes, fail);
    fail.list = true;
    const fresh = new ResumeLibrary(wrapped.repo, { newId: testId, timers, now: timers.now });
    expect(await fresh.load()).toBe(false);
    expect(fresh.getStatus().loadFailed).toBe(true);
    expect(fresh.getAll()).toEqual([]); // not the real library: the status tells the screens so
    expect(await onDisk(resume.id)).toBe('Original'); // the stored data is untouched
    // The screens: Home shows the error card and not the empty-library text.
    const home = read('features/library/HomeScreen.tsx');
    expect(home).toMatch(/status\.loadFailed \? <LoadFailedCard \/> : null/);
    expect(home).toMatch(/status\.loadFailed \? null : \(/);
    fresh.dispose();
  });

  it('5. retrying a failed load shows the resumes and clears the error', async () => {
    const resume = await storedResume();
    library.dispose();
    const wrapped = flaky(app.resumes, fail);
    fail.list = true;
    const fresh = new ResumeLibrary(wrapped.repo, { newId: testId, timers, now: timers.now });
    await fresh.load();
    expect(await fresh.load()).toBe(false); // still failing: stays an error
    fail.list = false;
    expect(await fresh.load()).toBe(true);
    expect(fresh.getStatus().loadFailed).toBe(false);
    expect(fresh.getAll().map((r) => r.id)).toEqual([resume.id]);
    fresh.dispose();
  });

  it('a resume created while loading was failing is kept when the load finally succeeds', async () => {
    const stored = await storedResume('Stored');
    library.dispose();
    const wrapped = flaky(app.resumes, fail);
    fail.list = true;
    const fresh = new ResumeLibrary(wrapped.repo, { newId: testId, timers, now: timers.now });
    await fresh.load();
    const local = fresh.create(withName('Typed meanwhile'), 'Typed meanwhile');
    await fresh.flush();
    fail.list = false;
    await fresh.load();
    expect(fresh.getAll().map((r) => r.id).sort()).toEqual([stored.id, local.id].sort());
    expect(await onDisk(local.id)).toBe('Typed meanwhile');
    fresh.dispose();
  });

  it('6. a failed delete is not reported as deleted: the resume returns to the list and stays stored', async () => {
    const resume = await storedResume('Keep me');
    fail.delete = true;
    expect(await library.remove(resume.id)).toBe(false);
    expect(library.get(resume.id)).not.toBeNull();
    expect(library.getStatus().deleteFailed).toEqual({ id: resume.id, title: 'Keep me' });
    expect(await onDisk(resume.id)).toBe('Keep me');
    // A write after the failed delete still works (the resume is not marked deleted).
    library.update(resume.id, { data: withName('Still editable') });
    await library.flush();
    expect(await onDisk(resume.id)).toBe('Still editable');
  });

  it('a delete retry removes the resume and clears the notice; Dismiss only hides it', async () => {
    const resume = await storedResume('Remove me');
    fail.delete = true;
    await library.remove(resume.id);
    library.dismissDeleteError();
    expect(library.getStatus().deleteFailed).toBeNull();
    expect(library.get(resume.id)).not.toBeNull(); // dismissing does not pretend it was deleted

    await library.remove(resume.id); // fails again
    expect(library.getStatus().deleteFailed).not.toBeNull();
    fail.delete = false;
    expect(await library.remove(resume.id)).toBe(true);
    expect(library.getStatus().deleteFailed).toBeNull();
    expect(library.get(resume.id)).toBeNull();
    expect(await app.resumes.get(resume.id)).toBeNull();
  });

  it('a failed delete of the current resume restores it as current', async () => {
    const resume = await storedResume();
    await library.setActive(resume.id);
    fail.delete = true;
    await library.remove(resume.id);
    expect(library.getActiveId()).toBe(resume.id);
  });

  it('a successful delete of a resume with a failed pending save leaves no stale error', async () => {
    const resume = await storedResume();
    fail.save = true;
    library.update(resume.id, { data: withName('Doomed edit') });
    await library.flush();
    expect(library.getStatus().saveFailed).toBe(true);
    fail.save = false;
    expect(await library.remove(resume.id)).toBe(true);
    expect(library.getStatus().saveFailed).toBe(false);
  });

  it('the status object only changes when something changes (stable for React)', async () => {
    const resume = await storedResume();
    const before = library.getStatus();
    library.update(resume.id, { data: withName('Edit') });
    await library.flush();
    expect(library.getStatus()).toBe(before);
  });

  it('8. normal autosave timing is unchanged: debounce 600 ms, one write per burst, bounded by the maximum wait', async () => {
    const resume = await storedResume();
    const base = calls.save;
    library.update(resume.id, { data: withName('a') });
    await timers.advance(300);
    library.update(resume.id, { data: withName('ab') });
    await timers.advance(599);
    expect(calls.save).toBe(base);
    await timers.advance(1);
    expect(calls.save).toBe(base + 1);
    expect(await onDisk(resume.id)).toBe('ab');
    // Typing without a 600 ms pause still writes within the 3 s bound.
    for (let i = 0; i < 20; i += 1) {
      library.update(resume.id, { data: withName(`typing ${i}`) });
      await timers.advance(250);
    }
    expect(calls.save).toBeGreaterThanOrEqual(base + 2);
    expect(library.getStatus().saveFailed).toBe(false);
  });

  it('autosave.ts itself was not changed by this phase', () => {
    expect(read('services/storage/autosave.ts')).toMatch(/const delayMs = options\.delayMs \?\? 600;\n  const maxWaitMs = options\.maxWaitMs \?\? 3000;/);
  });
});

describe('the screens and the store report storage failures', () => {
  it('the root layout mounts the storage banner above every screen, inside the error boundary', () => {
    const layout = read('app/_layout.tsx');
    expect(layout).toMatch(/<RootErrorBoundary>/);
    expect(layout).toMatch(/<StorageBanner \/>/);
  });

  it('Retry calls the real retry operations, and one attempt runs at a time', () => {
    const ui = read('ui/StorageStatus.tsx');
    expect(ui).toMatch(/retrySave/);
    expect(ui).toMatch(/retryDelete/);
    expect(ui).toMatch(/retryLoad/);
    expect(ui).toMatch(/if \(busy\) return;/);
    const store = read('services/storage/resume-store.tsx');
    expect(store).toMatch(/retrySave: \(\) => library\.retrySave\(\)/);
    expect(store).toMatch(/retryLoad: \(\) => library\.load\(\)/);
  });

  it('the editor shows the load error, not "no longer exists", when the library could not be read', () => {
    expect(read('features/editor/EditorScreen.tsx')).toMatch(/status\.loadFailed\) \{[\s\S]*<LoadFailedCard \/>/);
  });

  it('nothing logs resume content: failures log only the operation and the error name, only in development', () => {
    const store = read('services/storage/resume-store.tsx');
    expect(store).toMatch(/if \(__DEV__\) console\.warn\(`\[storage\] \$\{operation\} failed \(\$\{error instanceof Error \? error\.name : 'error'\}\)`\)/);
    expect(store).not.toMatch(/console\.\w+\([^)]*\berror\)/);
    for (const file of ['ui/StorageStatus.tsx', 'ui/error-boundary-core.ts', 'services/storage/resume-library.ts']) {
      expect(read(file), file).not.toMatch(/console\./);
    }
    // The error boundary logs the error's name only (its message can contain user text).
    expect(read('ui/RootErrorBoundary.tsx')).toMatch(/if \(__DEV__\) console\.warn\(`\[ui\] render error \(\$\{error\.name\}\)`\)/);
  });
});

describe('phase 15 messages exist in all five languages', () => {
  const catalogs = { en, de, fr, es, ar } as const;
  // The preview keys (phases 16 and 17) are checked in paper-size.test.ts and accent-color.test.ts.
  const KEYS = [...PHASE15_KEYS].filter((key) => !key.startsWith('preview.'));
  const get = (catalog: unknown, key: string) => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], catalog) as string;

  it('every new key has a non-empty value with the same parameters as English, and none repeats an existing English text', () => {
    const params = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [language, catalog] of Object.entries(catalogs)) {
      for (const key of KEYS) {
        const value = get(catalog, key);
        expect(value, `${language} ${key}`).toBeTruthy();
        expect(params(value), `${language} ${key}`).toEqual(params(get(en, key)));
      }
    }
    for (const language of ['de', 'fr', 'es', 'ar'] as const) {
      for (const key of KEYS) expect(get(catalogs[language], key), `${language} ${key} is translated`).not.toBe(get(en, key));
    }
  });

  it('they render, with parameters, in every language', () => {
    expect(createTranslator('en').t('storage.deleteFailed', { title: 'CV' })).toBe('⁨"CV"⁩ could not be deleted. It is still on this device.'.replace(/⁨|⁩/g, ''));
    expect(createTranslator('de').t('storage.saveFailed')).toMatch(/nicht .* gespeichert/);
    expect(createTranslator('fr').t('storage.retry')).toBe('Réessayer');
    expect(createTranslator('es').t('crash.title')).toBe('Algo salió mal');
    expect(createTranslator('ar').t('storage.retry')).toBe('إعادة المحاولة');
    expect(createTranslator('en').t('import.tooLong', { max: 30000 })).toBe('This text is too long to import. The limit is 30,000 characters.');
  });

  it('the existing database messages are reused for the load card and the crash screen (no duplicated English text)', () => {
    const ui = read('ui/StorageStatus.tsx');
    expect(ui).toMatch(/t\('database\.unchanged'\)/);
    expect(read('ui/RootErrorBoundary.tsx')).toMatch(/t\('database\.tryAgain'\)/);
  });
});


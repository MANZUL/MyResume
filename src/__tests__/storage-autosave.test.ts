import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import { emptyResume } from '../domain/resume/types';
import { createAutosaver } from '../services/storage/autosave';
import { ResumeLibrary } from '../services/storage/resume-library';
import { initializeDatabase, type AppDatabase } from '../services/storage/sqlite/database';
import { PremiumRequiredError } from '../domain/entitlement/features';
import { MemoryEntitlementCacheStore } from '../services/entitlement/cache-store';
import { EntitlementService } from '../services/entitlement/entitlement-service';
import { FakeStoreProvider } from '../services/entitlement/fake-store';
import { PremiumGate } from '../services/entitlement/premium-gate';
import { ExportService, type ExportPlatform } from '../services/export/export-service';
import { ManualTimers, openTestDatabase, settle, tempDir, testId, type TestDatabase } from './helpers/node-sqlite';

describe('autosaver (debounced, bounded, ordered)', () => {
  it('coalesces a burst of edits into one write after the quiet period', async () => {
    const timers = new ManualTimers();
    const writes: string[] = [];
    const saver = createAutosaver<string>({ timers, delayMs: 600, maxWaitMs: 3000, write: async (_k, v) => void writes.push(v) });
    saver.schedule('a', 'J');
    await timers.advance(200);
    saver.schedule('a', 'Ja');
    await timers.advance(200);
    saver.schedule('a', 'Jan');
    await timers.advance(599);
    expect(writes).toEqual([]);
    await timers.advance(1);
    expect(writes).toEqual(['Jan']);
  });

  it('still writes at least every maxWait while the user keeps typing', async () => {
    const timers = new ManualTimers();
    const writes: string[] = [];
    const saver = createAutosaver<string>({ timers, delayMs: 600, maxWaitMs: 3000, write: async (_k, v) => void writes.push(v) });
    for (let i = 0; i < 20; i += 1) {
      saver.schedule('a', `v${i}`);
      await timers.advance(250); // never quiet for 600 ms
    }
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect(writes[0]).toBe('v11'); // written at the 3 s bound, not only at the end
  });

  it('flush writes immediately and resolves when stored', async () => {
    const timers = new ManualTimers();
    const writes: string[] = [];
    const saver = createAutosaver<string>({ timers, write: async (_k, v) => void writes.push(v) });
    saver.schedule('a', 'x');
    saver.schedule('b', 'y');
    await saver.flush();
    expect(writes.sort()).toEqual(['x', 'y']);
    expect(saver.hasPending()).toBe(false);
  });

  it('never overlaps writes for one key and keeps the newest value', async () => {
    const timers = new ManualTimers();
    const order: string[] = [];
    let release: () => void = () => undefined;
    const saver = createAutosaver<string>({
      timers,
      write: (_k, v) =>
        new Promise<void>((resolve) => {
          order.push(`start ${v}`);
          release = () => {
            order.push(`end ${v}`);
            resolve();
          };
        }),
    });
    saver.schedule('a', 'first');
    const firstFlush = saver.flush('a');
    saver.schedule('a', 'second');
    const secondFlush = saver.flush('a');
    await settle();
    expect(order).toEqual(['start first']);
    release();
    await settle();
    release();
    await Promise.all([firstFlush, secondFlush]);
    expect(order).toEqual(['start first', 'end first', 'start second', 'end second']);
  });

  it('keeps a failed write pending and retries it on the next flush', async () => {
    const timers = new ManualTimers();
    let failures = 2;
    const stored: string[] = [];
    const errors: unknown[] = [];
    const saver = createAutosaver<string>({
      timers,
      write: async (_k, v) => {
        if (failures-- > 0) throw new Error('SQLITE_BUSY');
        stored.push(v);
      },
      onError: (_k, e) => errors.push(e),
    });
    saver.schedule('a', 'draft');
    await saver.flush('a'); // fails twice (flush retries once)
    expect(stored).toEqual([]);
    expect(saver.hasPending('a')).toBe(true);
    await saver.flush('a');
    expect(stored).toEqual(['draft']);
    expect(errors).toHaveLength(2);
  });

  it('cancel drops a pending change', async () => {
    const timers = new ManualTimers();
    const writes: string[] = [];
    const saver = createAutosaver<string>({ timers, write: async (_k, v) => void writes.push(v) });
    saver.schedule('a', 'x');
    saver.cancel('a');
    await timers.advance(10_000);
    await saver.flush();
    expect(writes).toEqual([]);
  });
});

describe('resume library on SQLite (edits survive navigation, restart, termination)', () => {
  let dir: ReturnType<typeof tempDir>;
  let db: TestDatabase;
  let app: AppDatabase;
  let timers: ManualTimers;

  const boot = async () => {
    db = openTestDatabase(dir.file('app.db'));
    app = await initializeDatabase(db, { newId: testId, now: timers.now });
    const library = new ResumeLibrary(app.resumes, { newId: testId, timers, now: timers.now, delayMs: 600, maxWaitMs: 3000 });
    await library.load();
    return library;
  };

  beforeEach(() => {
    dir = tempDir();
    timers = new ManualTimers();
  });
  afterEach(async () => {
    await db.close();
    dir.cleanup();
  });

  it('create and duplicate are stored immediately; edits are stored after the debounce', async () => {
    const library = await boot();
    const created = library.create(emptyResume(), 'Mine');
    const copy = library.duplicate(created.id);
    await settle();
    expect((await app.resumes.list()).map((r) => r.title).sort()).toEqual(['Mine', 'Mine (copy)']);

    library.update(created.id, { title: 'Renamed' });
    library.update(created.id, { data: { ...emptyResume(), name: 'Jane' } });
    expect((await app.resumes.get(created.id))?.title).toBe('Mine'); // not yet written
    await timers.advance(600);
    expect(await app.resumes.get(created.id)).toMatchObject({ title: 'Renamed', data: { name: 'Jane' } });
    expect((await app.resumes.get(copy!.id))?.title).toBe('Mine (copy)');
  });

  it('screen navigation: flushing on blur stores the edit without waiting for the timer', async () => {
    const library = await boot();
    const r = library.create(emptyResume(), 'Draft');
    await settle();
    library.update(r.id, { data: { ...emptyResume(), name: 'Typed then left the screen' } });
    await library.flush(r.id);
    expect((await app.resumes.get(r.id))?.data.name).toBe('Typed then left the screen');
  });

  it('app restart: a new process sees every flushed edit, template choice and color', async () => {
    const first = await boot();
    const r = first.create(SAMPLE_RESUME, 'Sample');
    first.update(r.id, { templateId: 'healthcare-educator', accent: '#0F766E' });
    await first.setActive(r.id);
    await first.flush(); // app goes to background
    first.dispose();
    await db.close();

    const second = await boot();
    expect(second.get(r.id)).toMatchObject({ templateId: 'healthcare-educator', accent: '#0F766E', data: SAMPLE_RESUME });
    expect(second.getActiveId()).toBe(r.id);
  });

  it('process termination (simulated): committed writes survive without a clean close', async () => {
    const first = await boot();
    const r = first.create(emptyResume(), 'Before kill');
    first.update(r.id, { title: 'Saved by the background flush' });
    await first.flush();
    // Simulate the OS killing the process: no dispose, no close; a new connection opens the same file.
    const survivor = openTestDatabase(dir.file('app.db'));
    const reopened = await initializeDatabase(survivor, { newId: testId });
    expect((await reopened.resumes.get(r.id))?.title).toBe('Saved by the background flush');
    await survivor.close();
  });

  it('process termination (simulated): at most the last unflushed debounce window is lost', async () => {
    const first = await boot();
    const r = first.create(emptyResume(), 'Stored');
    await settle();
    first.update(r.id, { title: 'Typed less than 600 ms before the kill' });
    const survivor = openTestDatabase(dir.file('app.db'));
    const reopened = await initializeDatabase(survivor, { newId: testId });
    expect((await reopened.resumes.get(r.id))?.title).toBe('Stored');
    await survivor.close();
  });

  it('deleting a resume with a pending edit does not bring it back', async () => {
    const library = await boot();
    const r = library.create(emptyResume(), 'Temp');
    await settle();
    library.update(r.id, { title: 'Edited just before delete' });
    await library.remove(r.id);
    await timers.advance(10_000);
    await library.flush();
    expect(await app.resumes.get(r.id)).toBeNull();
    expect(library.get(r.id)).toBeNull();
  });

  it('deleting the active resume clears the selection', async () => {
    const library = await boot();
    const a = library.create(emptyResume(), 'A');
    library.create(emptyResume(), 'B');
    await library.setActive(a.id);
    await library.remove(a.id);
    expect(library.getActiveId()).toBeNull();
    expect(await app.resumes.getActiveId()).toBeNull();
  });
});

describe('export records are written after the access decision, never used for it', () => {
  // Ported from Step 2: the old runRecordedExport(…, access, …) took a caller-supplied
  // decision; the ExportService now asks EntitlementService itself (Step 3).
  const resumeRecord = { id: 'r1', title: 'T', templateId: 'tech-builder', accent: '#000000', data: emptyResume(), createdAt: 1, updatedAt: 1 };
  const NOW = 1_700_000_000_000;

  const exporter = (premium: boolean, platform: Partial<ExportPlatform>, records: unknown) => {
    const store = new FakeStoreProvider({ storeNow: () => NOW });
    if (premium) store.setSubscription('active', NOW + 86_400_000);
    const gate = new PremiumGate(new EntitlementService(store, new MemoryEntitlementCacheStore(), () => NOW));
    const full: ExportPlatform = {
      generatePdf: async () => ({ id: 'a1' }),
      generateDocx: async () => ({ id: 'a1' }),
      share: async () => undefined,
      discard: async () => undefined,
      ...platform,
    };
    return new ExportService(gate, full, records as never);
  };

  const recorder = () => {
    const added: unknown[] = [];
    return {
      added,
      repo: {
        add: async (record: unknown) => {
          added.push(record);
          return record as never;
        },
        listRecent: async () => {
          throw new Error('must not be read during export');
        },
        listForResume: async () => {
          throw new Error('must not be read during export');
        },
      },
    };
  };

  it('denied: throws before generating anything and records the denial', async () => {
    const { added, repo } = recorder();
    let generated = false;
    const service = exporter(false, { generatePdf: async () => ((generated = true), { id: 'x' }) }, repo);
    await expect(service.exportPdf(resumeRecord)).rejects.toBeInstanceOf(PremiumRequiredError);
    expect(generated).toBe(false);
    expect(added).toEqual([
      { resumeId: 'r1', templateId: 'tech-builder', exportType: 'pdf', outcome: 'denied', accessReason: 'not_premium', errorMessage: null },
    ]);
  });

  it('succeeded and failed outcomes are recorded; a broken recorder never changes the result', async () => {
    const { added, repo } = recorder();
    await exporter(true, {}, repo).exportDocx(resumeRecord);
    await expect(
      exporter(true, { generatePdf: async () => { throw new Error('printer crashed'); } }, repo).exportPdf(resumeRecord),
    ).rejects.toThrow('printer crashed');
    expect(added.map((r) => (r as { outcome: string }).outcome)).toEqual(['succeeded', 'failed']);
    expect((added[1] as { errorMessage: string }).errorMessage).toBe('Error: printer crashed');

    const broken = { ...repo, add: async () => Promise.reject(new Error('db locked')) };
    await expect(exporter(true, {}, broken).exportPdf(resumeRecord)).resolves.toBeUndefined();
  });
});

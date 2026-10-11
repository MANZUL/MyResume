import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  BACKUP_MAX_BYTES,
  BACKUP_MAX_RESUMES,
  BACKUP_VERSION,
  BackupError,
  backupFileName,
  buildBackup,
  parseBackup,
  serializeBackup,
  type BackupFile,
} from '../domain/backup/backup-format';
import { emptyResume, type ResumeData } from '../domain/resume/types';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import { TEMPLATES } from '../domain/templates/templates';
import { backupErrorText } from '../i18n/backup';
import { ar } from '../i18n/messages/ar';
import { de } from '../i18n/messages/de';
import { en } from '../i18n/messages/en';
import { es } from '../i18n/messages/es';
import { fr } from '../i18n/messages/fr';
import { createTranslator } from '../i18n/translate';
import { BackupService, type BackupFiles } from '../services/backup/backup-service';
import { LibraryBusyError, ResumeLibrary } from '../services/storage/resume-library';
import { SqliteBackupStore } from '../services/storage/sqlite/backup-store';
import { initializeDatabase, type AppDatabase } from '../services/storage/sqlite/database';
import { MIGRATIONS, SCHEMA_VERSION } from '../services/storage/sqlite/schema';
import type { SqlDatabase } from '../services/storage/sqlite/sql';
import { ARABIC_RESUME } from './fixtures/arabic-resume';
import { PHASE15_KEYS } from './fixtures/phase15-keys';
import { ManualTimers, openTestDatabase, tempDir, testId, type TestDatabase } from './helpers/node-sqlite';

// Phase 18: local backup and restore. Everything runs against a real SQLite engine (node:sqlite):
// the transactions, the rollback and the snapshots are the production SQL, not mocks.

const SRC = join(__dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');
const NOW = Date.UTC(2026, 9, 22, 12, 30, 0);

// --- fakes for the device side ---

class FakeFiles implements BackupFiles {
  written = new Map<string, { name: string; text: string }>();
  shared: string[] = [];
  discarded: string[] = [];
  failShare: Error | null = null;
  failWrite: Error | null = null;
  /** What the picker returns next. */
  next: Awaited<ReturnType<BackupFiles['pick']>> = { canceled: true };
  pickCalls = 0;
  pickError: Error | null = null;
  async writeTemp(name: string, text: string) {
    if (this.failWrite) throw this.failWrite;
    const uri = `mem://backups/${this.written.size + 1}/${name}`;
    this.written.set(uri, { name, text });
    return { uri };
  }
  async share(uri: string) {
    if (this.failShare) throw this.failShare;
    this.shared.push(uri);
  }
  discard(uri: string) {
    this.discarded.push(uri);
    this.written.delete(uri);
  }
  async pick() {
    this.pickCalls += 1;
    if (this.pickError) throw this.pickError;
    return this.next;
  }
  get lastText() {
    return [...this.written.values()].at(-1)!.text;
  }
}

/** Every table the restore may touch, as plain data (for "nothing changed" comparisons). */
async function dump(db: TestDatabase) {
  const q = (sql: string) => db.all<Record<string, unknown>>(sql);
  return JSON.stringify({
    resumes: await q('SELECT * FROM resumes ORDER BY id'),
    jobs: await q('SELECT * FROM target_jobs ORDER BY resume_id'),
    profile: await q('SELECT * FROM local_profile'),
    settings: await q('SELECT * FROM app_settings ORDER BY key'),
    exports: await q('SELECT * FROM export_records ORDER BY id'),
    version: await q('PRAGMA user_version'),
  });
}

const named = (name: string): ResumeData => ({ ...emptyResume(), name });

describe('backup and restore', () => {
  let dir: ReturnType<typeof tempDir>;
  let db: TestDatabase;
  let app: AppDatabase;
  let timers: ManualTimers;
  let library: ResumeLibrary;
  let files: FakeFiles;
  let service: BackupService;

  const build = (store: AppDatabase['backup'] = app.backup) =>
    new BackupService({ store, files, exclusive: (op, options) => library.runExclusive(op, options), now: () => NOW });

  beforeEach(async () => {
    dir = tempDir();
    db = openTestDatabase(dir.file('app.db'));
    app = await initializeDatabase(db, { newId: testId, now: () => NOW });
    timers = new ManualTimers();
    library = new ResumeLibrary(app.resumes, { newId: testId, timers, now: timers.now, delayMs: 600, maxWaitMs: 3000 });
    await library.load();
    files = new FakeFiles();
    service = build();
  });
  afterEach(async () => {
    library.dispose();
    await db.close();
    dir.cleanup();
  });

  /** A library with an Arabic resume, an English one, a job description, a profile and a language. */
  async function seed() {
    const a = library.create(ARABIC_RESUME, 'سيرة محمد', 'tech-builder', 'ar');
    library.update(a.id, { accent: '#12AB9F' });
    const b = library.create({ ...SAMPLE_RESUME, name: 'Zoë Müller' }, 'Zoë’s CV', 'creative-editorial', 'en');
    await library.flush();
    await library.setActive(b.id);
    await app.targetJobs.save({ resumeId: a.id, title: 'مهندس', company: '', description: 'Senior C++ engineer (مهندس برمجيات).', updatedAt: 42 });
    await app.profile.save({ name: 'محمد أحمد', email: 'm@example.com', phone: '+49 170 1234567', location: 'Berlin', headline: '', linkedin: '', website: '', updatedAt: 7 });
    await app.settings.setAppLanguage('ar');
    return { a, b };
  }

  // --- export ---

  it('creates a valid backup of a library: format, version, timestamp, every resume with its language, template, accent and content', async () => {
    const { a, b } = await seed();
    const result = await service.exportBackup();
    expect(result).toEqual({ resumes: 2, unreadable: 0 });
    const [file] = [...files.written.values()];
    expect(file.name).toBe('my-resume-backup-2026-10-22.json');
    const backup = parseBackup(file.text);
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: '2026-10-22T12:30:00.000Z' });
    const byId = new Map(backup.resumes.map((r) => [r.id, r]));
    expect(byId.get(a.id)).toMatchObject({ title: 'سيرة محمد', templateId: 'tech-builder', accent: '#12AB9F', language: 'ar', data: ARABIC_RESUME });
    expect(byId.get(b.id)).toMatchObject({ title: 'Zoë’s CV', templateId: 'creative-editorial', language: 'en' });
    expect(byId.get(b.id)!.data.name).toBe('Zoë Müller');
    expect(backup.currentResumeId).toBe(b.id);
    expect(files.shared).toHaveLength(1);
  });

  it('preserves Arabic, accented Latin and mixed text exactly, as readable UTF-8 (no escaping)', async () => {
    await seed();
    await service.exportBackup();
    const text = files.lastText;
    for (const piece of ['محمد أحمد', 'Zoë Müller', 'Zoë’s CV', 'Reduced latency by 35% using AWS Lambda.', 'Senior C++ engineer (مهندس برمجيات).', '+49 170 1234567']) {
      expect(text, piece).toContain(piece);
    }
    expect(text).not.toMatch(/\\u[0-9a-f]{4}/i);
    expect(parseBackup(text).resumes.find((r) => r.language === 'ar')!.data).toEqual(ARABIC_RESUME);
    // The bytes are UTF-8: Arabic letters take two bytes each.
    expect(Buffer.byteLength(text, 'utf8')).toBeGreaterThan(text.length);
  });

  it('includes the job description, the Local Profile and the app language; and says what it leaves out', async () => {
    const { a } = await seed();
    await service.exportBackup();
    const backup = parseBackup(files.lastText);
    expect(backup.resumes.find((r) => r.id === a.id)!.targetJob).toEqual({ title: 'مهندس', company: '', description: 'Senior C++ engineer (مهندس برمجيات).', updatedAt: 42 });
    expect(backup.profile).toMatchObject({ name: 'محمد أحمد', email: 'm@example.com', phone: '+49 170 1234567', updatedAt: 7 });
    expect(backup.settings).toEqual({ appLanguage: 'ar' });
    // Nothing else: no export history, internal columns, handles, entitlements or secrets.
    const keys = new Set<string>();
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          keys.add(k);
          walk(v);
        }
      }
    };
    walk(JSON.parse(files.lastText));
    for (const forbidden of ['is_active', 'data_json', 'template_id', 'export_records', 'access_reason', 'handle', 'entitlement', 'premium', 'token', 'secret', 'password', 'uri', 'path']) {
      expect(keys.has(forbidden), forbidden).toBe(false);
    }
    expect([...keys].sort()).toEqual(
      ['accent', 'appLanguage', 'awards', 'bullets', 'certifications', 'company', 'contact', 'createdAt', 'currentResumeId', 'data', 'date', 'degree', 'description', 'education', 'email', 'end', 'experience', 'format', 'headline', 'honors', 'id', 'language', 'linkedin', 'location', 'name', 'org', 'phone', 'profile', 'projects', 'resumes', 'school', 'settings', 'skills', 'start', 'summary', 'tagline', 'targetJob', 'templateId', 'title', 'updatedAt', 'version', 'website'].sort(),
    );
  });

  it('an empty library and an empty profile make a valid, empty backup (profile is null, no language)', async () => {
    await service.exportBackup();
    const backup = parseBackup(files.lastText);
    expect(backup.resumes).toEqual([]);
    expect(backup.profile).toBeNull();
    expect(backup.settings.appLanguage).toBeNull();
    expect(backup.currentResumeId).toBeNull();
  });

  it('the file name is my-resume-backup-YYYY-MM-DD.json', () => {
    expect(backupFileName(NOW)).toBe('my-resume-backup-2026-10-22.json');
    expect(backupFileName(Date.UTC(2027, 0, 5, 23, 59))).toBe('my-resume-backup-2027-01-05.json');
  });

  it('pending edits that are not saved yet are in the backup (they are written first)', async () => {
    const resume = library.create(named('Before'), 'T');
    await library.flush();
    library.update(resume.id, { data: named('Typed a moment ago') }); // debounced: not written yet
    expect(library.hasPendingChanges()).toBe(true);
    await service.exportBackup();
    expect(parseBackup(files.lastText).resumes[0].data.name).toBe('Typed a moment ago');
  });

  it('the export reads one consistent snapshot, and the library is paused while it does', async () => {
    const resume = library.create(named('One'), 'T');
    await library.flush();
    let sawBusy = false;
    const spy: AppDatabase['backup'] = {
      replaceAll: (b) => app.backup.replaceAll(b),
      snapshot: async () => {
        sawBusy = library.getStatus().busy;
        library.update(resume.id, { data: named('Edit during snapshot') }); // refused while paused
        return app.backup.snapshot();
      },
    };
    await build(spy).exportBackup();
    expect(sawBusy).toBe(true);
    expect(library.getStatus().busy).toBe(false);
    expect(parseBackup(files.lastText).resumes[0].data.name).toBe('One');
    expect(library.get(resume.id)!.data.name).toBe('One');
  });

  it('corrupted rows are counted, not silently written or silently hidden', async () => {
    library.create(named('Good'), 'Good');
    await library.flush();
    await db.run(`INSERT INTO resumes (id, title, template_id, accent, language, data_json, is_active, created_at, updated_at) VALUES ('bad', 'x', 'tech-builder', '#111111', 'en', '{not json', 0, 1, 1)`);
    const result = await service.exportBackup();
    expect(result).toEqual({ resumes: 1, unreadable: 1 });
    expect(parseBackup(files.lastText).resumes.map((r) => r.data.name)).toEqual(['Good']);
  });

  it('a backup that its own validator would refuse is never handed out', async () => {
    library.create({ ...emptyResume(), name: 'x'.repeat(250_000) }, 'Huge field');
    await library.flush();
    await expect(service.exportBackup()).rejects.toMatchObject({ code: 'write-failed' });
    expect(files.written.size).toBe(0);
    expect(files.shared).toEqual([]);
  });

  it('a failed share removes the temporary file; a failed write reports it; nothing is left behind', async () => {
    await seed();
    files.failShare = new Error('share sheet unavailable');
    await expect(service.exportBackup()).rejects.toMatchObject({ code: 'write-failed' });
    expect(files.written.size).toBe(0);
    expect(files.discarded).toHaveLength(1);
    files.failShare = null;
    files.failWrite = new Error('disk full');
    await expect(service.exportBackup()).rejects.toMatchObject({ code: 'write-failed' });
    expect(files.written.size).toBe(0);
    // A successful export keeps the file for the share sheet; the next launch removes it.
    files.failWrite = null;
    await service.exportBackup();
    expect(files.written.size).toBe(1);
    expect(read('app/_layout.tsx')).toMatch(/purgeBackupFiles\(\);/);
  });

  // --- restore: validation (pure) ---

  const valid = async (): Promise<BackupFile> => {
    await seed();
    await service.exportBackup();
    return JSON.parse(files.lastText) as BackupFile;
  };
  const refuse = (value: unknown, code: BackupError['code'] = 'invalid') => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    let thrown: unknown;
    try {
      parseBackup(text);
    } catch (error) {
      thrown = error;
    }
    expect(thrown, text.slice(0, 80)).toBeInstanceOf(BackupError);
    expect((thrown as BackupError).code).toBe(code);
    return thrown as BackupError;
  };

  it('refuses text that is not JSON, and JSON that is not an object', async () => {
    refuse('');
    refuse('not json at all');
    refuse('{"format": "my-resume-backup", ');
    refuse('[]');
    refuse('null');
    refuse('"my-resume-backup"');
    refuse('42');
  });

  it('refuses another format, and a missing, non-integer or non-positive version', async () => {
    const base = await valid();
    refuse({ ...base, format: 'something-else' });
    refuse({ ...base, format: undefined });
    for (const version of [undefined, '1', 1.5, 0, -1, null, true]) refuse({ ...base, version });
  });

  it('refuses an unknown FUTURE version as unsupported, before looking at anything else, and changes nothing', async () => {
    const before = await dump(db);
    refuse({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1, resumes: 'anything' }, 'unsupported-version');
    refuse({ format: BACKUP_FORMAT, version: 99 }, 'unsupported-version');
    files.next = { canceled: false, text: JSON.stringify({ format: BACKUP_FORMAT, version: 2 }) };
    await expect(service.chooseBackup(0)).rejects.toMatchObject({ code: 'unsupported-version' });
    expect(await dump(db)).toBe(before);
  });

  it('refuses missing required fields, at the top level, in every resume and in the resume content', async () => {
    const base = await valid();
    for (const field of ['createdAt', 'resumes']) refuse({ ...base, [field]: undefined });
    for (const field of ['id', 'title', 'templateId', 'accent', 'language', 'createdAt', 'updatedAt', 'data']) {
      const resumes = structuredClone(base.resumes);
      delete (resumes[0] as unknown as Record<string, unknown>)[field];
      refuse({ ...base, resumes });
    }
    for (const field of ['name', 'contact', 'summary', 'experience', 'education', 'certifications', 'projects', 'awards']) {
      const resumes = structuredClone(base.resumes);
      delete (resumes[0].data as unknown as Record<string, unknown>)[field];
      refuse({ ...base, resumes });
    }
    for (const [path, mutate] of [
      ['contact.email', (d: ResumeData) => void delete (d.contact as Partial<ResumeData['contact']>).email],
      ['summary.skills', (d: ResumeData) => void delete (d.summary as Partial<ResumeData['summary']>).skills],
      ['experience[0].bullets', (d: ResumeData) => void delete (d.experience[0] as Partial<ResumeData['experience'][number]>).bullets],
      ['education[0].school', (d: ResumeData) => void delete (d.education[0] as Partial<ResumeData['education'][number]>).school],
    ] as const) {
      const resumes = structuredClone(base.resumes);
      mutate(resumes.find((r) => r.language === 'ar')!.data);
      refuse({ ...base, resumes });
      void path;
    }
  });

  it('refuses wrong types (numbers for text, text for lists, objects for strings) anywhere in a resume', async () => {
    const base = await valid();
    const mutations: ((r: BackupFile['resumes'][number]) => void)[] = [
      (r) => void (r.title = 5 as unknown as string),
      (r) => void (r.data.name = null as unknown as string),
      (r) => void (r.data.summary.bullets = 'one bullet' as unknown as string[]),
      (r) => void (r.data.summary.bullets = [1, 2] as unknown as string[]),
      (r) => void (r.data.experience = {} as unknown as []),
      (r) => void (r.data.awards = [{}] as unknown as string[]),
      (r) => void (r.createdAt = '2020' as unknown as number),
      (r) => void (r.updatedAt = -1),
      (r) => void (r.updatedAt = 1.5),
      (r) => void (r.updatedAt = Number.MAX_SAFE_INTEGER + 2),
      (r) => void (r.data = [] as unknown as ResumeData),
    ];
    for (const mutate of mutations) {
      const resumes = structuredClone(base.resumes);
      mutate(resumes[0]);
      refuse({ ...base, resumes });
    }
    refuse({ ...base, resumes: {} });
    refuse({ ...base, resumes: [null] });
    refuse({ ...base, settings: 'ar' });
    refuse({ ...base, profile: 'x' });
    refuse({ ...base, createdAt: 'yesterday' });
  });

  it('refuses a template id the app does not have (never replaced by a default), and accepts every real one', async () => {
    const base = await valid();
    for (const templateId of ['nope', '', 'Tech-Builder', 'tech-builder ', 7]) {
      const resumes = structuredClone(base.resumes);
      (resumes[0] as unknown as Record<string, unknown>).templateId = templateId;
      expect(refuse({ ...base, resumes }).detail).toBe('resumes[0].templateId');
    }
    for (const template of TEMPLATES) {
      const resumes = structuredClone(base.resumes);
      resumes[0].templateId = template.id;
      expect(parseBackup(JSON.stringify({ ...base, resumes })).resumes[0].templateId).toBe(template.id);
    }
  });

  it('refuses a language that is not one of the five (and accepts all five)', async () => {
    const base = await valid();
    for (const language of ['xx', 'EN', 'en-US', '', 'zh', null, 1]) {
      const resumes = structuredClone(base.resumes);
      (resumes[0] as unknown as Record<string, unknown>).language = language;
      expect(refuse({ ...base, resumes }).detail).toBe('resumes[0].language');
    }
    for (const language of ['en', 'de', 'fr', 'es', 'ar'] as const) {
      const resumes = structuredClone(base.resumes);
      resumes[0].language = language;
      expect(parseBackup(JSON.stringify({ ...base, resumes })).resumes[0].language).toBe(language);
    }
    refuse({ ...base, settings: { appLanguage: 'xx' } });
  });

  it('refuses accent colors that are not exactly six hex digits with "#" (the same rule as the editor)', async () => {
    const base = await valid();
    for (const accent of ['#abc', 'A85432', 'red', '#12345G', '#1234567', '', '#12 456', 'rgb(0,0,0)', null]) {
      const resumes = structuredClone(base.resumes);
      (resumes[0] as unknown as Record<string, unknown>).accent = accent;
      expect(refuse({ ...base, resumes }).detail).toBe('resumes[0].accent');
    }
    const resumes = structuredClone(base.resumes);
    resumes[0].accent = '#a85432';
    expect(parseBackup(JSON.stringify({ ...base, resumes })).resumes[0].accent).toBe('#a85432');
  });

  it('refuses duplicate resume ids, a current-resume id that is not in the file, and an empty id', async () => {
    const base = await valid();
    const resumes = structuredClone(base.resumes);
    resumes[1].id = resumes[0].id;
    expect(refuse({ ...base, resumes }).detail).toBe('resumes[1].id');
    refuse({ ...base, currentResumeId: 'not-in-this-file' });
    refuse({ ...base, currentResumeId: 5 });
    const empty = structuredClone(base.resumes);
    empty[0].id = '';
    refuse({ ...base, resumes: empty });
    expect(parseBackup(JSON.stringify({ ...base, currentResumeId: null })).currentResumeId).toBeNull();
  });

  it('refuses a job description over its limit, and too many resumes', async () => {
    const base = await valid();
    const resumes = structuredClone(base.resumes);
    resumes[0].targetJob = { title: '', company: '', description: 'x'.repeat(25_001), updatedAt: 1 };
    refuse({ ...base, resumes });
    const many = Array.from({ length: BACKUP_MAX_RESUMES + 1 }, (_, i) => ({ ...base.resumes[0], id: `r${i}` }));
    refuse({ ...base, currentResumeId: null, resumes: many });
  });

  it('the size limit is 20 MiB: larger text is refused as too large before it is parsed; the picker refuses large files before reading', async () => {
    expect(BACKUP_MAX_BYTES).toBe(20 * 1024 * 1024);
    refuse('x'.repeat(BACKUP_MAX_BYTES + 1), 'too-large');
    files.next = { canceled: false, tooLarge: true };
    await expect(service.chooseBackup(0)).rejects.toMatchObject({ code: 'too-large' });
    const adapter = read('services/backup/expo-backup-files.ts');
    expect(adapter).toMatch(/if \(file\.size > maxBytes\) return \{ canceled: false, tooLarge: true \};\n\s+return \{ canceled: false, text: await file\.text\(\) \};/);
  });

  it('a file name or type proves nothing: only the content is checked', async () => {
    files.next = { canceled: false, text: '{"format":"my-resume-backup","version":1}' };
    await expect(service.chooseBackup(0)).rejects.toMatchObject({ code: 'invalid' });
    files.next = { canceled: false, text: '<html>my-resume-backup-2026-10-22.json</html>' };
    await expect(service.chooseBackup(0)).rejects.toMatchObject({ code: 'invalid' });
    files.pickError = new Error('picker failed');
    await expect(service.chooseBackup(0)).rejects.toMatchObject({ code: 'read-failed' });
  });

  it('compatibility policy: unknown extra fields are ignored (not restored); a BOM is tolerated; optional parts may be missing', async () => {
    const base = await valid();
    const withExtras = { ...base, futureField: { x: 1 }, resumes: base.resumes.map((r) => ({ ...r, color: 'blue', data: { ...r.data, extra: 1 } })) };
    const parsed = parseBackup(JSON.stringify(withExtras));
    expect(JSON.stringify(parsed)).not.toContain('futureField');
    expect(JSON.stringify(parsed)).not.toContain('"color"');
    expect(parsed.resumes.map((r) => r.data)).toEqual(base.resumes.map((r) => r.data));
    expect(parseBackup(`﻿${JSON.stringify(base)}`).resumes).toHaveLength(2);
    const minimal = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, createdAt: base.createdAt, resumes: [] }));
    expect(minimal).toMatchObject({ settings: { appLanguage: null }, profile: null, currentResumeId: null, resumes: [] });
  });

  it('validation errors name the field, never its content', async () => {
    const base = await valid();
    const resumes = structuredClone(base.resumes);
    resumes[0].data.name = 12345 as unknown as string;
    resumes[0].data.contact.email = 'private-address@example.com';
    resumes[0].accent = 'SECRET-COLOR';
    const error = refuse({ ...base, resumes });
    expect(error.message).not.toMatch(/private-address|SECRET|12345/);
    expect(error.detail).toBe('resumes[0].accent');
  });

  // --- restore: behavior ---

  async function pickText(text: string) {
    files.next = { canceled: false, text };
  }

  it('choosing a file changes NOTHING: it only checks the file and reports the counts for the confirmation', async () => {
    await seed();
    await service.exportBackup();
    const text = files.lastText;
    library.create(named('Another'), 'Another');
    await library.flush();
    const before = await dump(db);
    await pickText(text);
    const pending = await service.chooseBackup(library.getAll().length);
    expect(pending).toMatchObject({ incoming: 2, current: 3 });
    expect(await dump(db)).toBe(before);
    expect(library.getAll()).toHaveLength(3);
  });

  it('the screen asks for confirmation (with both counts) before restore, and only the confirm button restores', () => {
    const screen = read('features/backup/BackupScreen.tsx');
    const alertAt = screen.indexOf('Alert.alert(');
    const restoreAt = screen.indexOf('backup.restore(pending)');
    expect(alertAt).toBeGreaterThan(0);
    expect(restoreAt).toBeGreaterThan(alertAt);
    expect(screen).toMatch(/t\('backup\.confirmCurrent', \{ count: pending\.current \}\)/);
    expect(screen).toMatch(/t\('backup\.confirmIncoming', \{ count: pending\.incoming \}\)/);
    expect(screen).toMatch(/style: 'cancel', onPress: \(\) => setPhase\('idle'\)/);
    expect(screen).toMatch(/style: 'destructive'/);
    expect(screen).toMatch(/onDismiss: \(\) => setPhase\('idle'\)/);
    expect(screen.match(/backup\.restore\(/g)).toHaveLength(1); // one call, inside the confirm button
  });

  it('cancelling the picker is not an error: nothing happens and nothing is said', async () => {
    await seed();
    const before = await dump(db);
    files.next = { canceled: true };
    expect(await service.chooseBackup(2)).toBeNull();
    expect(await dump(db)).toBe(before);
    expect(read('features/backup/BackupScreen.tsx')).toMatch(/if \(!pending\) \{\n\s+setPhase\('idle'\); \/\/ the picker was closed: nothing happens, nothing is said\n\s+return;/);
  });

  it('restores everything exactly: resumes, content, language, template, accent, job description, profile, language, current resume', async () => {
    const { a, b } = await seed();
    await service.exportBackup();
    const text = files.lastText;
    const original = { a: structuredClone(library.get(a.id)!), b: structuredClone(library.get(b.id)!) };
    // Change everything afterwards.
    library.update(a.id, { data: named('Changed'), accent: '#000000', language: 'de' });
    library.create(named('Extra'), 'Extra');
    await library.flush();
    await app.profile.save({ name: 'Someone else', email: '', phone: '', location: '', headline: '', linkedin: '', website: '', updatedAt: 99 });
    await app.targetJobs.save({ resumeId: a.id, title: '', company: '', description: 'other', updatedAt: 1 });
    await app.settings.setAppLanguage('fr');

    await pickText(text);
    const pending = (await service.chooseBackup(library.getAll().length))!;
    const result = await service.restore(pending);
    expect(result).toEqual({ resumes: 2, appLanguage: 'ar' });

    const stored = await app.resumes.list();
    expect(stored.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    expect(stored.find((r) => r.id === a.id)).toEqual(original.a);
    expect(stored.find((r) => r.id === b.id)).toEqual(original.b);
    expect(await app.resumes.getActiveId()).toBe(b.id);
    expect(await app.targetJobs.get(a.id)).toMatchObject({ description: 'Senior C++ engineer (مهندس برمجيات).', title: 'مهندس', updatedAt: 42 });
    expect(await app.profile.get()).toMatchObject({ name: 'محمد أحمد', email: 'm@example.com', updatedAt: 7 });
    expect(await app.settings.getAppLanguage()).toBe('ar');
    // The library in memory is exactly what is stored, and no edit is pending.
    expect(library.getAll().map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    expect(library.getActiveId()).toBe(b.id);
    expect(library.getStatus()).toEqual({ loadFailed: false, saveFailed: false, deleteFailed: null, busy: false });
    expect(library.hasPendingChanges()).toBe(false);
    // The schema and its migration history are untouched.
    expect((await db.get<{ user_version: number }>('PRAGMA user_version'))!.user_version).toBe(SCHEMA_VERSION);
  });

  it('REPLACE ALL: resumes that are not in the backup are gone, with their job descriptions; an empty backup empties the library', async () => {
    const empty = serializeBackup(buildBackup({ resumes: [], currentResumeId: null, profile: null, appLanguage: null, unreadable: 0 }, NOW));
    const { a } = await seed();
    await pickText(empty);
    const pending = (await service.chooseBackup(2))!;
    expect(pending).toMatchObject({ incoming: 0, current: 2 });
    await service.restore(pending);
    expect(await app.resumes.list()).toEqual([]);
    expect(await app.targetJobs.get(a.id)).toBeNull();
    expect(await db.all('SELECT * FROM target_jobs')).toEqual([]);
    expect(library.getAll()).toEqual([]);
    expect(library.getActiveId()).toBeNull();
    // The profile is replaced by the backup's (none); the app language is kept when the backup has none.
    expect((await app.profile.get()).name).toBe('');
    expect(await app.settings.getAppLanguage()).toBe('ar');
  });

  it('duplicate ids between the device and the backup are safe: the backup version replaces the local one, no conflict', async () => {
    const mine = library.create(named('Local version'), 'Local');
    await library.flush();
    const backup = buildBackup(
      {
        resumes: [{ id: mine.id, title: 'From backup', templateId: 'tech-builder', accent: '#111111', language: 'en', createdAt: 1, updatedAt: 2, data: named('Backup version'), targetJob: null }],
        currentResumeId: mine.id,
        profile: null,
        appLanguage: null,
        unreadable: 0,
      },
      NOW,
    );
    await pickText(serializeBackup(backup));
    await service.restore((await service.chooseBackup(1))!);
    const stored = await app.resumes.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: mine.id, title: 'From backup', data: named('Backup version') });
    expect(library.get(mine.id)!.title).toBe('From backup');
  });

  it('the current resume stays valid: the backup\'s current one is current; none in the backup means none now', async () => {
    const { a } = await seed();
    await library.setActive(a.id);
    await service.exportBackup();
    const withCurrent = files.lastText;
    await library.setActive(null);
    await pickText(withCurrent);
    await service.restore((await service.chooseBackup(2))!);
    expect(library.getActiveId()).toBe(a.id);
    expect(library.get(library.getActiveId() ?? undefined)).not.toBeNull();
    // A backup without a current resume clears the pointer (it never points at a missing resume).
    const without = JSON.parse(withCurrent) as BackupFile;
    without.currentResumeId = null;
    await pickText(JSON.stringify(without));
    await service.restore((await service.chooseBackup(2))!);
    expect(library.getActiveId()).toBeNull();
    expect(await app.resumes.getActiveId()).toBeNull();
    const rows = await db.all<{ n: number }>('SELECT COUNT(*) AS n FROM resumes WHERE is_active = 1');
    expect(rows[0].n).toBe(0);
  });

  it('the export history is kept (its links to deleted resumes are cleared); nothing else outside the backup is touched', async () => {
    const { a } = await seed();
    await app.exportRecords.add({ resumeId: a.id, templateId: 'tech-builder', exportType: 'pdf', outcome: 'succeeded', accessReason: 'free', errorMessage: null });
    await service.exportBackup();
    await pickText(files.lastText);
    // Restore an empty library: the resume the record pointed to is gone.
    await pickText(serializeBackup(buildBackup({ resumes: [], currentResumeId: null, profile: null, appLanguage: null, unreadable: 0 }, NOW)));
    await service.restore((await service.chooseBackup(2))!);
    const records = await db.all<{ resume_id: string | null }>('SELECT resume_id FROM export_records');
    expect(records).toHaveLength(1);
    expect(records[0].resume_id).toBeNull();
  });

  // --- atomicity ---

  /** A database whose transactions fail at the nth write statement. */
  function failingAt(n: number, counter = { runs: 0 }): SqlDatabase {
    return {
      ...db,
      transaction: (fn) =>
        db.transaction((tx) => {
          let runs = 0;
          return fn({
            ...tx,
            run: async (sql, params) => {
              runs += 1;
              counter.runs = Math.max(counter.runs, runs);
              if (runs === n) throw new Error(`injected failure at statement ${n}`);
              return tx.run(sql, params);
            },
          });
        }),
      close: () => db.close(),
    };
  }
  const storeOn = (database: SqlDatabase) => {
    // A second repository set on the failing wrapper: the production SQL, a failing connection.
    return new SqliteBackupStore(database, () => NOW);
  };

  it('ROLLBACK: a database failure at ANY statement of the restore leaves every table exactly as it was', async () => {
    const { a } = await seed();
    await app.exportRecords.add({ resumeId: a.id, templateId: 'tech-builder', exportType: 'pdf', outcome: 'succeeded', accessReason: 'free', errorMessage: null });
    await service.exportBackup();
    const text = files.lastText;
    library.update(a.id, { data: named('Current work') });
    await library.flush();
    const before = await dump(db);
    const counter = { runs: 0 };
    // A dry run counts the statements (a restore of this backup, onto a copy that is rolled back by the failure at the very end).
    const total = (() => {
      const parsed = parseBackup(text);
      return 3 + parsed.resumes.length + parsed.resumes.filter((r) => r.targetJob).length + 1 + 1 + 1;
    })();
    expect(total).toBeGreaterThan(8);
    for (let n = 1; n <= total; n += 1) {
      const failing = build(storeOn(failingAt(n, counter)));
      await pickText(text);
      const pending = (await failing.chooseBackup(library.getAll().length))!;
      await expect(failing.restore(pending), `statement ${n}`).rejects.toMatchObject({ code: 'database' });
      expect(await dump(db), `after failure at statement ${n}`).toBe(before);
    }
    expect(counter.runs).toBeGreaterThanOrEqual(total - 1);
    // The library never left its state, edits work again, and a restore that does not fail succeeds.
    expect(library.getStatus().busy).toBe(false);
    expect(library.get(a.id)!.data.name).toBe('Current work');
    library.update(a.id, { data: named('Still editable') });
    await library.flush();
    expect(await app.resumes.get(a.id)).toMatchObject({ data: named('Still editable') });
    await pickText(text);
    await service.restore((await service.chooseBackup(2))!);
    expect((await app.resumes.get(a.id))!.data).toEqual(ARABIC_RESUME);
  });

  it('a failed restore says so in the user\'s language and nothing changed (error code "database")', async () => {
    await seed();
    await service.exportBackup();
    const text = files.lastText;
    const before = await dump(db);
    const failing = build(storeOn(failingAt(4)));
    await pickText(text);
    const error = await failing.restore((await failing.chooseBackup(2))!).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackupError);
    expect(backupErrorText(createTranslator('en').t, error, 'restore')).toBe('The backup could not be restored. Your current resumes were not changed.');
    expect(await dump(db)).toBe(before);
  });

  // --- autosave and concurrency ---

  it('pending autosaves are written BEFORE the destructive restore starts (and then replaced by it)', async () => {
    const { a } = await seed();
    await service.exportBackup();
    const text = files.lastText;
    library.update(a.id, { data: named('Unsaved typing') });
    expect(library.hasPendingChanges(a.id)).toBe(true);
    const order: string[] = [];
    const spy: AppDatabase['backup'] = {
      snapshot: () => app.backup.snapshot(),
      replaceAll: async (backup) => {
        // At this point the pending edit has already reached the database.
        order.push(`db has: ${(await app.resumes.get(a.id))!.data.name}`);
        await app.backup.replaceAll(backup);
      },
    };
    await pickText(text);
    const svc = build(spy);
    await svc.restore((await svc.chooseBackup(2))!);
    expect(order).toEqual(['db has: Unsaved typing']);
    expect((await app.resumes.get(a.id))!.data).toEqual(ARABIC_RESUME);
    expect(library.hasPendingChanges()).toBe(false);
  });

  it('if pending edits cannot be saved, the restore does not start and nothing is lost', async () => {
    const { a } = await seed();
    await service.exportBackup();
    const text = files.lastText;
    const failingRepo = {
      ...app.resumes,
      list: () => app.resumes.list(),
      get: (id: string) => app.resumes.get(id),
      create: (r: Parameters<typeof app.resumes.create>[0]) => app.resumes.create(r),
      delete: (id: string) => app.resumes.delete(id),
      getActiveId: () => app.resumes.getActiveId(),
      setActive: (id: string | null) => app.resumes.setActive(id),
      save: async () => {
        throw new Error('disk full');
      },
    };
    const lib2 = new ResumeLibrary(failingRepo, { newId: testId, timers, now: timers.now });
    await lib2.load();
    lib2.update(a.id, { data: named('Cannot be saved') });
    const before = await dump(db);
    const svc = new BackupService({ store: app.backup, files, exclusive: (op, options) => lib2.runExclusive(op, options), now: () => NOW });
    await pickText(text);
    await expect(svc.restore((await svc.chooseBackup(2))!)).rejects.toMatchObject({ code: 'unsaved-changes' });
    expect(await dump(db)).toBe(before); // untouched
    expect(lib2.get(a.id)!.data.name).toBe('Cannot be saved'); // the unsaved edit is still there
    expect(lib2.getStatus().busy).toBe(false);
    lib2.dispose();
  });

  it('no save, delete, create or second restore can run underneath a restore: edits are refused while it runs, then work again', async () => {
    const { a } = await seed();
    await service.exportBackup();
    const text = files.lastText;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const observed: Record<string, unknown> = {};
    const slow: AppDatabase['backup'] = {
      snapshot: () => app.backup.snapshot(),
      replaceAll: async (backup) => {
        observed.busy = library.getStatus().busy;
        library.update(a.id, { data: named('Edit during restore') });
        observed.duplicate = library.duplicate(a.id);
        observed.removed = await library.remove(a.id);
        try {
          library.create(named('Create during restore'), 'x');
        } catch (error) {
          observed.createError = error instanceof LibraryBusyError;
        }
        observed.second = await build(slow).restore({ backup, incoming: 0, current: 0 }).catch((error: BackupError) => error.code);
        await gate;
        await app.backup.replaceAll(backup);
      },
    };
    await pickText(text);
    const svc = build(slow);
    const running = svc.restore((await svc.chooseBackup(2))!);
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    await running;
    expect(observed).toEqual({ busy: true, duplicate: null, removed: false, createError: true, second: 'busy' });
    expect((await app.resumes.get(a.id))!.data).toEqual(ARABIC_RESUME); // the refused edit never happened
    expect(library.getStatus().busy).toBe(false);
    library.update(a.id, { data: named('After the restore') });
    await library.flush();
    expect((await app.resumes.get(a.id))!.data.name).toBe('After the restore');
  });

  it('while a restore runs, the whole screen is covered and touches are caught', () => {
    const layout = read('app/_layout.tsx');
    expect(layout).toMatch(/<BusyOverlay \/>/);
    expect(read('ui/StorageStatus.tsx')).toMatch(/if \(!status\.busy\) return null;/);
    expect(read('ui/StorageStatus.tsx')).toMatch(/accessibilityViewIsModal/);
  });

  // --- privacy, security, scope ---

  it('makes no network calls, logs nothing, and the files hold no secrets', () => {
    for (const file of ['domain/backup/backup-format.ts', 'services/backup/backup-service.ts', 'services/backup/expo-backup-files.ts', 'services/backup/use-backup-service.ts', 'services/storage/sqlite/backup-store.ts', 'features/backup/BackupScreen.tsx', 'i18n/backup.ts']) {
      const source = read(file).replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
      expect(source, file).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|https?:\/\/|console\./);
    }
    expect(read('services/backup/expo-backup-files.ts')).not.toMatch(/uploadAsync|createUploadTask|downloadFileAsync/);
  });

  it('the picker and the writer: a fresh private folder, no overwrite, UTF-8 JSON through the system share sheet and file picker', () => {
    const adapter = read('services/backup/expo-backup-files.ts');
    expect(adapter).toMatch(/new Directory\(Paths\.cache, 'backups'\)/);
    expect(adapter).toMatch(/new Directory\(backupsDir\(\), newId\(\)\)/);
    expect(adapter).toMatch(/file\.create\(\{ overwrite: false \}\)/);
    expect(adapter).toMatch(/File\.pickFileAsync\(/);
    expect(adapter).toMatch(/Sharing\.shareAsync\(uri, \{ mimeType: 'application\/json'/);
  });

  it('the screen tells the user the file is not encrypted and that they decide where it goes; nothing claims security', () => {
    for (const catalog of [en, de, fr, es, ar]) {
      expect(catalog.backup.privacy.length).toBeGreaterThan(40);
      expect(catalog.backup.intro.length).toBeGreaterThan(40);
    }
    expect(en.backup.privacy).toMatch(/not encrypted/);
    expect(en.backup.intro).toMatch(/Nothing is uploaded/);
    expect(de.backup.privacy).toMatch(/nicht verschlüsselt/);
    expect(fr.backup.privacy).toMatch(/pas chiffrée/);
    expect(es.backup.privacy).toMatch(/no está cifrada/);
    expect(ar.backup.privacy).toMatch(/غير مشفّرة/);
    for (const catalog of [en, de, fr, es, ar]) expect(JSON.stringify(catalog.backup)).not.toMatch(/\b(secure|safe|sicher|sûr|seguro)\b|آمن/i);
  });

  it('no schema or migration change: still four migrations at version 4, and the backup adds no table or column', async () => {
    expect(SCHEMA_VERSION).toBe(4);
    expect(MIGRATIONS.map((m) => m.version)).toEqual([1, 2, 3, 4]);
    expect(read('services/storage/sqlite/backup-store.ts')).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/);
    const tables = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map((t) => t.name);
    expect(tables).toEqual(['app_settings', 'export_records', 'local_profile', 'resumes', 'target_jobs']);
  });

  // --- localization ---

  const KEYS = [...PHASE15_KEYS].filter((key) => key === 'nav.backup' || key.startsWith('backup.'));
  const get = (catalog: unknown, key: string) => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], catalog) as string;
  const params = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it('25 backup keys exist in all five languages with the same parameters; none is empty or an English copy', () => {
    expect(KEYS).toHaveLength(25);
    for (const [language, catalog] of Object.entries({ en, de, fr, es, ar })) {
      for (const key of KEYS) {
        const value = get(catalog, key);
        expect(value?.trim(), `${language} ${key}`).toBeTruthy();
        expect(params(value), `${language} ${key}`).toEqual(params(get(en, key)));
        if (language !== 'en') expect(value, `${language} ${key}`).not.toBe(get(en, key));
      }
    }
    expect(params(en.backup.confirmCurrent)).toEqual(['count']);
    expect(params(en.backup.errors.tooLarge)).toEqual(['max']);
  });

  it('every error code maps to a message in the app language, and the size limit is shown as 20 MB', () => {
    const t = createTranslator('en').t;
    const cases: [BackupError['code'], string][] = [
      ['invalid', 'This file is not a valid My Resume backup. Nothing was changed.'],
      ['unsupported-version', 'This backup was made by a newer version of My Resume. Update the app to restore it. Nothing was changed.'],
      ['too-large', 'This file is too large to be a backup (the limit is 20 MB). Nothing was changed.'],
      ['read-failed', 'The file could not be read. Nothing was changed.'],
      ['unsaved-changes', 'Your latest changes could not be saved yet, so nothing was restored. Retry saving first.'],
      ['busy', 'Another operation is still running. Please try again in a moment.'],
      ['database', 'The backup could not be restored. Your current resumes were not changed.'],
    ];
    for (const [code, text] of cases) expect(backupErrorText(t, new BackupError(code), 'restore')).toBe(text);
    expect(backupErrorText(t, new BackupError('write-failed'), 'export')).toBe('The backup could not be created. Please try again.');
    expect(backupErrorText(t, new Error('anything'), 'export')).toBe('The backup could not be created. Please try again.');
    expect(backupErrorText(createTranslator('ar').t, new BackupError('unsupported-version'), 'restore')).toBe(ar.backup.errors.unsupportedVersion);
    expect(backupErrorText(createTranslator('de').t, new BackupError('too-large'), 'restore')).toContain('20');
  });

  it('is reachable from Home, has its own route, and the route is a thin re-export', () => {
    expect(read('features/library/HomeScreen.tsx')).toMatch(/router\.push\('\/backup'\)/);
    expect(read('app/backup.tsx').trim()).toBe("export { default } from '../features/backup/BackupScreen';");
    expect(read('app/_layout.tsx')).toMatch(/<Stack\.Screen name="backup" options=\{\{ title: t\('nav\.backup'\) \}\} \/>/);
  });

  it('restoring the language applies it the normal way (so a direction change gets the restart notice)', () => {
    expect(read('features/backup/BackupScreen.tsx')).toMatch(/if \(result\.appLanguage && result\.appLanguage !== appLanguage\) await setAppLanguage\(result\.appLanguage\);/);
  });
});

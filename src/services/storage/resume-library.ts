import type { ResumeRepository } from '../../domain/ports/repositories';
import type { ResumeData, StoredResume } from '../../domain/resume/types';
import { toLanguage, type Language } from '../../domain/i18n/languages';
import { getTemplate, TEMPLATES } from '../../domain/templates/templates';
import { createAutosaver, type Autosaver, type Timers } from './autosave';

// In-memory view of the resume library backed by a ResumeRepository.
// Screens read and edit this synchronously; persistence happens through the
// autosaver (debounced edits) or immediately (create, duplicate, delete).
// No React imports, so it is tested directly against SQLite.

export type ResumePatch = Partial<Pick<StoredResume, 'title' | 'templateId' | 'accent' | 'language' | 'data'>>;

export interface ResumeLibraryOptions {
  newId: () => string;
  now?: () => number;
  timers?: Timers;
  delayMs?: number;
  maxWaitMs?: number;
  onError?: (operation: string, error: unknown) => void;
  /**
   * Language of new resumes when none is given: the app language at the moment of
   * creation (read on every create). Existing resumes never follow later changes.
   */
  defaultLanguage?: () => Language;
  /** Stored default titles, in the app language. */
  titles?: { untitled: () => string; copyOf: (title: string) => string };
}

/**
 * What the user must be told about storage. Nothing here is ever "fixed" silently: a failed
 * write keeps its value in memory (and in the autosaver) until a write succeeds.
 */
export interface LibraryStatus {
  /** The saved resumes could not be read: the list on screen is NOT the user's real library. */
  loadFailed: boolean;
  /** At least one resume has changes that are not stored yet because a write failed. */
  saveFailed: boolean;
  /** The last delete that failed: the resume is back in the list and still stored. */
  deleteFailed: { id: string; title: string } | null;
}

const ENGLISH_TITLES = { untitled: () => 'Untitled resume', copyOf: (title: string) => `${title} (copy)` };

/** Newest first, the order the repository lists resumes in. */
const byNewest = (a: StoredResume, b: StoredResume) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

export class ResumeLibrary {
  private resumes: StoredResume[] = [];
  private activeId: string | null = null;
  private readonly deleted = new Set<string>();
  /** Resumes whose latest write failed (their changes are still pending in the autosaver). */
  private readonly failedSaves = new Set<string>();
  private loadFailed = false;
  private deleteFailed: LibraryStatus['deleteFailed'] = null;
  private status: LibraryStatus = { loadFailed: false, saveFailed: false, deleteFailed: null };
  private readonly listeners = new Set<() => void>();
  private readonly autosaver: Autosaver<StoredResume>;
  private readonly now: () => number;

  constructor(
    private readonly repo: ResumeRepository,
    private readonly options: ResumeLibraryOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.autosaver = createAutosaver<StoredResume>({
      delayMs: options.delayMs,
      maxWaitMs: options.maxWaitMs,
      timers: options.timers,
      write: async (id, resume) => {
        await this.persist(id, resume);
        // Only a write SQLite confirmed clears the failure.
        if (this.failedSaves.delete(id)) this.emit();
      },
      onError: (id, error) => {
        this.failedSaves.add(id);
        this.emit();
        options.onError?.('save', error);
      },
    });
  }

  /** Writes the latest state; creates the row if it is missing (e.g. an earlier create failed). */
  private async persist(id: string, resume: StoredResume): Promise<void> {
    if (this.deleted.has(id)) return;
    if (!(await this.repo.save(resume))) {
      if (this.deleted.has(id)) return;
      await this.repo.create(resume);
    }
  }

  private emit() {
    const saveFailed = this.failedSaves.size > 0;
    const changed =
      this.status.loadFailed !== this.loadFailed ||
      this.status.saveFailed !== saveFailed ||
      this.status.deleteFailed?.id !== this.deleteFailed?.id;
    if (changed) this.status = { loadFailed: this.loadFailed, saveFailed, deleteFailed: this.deleteFailed };
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The current storage problems, as one stable object (changes only when something changes). */
  getStatus(): LibraryStatus {
    return this.status;
  }

  /**
   * Reads the saved resumes. Never throws: a failure is reported through `getStatus().loadFailed`
   * and the caller can call it again. Resumes created or edited on screen while loading was
   * failing are kept (they are not in the database yet).
   */
  async load(): Promise<boolean> {
    try {
      const [stored, activeId] = await Promise.all([this.repo.list(), this.repo.getActiveId()]);
      const local = new Map(this.resumes.map((resume) => [resume.id, resume]));
      const merged = stored
        .filter((resume) => !this.deleted.has(resume.id))
        .map((resume) => (this.autosaver.hasPending(resume.id) ? (local.get(resume.id) ?? resume) : resume));
      const storedIds = new Set(stored.map((resume) => resume.id));
      const unsaved = this.resumes.filter((resume) => !storedIds.has(resume.id) && !this.deleted.has(resume.id));
      this.resumes = [...unsaved, ...merged].sort(byNewest);
      this.activeId = this.activeId && this.get(this.activeId) ? this.activeId : activeId;
      this.loadFailed = false;
    } catch (error) {
      this.loadFailed = true;
      this.options.onError?.('load', error);
    }
    this.emit();
    return !this.loadFailed;
  }

  getAll(): StoredResume[] {
    return this.resumes;
  }

  get(id: string | undefined): StoredResume | null {
    return this.resumes.find((resume) => resume.id === id) ?? null;
  }

  getActiveId(): string | null {
    return this.activeId;
  }

  private writeImmediately(resume: StoredResume): Promise<void> {
    this.autosaver.schedule(resume.id, resume);
    return this.autosaver.flush(resume.id);
  }

  /**
   * Adds a resume and stores it right away. Returns the new record synchronously.
   * The template (default: the first one) sets the initial template and its default
   * accent; an unknown id falls back to the default template. The language defaults to
   * `defaultLanguage()` (the app language), then English.
   */
  create(data: ResumeData, title?: string, templateId?: string, language?: Language): StoredResume {
    const template = templateId ? getTemplate(templateId) : TEMPLATES[0];
    const now = this.now();
    const resume: StoredResume = {
      id: this.options.newId(),
      title: title || data.name || (this.options.titles ?? ENGLISH_TITLES).untitled(),
      templateId: template.id,
      accent: template.defaultAccent,
      language: toLanguage(language ?? this.options.defaultLanguage?.()),
      data,
      createdAt: now,
      updatedAt: now,
    };
    this.resumes = [resume, ...this.resumes];
    this.emit();
    void this.writeImmediately(resume);
    return resume;
  }

  /** Applies an edit in memory now and persists it through the debounced autosaver. */
  update(id: string, patch: ResumePatch): void {
    const current = this.get(id);
    if (!current) return;
    const next: StoredResume = { ...current, ...patch, id, updatedAt: this.now() };
    this.resumes = this.resumes.map((resume) => (resume.id === id ? next : resume));
    this.emit();
    this.autosaver.schedule(id, next);
  }

  duplicate(id: string): StoredResume | null {
    const source = this.get(id);
    if (!source) return null;
    const now = this.now();
    const copy: StoredResume = {
      ...source,
      id: this.options.newId(),
      title: (this.options.titles ?? ENGLISH_TITLES).copyOf(source.title),
      data: JSON.parse(JSON.stringify(source.data)) as ResumeData,
      createdAt: now,
      updatedAt: now,
    };
    this.resumes = [copy, ...this.resumes];
    this.emit();
    void this.writeImmediately(copy);
    return copy;
  }

  /**
   * Deletes a resume. It leaves the list at once; if the database refuses, it comes back and
   * `getStatus().deleteFailed` says so (it is never reported as deleted when it is not).
   */
  async remove(id: string): Promise<boolean> {
    const target = this.get(id);
    if (!target) return true;
    const wasActive = this.activeId === id;
    this.deleted.add(id);
    this.autosaver.cancel(id);
    this.failedSaves.delete(id);
    this.resumes = this.resumes.filter((resume) => resume.id !== id);
    if (wasActive) this.activeId = null;
    if (this.deleteFailed?.id === id) this.deleteFailed = null;
    this.emit();
    await this.autosaver.flush(id); // waits for a write already in progress
    try {
      await this.repo.delete(id);
      return true;
    } catch (error) {
      this.deleted.delete(id);
      this.resumes = [target, ...this.resumes].sort(byNewest);
      if (wasActive) this.activeId = id;
      this.deleteFailed = { id, title: target.title };
      this.options.onError?.('delete', error);
      this.emit();
      return false;
    }
  }

  /** Hides the "could not delete" notice (the resume is still stored). */
  dismissDeleteError(): void {
    if (!this.deleteFailed) return;
    this.deleteFailed = null;
    this.emit();
  }

  /**
   * Retries every write that failed, with the real pending values (not a dismissal).
   * Resolves true when nothing is left unsaved.
   */
  async retrySave(): Promise<boolean> {
    await this.autosaver.flush();
    return this.failedSaves.size === 0;
  }

  async setActive(id: string | null): Promise<void> {
    if (id !== null && !this.get(id)) return;
    this.activeId = id;
    this.emit();
    // The row must exist before it can be marked active.
    if (id !== null) await this.autosaver.flush(id);
    try {
      await this.repo.setActive(id);
    } catch (error) {
      this.options.onError?.('set active', error);
    }
  }

  flush(id?: string): Promise<void> {
    return this.autosaver.flush(id);
  }

  hasPendingChanges(id?: string): boolean {
    return this.autosaver.hasPending(id);
  }

  dispose(): void {
    this.autosaver.dispose();
    this.listeners.clear();
  }
}

import type { ResumeRepository } from '../../domain/ports/repositories';
import type { ResumeData, StoredResume } from '../../domain/resume/types';
import { TEMPLATES } from '../../domain/templates/templates';
import { createAutosaver, type Autosaver, type Timers } from './autosave';

// In-memory view of the resume library backed by a ResumeRepository.
// Screens read and edit this synchronously; persistence happens through the
// autosaver (debounced edits) or immediately (create, duplicate, delete).
// No React imports, so it is tested directly against SQLite.

export type ResumePatch = Partial<Pick<StoredResume, 'title' | 'templateId' | 'accent' | 'data'>>;

export interface ResumeLibraryOptions {
  newId: () => string;
  now?: () => number;
  timers?: Timers;
  delayMs?: number;
  maxWaitMs?: number;
  onError?: (operation: string, error: unknown) => void;
}

export class ResumeLibrary {
  private resumes: StoredResume[] = [];
  private activeId: string | null = null;
  private readonly deleted = new Set<string>();
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
      write: (id, resume) => this.persist(id, resume),
      onError: (id, error) => options.onError?.(`save ${id}`, error),
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
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(): Promise<void> {
    const [resumes, activeId] = await Promise.all([this.repo.list(), this.repo.getActiveId()]);
    this.resumes = resumes;
    this.activeId = activeId;
    this.emit();
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

  /** Adds a resume and stores it right away. Returns the new record synchronously. */
  create(data: ResumeData, title?: string): StoredResume {
    const template = TEMPLATES[0];
    const now = this.now();
    const resume: StoredResume = {
      id: this.options.newId(),
      title: title || data.name || 'Untitled resume',
      templateId: template.id,
      accent: template.defaultAccent,
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
      title: `${source.title} (copy)`,
      data: JSON.parse(JSON.stringify(source.data)) as ResumeData,
      createdAt: now,
      updatedAt: now,
    };
    this.resumes = [copy, ...this.resumes];
    this.emit();
    void this.writeImmediately(copy);
    return copy;
  }

  async remove(id: string): Promise<void> {
    this.deleted.add(id);
    this.autosaver.cancel(id);
    this.resumes = this.resumes.filter((resume) => resume.id !== id);
    if (this.activeId === id) this.activeId = null;
    this.emit();
    await this.autosaver.flush(id); // waits for a write already in progress
    try {
      await this.repo.delete(id);
    } catch (error) {
      this.options.onError?.(`delete ${id}`, error);
    }
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

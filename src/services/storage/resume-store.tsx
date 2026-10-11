import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { ResumeData, StoredResume } from '../../domain/resume/types';
import { getTemplate } from '../../domain/templates/templates';
import { newId } from '../../domain/shared/id';
import { isHexColor } from '../../domain/shared/text';
import type { Language } from '../../domain/i18n/languages';
import { appTranslator, getAppLanguage } from '../i18n/app-language';
import { useDatabase } from './database-context';
import { ResumeLibrary, type LibraryStatus } from './resume-library';

// All resumes live on the device in SQLite. No account, no server, no network.

interface StoreState {
  ready: boolean;
  resumes: StoredResume[];
  activeId: string | null;
  /** Creates a resume with the given template (default: the first) and its default accent. */
  /** New resumes take the current app language unless a language is given. */
  create: (data: ResumeData, title?: string, templateId?: string, language?: Language) => StoredResume;
  /** Changes one resume's language (never the app language). */
  setLanguage: (id: string, language: Language) => void;
  /** Content edits. Colors go through setAccent, which validates them. */
  update: (id: string, patch: Partial<Pick<StoredResume, 'title' | 'data'>>) => void;
  /** Switches template and resets the accent to its default. */
  setTemplate: (id: string, templateId: string) => void;
  /** Any valid hex color (default, preset or custom). Anything else is ignored. */
  setAccent: (id: string, accent: string) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => StoredResume | null;
  setActive: (id: string | null) => void;
  flush: (id?: string) => Promise<void>;
  /** Storage problems the user must be told about (failed load, save or delete). */
  status: LibraryStatus;
  /** Reads the saved resumes again after a failed load. */
  retryLoad: () => Promise<boolean>;
  /** Writes the changes that could not be saved; true when nothing is left unsaved. */
  retrySave: () => Promise<boolean>;
  /** Tries deleting the resume that could not be deleted. */
  retryDelete: () => Promise<boolean>;
  dismissDeleteError: () => void;
  /** Runs a backup or restore with edits paused (see ResumeLibrary.runExclusive). */
  runExclusive: <T>(operation: () => Promise<T>, options?: { reload?: boolean }) => Promise<T>;
}

const StoreContext = createContext<StoreState | null>(null);

export function ResumeStoreProvider({ children }: { children: ReactNode }) {
  const { resumes: repository } = useDatabase();
  const library = useMemo(
    () =>
      new ResumeLibrary(repository, {
        newId,
        onError: (operation, error) => {
          // Never log the error object or any resume content: only what failed.
          if (__DEV__) console.warn(`[storage] ${operation} failed (${error instanceof Error ? error.name : 'error'})`);
        },
        // Read at each create: the app language at that moment.
        defaultLanguage: getAppLanguage,
        titles: {
          untitled: () => appTranslator().t('resume.untitled'),
          copyOf: (title) => appTranslator().t('resume.copyOf', { title }),
        },
      }),
    [repository],
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    // load() never throws: a failure is reported through the library status.
    void library.load().then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [library]);

  // Leaving the foreground is the last reliable moment before the OS may end the process.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void library.flush();
    });
    return () => {
      subscription.remove();
      void library.flush().finally(() => library.dispose());
    };
  }, [library]);

  const status = useSyncExternalStore(
    (listener) => library.subscribe(listener),
    () => library.getStatus(),
  );
  const resumes = useSyncExternalStore(
    (listener) => library.subscribe(listener),
    () => library.getAll(),
  );
  const activeId = useSyncExternalStore(
    (listener) => library.subscribe(listener),
    () => library.getActiveId(),
  );

  const value = useMemo<StoreState>(
    () => ({
      ready,
      resumes,
      activeId,
      create: (data, title, templateId, language) => library.create(data, title, templateId, language),
      setLanguage: (id, language) => library.update(id, { language }),
      update: (id, patch) => {
        // Only content fields are accepted here; accent/template have their own rules.
        const content: { title?: string; data?: ResumeData } = {};
        if (patch.title !== undefined) content.title = patch.title;
        if (patch.data !== undefined) content.data = patch.data;
        library.update(id, content);
      },
      setTemplate: (id, templateId) => {
        const template = getTemplate(templateId);
        library.update(id, { templateId: template.id, accent: template.defaultAccent });
      },
      setAccent: (id, accent) => {
        if (!library.get(id) || !isHexColor(accent)) return;
        library.update(id, { accent });
      },
      remove: (id) => void library.remove(id),
      duplicate: (id) => library.duplicate(id),
      setActive: (id) => void library.setActive(id),
      flush: (id) => library.flush(id),
      status,
      retryLoad: () => library.load(),
      retrySave: () => library.retrySave(),
      retryDelete: async () => {
        const failed = library.getStatus().deleteFailed;
        return failed ? library.remove(failed.id) : true;
      },
      dismissDeleteError: () => library.dismissDeleteError(),
      runExclusive: (operation, options) => library.runExclusive(operation, options),
    }),
    [library, ready, resumes, activeId, status],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useResumeStore(): StoreState {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useResumeStore must be used inside ResumeStoreProvider');
  return value;
}

export function useResume(id: string | undefined) {
  const store = useResumeStore();
  const resume = store.resumes.find((item) => item.id === id) ?? null;
  return {
    resume,
    update: store.update,
    setTemplate: store.setTemplate,
    setAccent: store.setAccent,
    ready: store.ready,
    flush: store.flush,
    setActive: store.setActive,
    setLanguage: store.setLanguage,
  };
}

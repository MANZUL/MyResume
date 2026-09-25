import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { ResumeData, StoredResume } from '../../domain/resume/types';
import { getTemplate } from '../../domain/templates/templates';
import { useEntitlement } from '../entitlement/entitlement';
import { CustomizationService } from '../premium/customization';
import { newId } from '../../domain/shared/id';
import { useDatabase } from './database-context';
import { ResumeLibrary } from './resume-library';

// All resumes live on the device in SQLite. No account, no server, no network.

interface StoreState {
  ready: boolean;
  resumes: StoredResume[];
  activeId: string | null;
  create: (data: ResumeData, title?: string) => StoredResume;
  /** Content edits. Colors go through setAccent, which enforces the premium rules. */
  update: (id: string, patch: Partial<Pick<StoredResume, 'title' | 'data'>>) => void;
  /** Switches template and resets the accent to its default (FREE). */
  setTemplate: (id: string, templateId: string) => void;
  /** Default and preset colors are FREE; custom colors throw PremiumRequiredError for FREE users. */
  setAccent: (id: string, accent: string) => Promise<void>;
  remove: (id: string) => void;
  duplicate: (id: string) => StoredResume | null;
  setActive: (id: string | null) => void;
  flush: (id?: string) => Promise<void>;
}

const StoreContext = createContext<StoreState | null>(null);

export function ResumeStoreProvider({ children }: { children: ReactNode }) {
  const { resumes: repository } = useDatabase();
  const { gate } = useEntitlement();
  const library = useMemo(
    () =>
      new ResumeLibrary(repository, {
        newId,
        onError: (operation, error) => {
          if (__DEV__) console.warn(`[storage] ${operation} failed`, error);
        },
      }),
    [repository],
  );
  const customization = useMemo(() => new CustomizationService(gate, library), [gate, library]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    library
      .load()
      .catch((error: unknown) => {
        if (__DEV__) console.warn('[storage] load failed', error);
      })
      .finally(() => {
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
      create: (data, title) => library.create(data, title),
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
      setAccent: async (id, accent) => {
        const resume = library.get(id);
        if (!resume) return;
        await customization.setAccent(id, resume.templateId, accent);
      },
      remove: (id) => void library.remove(id),
      duplicate: (id) => library.duplicate(id),
      setActive: (id) => void library.setActive(id),
      flush: (id) => library.flush(id),
    }),
    [library, customization, ready, resumes, activeId],
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
  };
}

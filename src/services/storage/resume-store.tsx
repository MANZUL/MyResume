import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TEMPLATES } from '../../domain/templates/templates';
import type { ResumeData, StoredResume } from '../../domain/resume/types';
import { kv } from './kv';

// All resumes live on the device. No account, no server, no network needed.

const STORAGE_KEY = 'resumes.v1';

interface StoreState {
  ready: boolean;
  resumes: StoredResume[];
  create: (data: ResumeData, title?: string) => StoredResume;
  update: (id: string, patch: Partial<Omit<StoredResume, 'id'>>) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => StoredResume | null;
}

const StoreContext = createContext<StoreState | null>(null);

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function ResumeStoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [resumes, setResumes] = useState<StoredResume[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    kv.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) setResumes(parsed as StoredResume[]);
      })
      .catch(() => {
        // Corrupt storage: start empty rather than crash.
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      kv.setItem(STORAGE_KEY, JSON.stringify(resumes)).catch(() => undefined);
    }, 300);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [resumes, ready]);

  const create = useCallback((data: ResumeData, title?: string) => {
    const template = TEMPLATES[0];
    const resume: StoredResume = {
      id: newId(),
      title: title || data.name || 'Untitled resume',
      templateId: template.id,
      accent: template.defaultAccent,
      data,
      updatedAt: Date.now(),
    };
    setResumes((current) => [resume, ...current]);
    return resume;
  }, []);

  const update = useCallback((id: string, patch: Partial<Omit<StoredResume, 'id'>>) => {
    setResumes((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setResumes((current) => current.filter((item) => item.id !== id));
  }, []);

  const duplicate = useCallback((id: string) => {
    const source = resumes.find((item) => item.id === id);
    if (!source) return null;
    const copy: StoredResume = {
      ...source,
      id: newId(),
      title: `${source.title} (copy)`,
      data: JSON.parse(JSON.stringify(source.data)) as ResumeData,
      updatedAt: Date.now(),
    };
    setResumes((current) => [copy, ...current]);
    return copy;
  }, [resumes]);

  const value = useMemo(
    () => ({ ready, resumes, create, update, remove, duplicate }),
    [ready, resumes, create, update, remove, duplicate],
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
  return { resume, update: store.update, ready: store.ready };
}

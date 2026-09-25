import { useCallback, useEffect, useMemo, useState } from 'react';
import { detectTitle } from '../../domain/job-match/segment';
import type { TargetJob } from '../../domain/job-match/target-job';
import { JOB_DESCRIPTION_MAX } from '../../domain/job-match/types';
import { createAutosaver } from './autosave';
import { useDatabase } from './database-context';

/**
 * The job description saved with a resume (plan §9: each resume stores a TargetJob).
 * Loads it once, autosaves edits (debounced), and writes pending edits when the screen goes away.
 * It is the user's own text, so it is kept for FREE and PREMIUM users alike.
 */
export function useTargetJob(resumeId: string | undefined) {
  const { targetJobs } = useDatabase();
  const [description, setDescriptionState] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const saver = useMemo(
    () => createAutosaver<TargetJob>({ write: async (_key, job) => void (await targetJobs.save(job)) }),
    [targetJobs],
  );

  useEffect(() => {
    if (!resumeId) return undefined;
    let active = true;
    targetJobs.get(resumeId).then(
      (job) => {
        if (!active) return;
        setDescriptionState(job?.description ?? '');
        setLoadedFor(resumeId);
      },
      () => active && setLoadedFor(resumeId),
    );
    return () => {
      active = false;
    };
  }, [resumeId, targetJobs]);

  useEffect(() => () => void saver.flush().finally(() => saver.dispose()), [saver]);

  const setDescription = useCallback(
    (text: string) => {
      const value = text.slice(0, JOB_DESCRIPTION_MAX);
      setDescriptionState(value);
      if (resumeId) {
        saver.schedule(resumeId, { resumeId, title: detectTitle(value)?.text ?? '', company: '', description: value, updatedAt: Date.now() });
      }
    },
    [resumeId, saver],
  );

  return { description, setDescription, ready: loadedFor === resumeId };
}

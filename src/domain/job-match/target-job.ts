import { JOB_DESCRIPTION_MAX } from './types';

// The job a resume is being compared with (plan §6 TargetJob, §9 persistence). One per
// resume; deleted with it. Stored as the user typed it; analysis results are never stored.

export interface TargetJob {
  resumeId: string;
  /** The job title as detected in the description, or '' (display only). */
  title: string;
  /** Reserved for the Cover Letter step; '' for now. */
  company: string;
  description: string;
  updatedAt: number;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export function normalizeTargetJob(input: unknown, now: number): TargetJob | null {
  if (!input || typeof input !== 'object') return null;
  const v = input as Record<string, unknown>;
  if (typeof v.resumeId !== 'string' || !v.resumeId) return null;
  return {
    resumeId: v.resumeId,
    title: str(v.title, 200),
    company: str(v.company, 200),
    description: str(v.description, JOB_DESCRIPTION_MAX),
    updatedAt: typeof v.updatedAt === 'number' && Number.isFinite(v.updatedAt) ? v.updatedAt : now,
  };
}

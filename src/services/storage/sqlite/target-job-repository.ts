import { normalizeTargetJob, type TargetJob } from '../../../domain/job-match/target-job';
import type { TargetJobRepository } from '../../../domain/ports/repositories';
import type { SqlDatabase } from './sql';

interface TargetJobRow {
  resume_id: string;
  title: string;
  company: string;
  description: string;
  updated_at: number;
}

/** One saved job description per resume (removed with the resume by the foreign key). */
export class SqliteTargetJobRepository implements TargetJobRepository {
  constructor(
    private readonly db: SqlDatabase,
    private readonly now: () => number = Date.now,
  ) {}

  async get(resumeId: string): Promise<TargetJob | null> {
    const row = await this.db.get<TargetJobRow>(
      'SELECT resume_id, title, company, description, updated_at FROM target_jobs WHERE resume_id = ?',
      [resumeId],
    );
    if (!row) return null;
    return normalizeTargetJob(
      { resumeId: row.resume_id, title: row.title, company: row.company, description: row.description, updatedAt: row.updated_at },
      this.now(),
    );
  }

  async save(job: TargetJob): Promise<boolean> {
    const j = normalizeTargetJob(job, this.now());
    if (!j) return false;
    const exists = await this.db.get<{ id: string }>('SELECT id FROM resumes WHERE id = ?', [j.resumeId]);
    if (!exists) return false;
    await this.db.run(
      `INSERT INTO target_jobs (resume_id, title, company, description, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (resume_id) DO UPDATE SET
         title = excluded.title, company = excluded.company, description = excluded.description, updated_at = excluded.updated_at`,
      [j.resumeId, j.title, j.company, j.description, j.updatedAt],
    );
    return true;
  }
}

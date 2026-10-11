import type { BackupFile, BackupResume, BackupSnapshot } from '../../../domain/backup/backup-format';
import { isLanguage } from '../../../domain/i18n/languages';
import { normalizeTargetJob } from '../../../domain/job-match/target-job';
import type { BackupStore } from '../../../domain/ports/repositories';
import { LOCAL_PROFILE_FIELDS, normalizeLocalProfile } from '../../../domain/profile/local-profile';
import { normalizeStoredResume } from '../../../domain/resume/normalize';
import type { SqlDatabase } from './sql';

interface ResumeRow {
  id: string;
  title: string;
  template_id: string;
  accent: string;
  language: string;
  data_json: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

interface JobRow {
  resume_id: string;
  title: string;
  company: string;
  description: string;
  updated_at: number;
}

const APP_LANGUAGE = 'app_language';

/**
 * Backup and restore against SQLite. Both run inside one transaction: the snapshot reads every
 * table at one moment, and a restore commits completely or rolls back completely (the connection's
 * exclusive transaction; the same code runs on a real SQLite engine in the tests). Foreign-key
 * cascades are not relied on, because a separate transaction connection may not have them enabled:
 * dependent rows are deleted explicitly.
 */
export class SqliteBackupStore implements BackupStore {
  constructor(
    private readonly db: SqlDatabase,
    private readonly now: () => number = Date.now,
  ) {}

  async snapshot(): Promise<BackupSnapshot> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.all<ResumeRow>(
        'SELECT id, title, template_id, accent, language, data_json, is_active, created_at, updated_at FROM resumes ORDER BY created_at DESC, id DESC',
      );
      const jobs = new Map((await tx.all<JobRow>('SELECT resume_id, title, company, description, updated_at FROM target_jobs')).map((job) => [job.resume_id, job]));
      const resumes: BackupResume[] = [];
      let unreadable = 0;
      let currentResumeId: string | null = null;
      for (const row of rows) {
        let data: unknown;
        try {
          data = JSON.parse(row.data_json);
        } catch {
          unreadable += 1;
          continue;
        }
        const resume = normalizeStoredResume(
          { id: row.id, title: row.title, templateId: row.template_id, accent: row.accent, language: row.language, data, createdAt: row.created_at, updatedAt: row.updated_at },
          this.now(),
        );
        if (!resume) {
          unreadable += 1;
          continue;
        }
        const job = jobs.get(row.id);
        const target = job ? normalizeTargetJob({ resumeId: job.resume_id, title: job.title, company: job.company, description: job.description, updatedAt: job.updated_at }, this.now()) : null;
        resumes.push({
          id: resume.id,
          title: resume.title,
          templateId: resume.templateId,
          accent: resume.accent,
          language: resume.language,
          createdAt: resume.createdAt,
          updatedAt: resume.updatedAt,
          data: resume.data,
          targetJob: target ? { title: target.title, company: target.company, description: target.description, updatedAt: target.updatedAt } : null,
        });
        if (row.is_active === 1) currentResumeId = resume.id;
      }
      const profileRow = await tx.get<Record<string, unknown>>('SELECT name, email, phone, location, headline, linkedin, website, updated_at FROM local_profile WHERE id = 1');
      const profile = profileRow ? normalizeLocalProfile({ ...profileRow, updatedAt: profileRow.updated_at }) : null;
      const hasProfile = profile !== null && LOCAL_PROFILE_FIELDS.some((field) => profile[field] !== '');
      const language = await tx.get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [APP_LANGUAGE]);
      return {
        resumes,
        currentResumeId,
        profile: hasProfile ? profile : null,
        appLanguage: language && isLanguage(language.value) ? language.value : null,
        unreadable,
      };
    });
  }

  async replaceAll(backup: BackupFile): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.run('DELETE FROM target_jobs');
      await tx.run('UPDATE export_records SET resume_id = NULL WHERE resume_id IS NOT NULL');
      await tx.run('DELETE FROM resumes');
      for (const resume of backup.resumes) {
        await tx.run(
          `INSERT INTO resumes (id, title, template_id, accent, language, data_json, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [resume.id, resume.title, resume.templateId, resume.accent, resume.language, JSON.stringify(resume.data), resume.createdAt, resume.updatedAt],
        );
        if (resume.targetJob) {
          await tx.run('INSERT INTO target_jobs (resume_id, title, company, description, updated_at) VALUES (?, ?, ?, ?, ?)', [
            resume.id,
            resume.targetJob.title,
            resume.targetJob.company,
            resume.targetJob.description,
            resume.targetJob.updatedAt,
          ]);
        }
      }
      if (backup.currentResumeId) await tx.run('UPDATE resumes SET is_active = 1 WHERE id = ?', [backup.currentResumeId]);
      if (backup.profile) {
        const p = backup.profile;
        await tx.run(
          `INSERT INTO local_profile (id, name, email, phone, location, headline, linkedin, website, updated_at)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             name = excluded.name, email = excluded.email, phone = excluded.phone, location = excluded.location,
             headline = excluded.headline, linkedin = excluded.linkedin, website = excluded.website, updated_at = excluded.updated_at`,
          [p.name, p.email, p.phone, p.location, p.headline, p.linkedin, p.website, p.updatedAt],
        );
      } else {
        await tx.run('DELETE FROM local_profile');
      }
      if (backup.settings.appLanguage) {
        await tx.run(
          `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [APP_LANGUAGE, backup.settings.appLanguage, this.now()],
        );
      }
    });
  }
}

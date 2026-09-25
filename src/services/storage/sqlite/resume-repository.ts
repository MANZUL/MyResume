import type { ResumeRepository, StorageIssue } from '../../../domain/ports/repositories';
import { normalizeStoredResume } from '../../../domain/resume/normalize';
import type { StoredResume } from '../../../domain/resume/types';
import type { SqlDatabase } from './sql';

interface ResumeRow {
  id: string;
  title: string;
  template_id: string;
  accent: string;
  data_json: string;
  created_at: number;
  updated_at: number;
}

const COLUMNS = 'id, title, template_id, accent, data_json, created_at, updated_at';

export class SqliteResumeRepository implements ResumeRepository {
  constructor(
    private readonly db: SqlDatabase,
    private readonly onIssue: (issue: StorageIssue) => void = () => undefined,
    private readonly now: () => number = Date.now,
  ) {}

  /** Unreadable rows (invalid JSON) are reported and skipped, never deleted. */
  private fromRow(row: ResumeRow): StoredResume | null {
    let data: unknown;
    try {
      data = JSON.parse(row.data_json);
    } catch {
      this.onIssue({ table: 'resumes', id: row.id, problem: 'data_json is not valid JSON' });
      return null;
    }
    return normalizeStoredResume(
      {
        id: row.id,
        title: row.title,
        templateId: row.template_id,
        accent: row.accent,
        data,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      this.now(),
    );
  }

  async list(): Promise<StoredResume[]> {
    const rows = await this.db.all<ResumeRow>(`SELECT ${COLUMNS} FROM resumes ORDER BY created_at DESC, id DESC`);
    return rows.map((row) => this.fromRow(row)).filter((resume): resume is StoredResume => resume !== null);
  }

  async get(id: string): Promise<StoredResume | null> {
    const row = await this.db.get<ResumeRow>(`SELECT ${COLUMNS} FROM resumes WHERE id = ?`, [id]);
    return row ? this.fromRow(row) : null;
  }

  async create(resume: StoredResume): Promise<void> {
    await this.db.run(
      `INSERT INTO resumes (id, title, template_id, accent, data_json, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [resume.id, resume.title, resume.templateId, resume.accent, JSON.stringify(resume.data), resume.createdAt, resume.updatedAt],
    );
  }

  async save(resume: StoredResume): Promise<boolean> {
    const result = await this.db.run(
      `UPDATE resumes SET title = ?, template_id = ?, accent = ?, data_json = ?, updated_at = ? WHERE id = ?`,
      [resume.title, resume.templateId, resume.accent, JSON.stringify(resume.data), resume.updatedAt, resume.id],
    );
    return result.changes > 0;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM resumes WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async getActiveId(): Promise<string | null> {
    const row = await this.db.get<{ id: string }>('SELECT id FROM resumes WHERE is_active = 1');
    return row?.id ?? null;
  }

  async setActive(id: string | null): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.run('UPDATE resumes SET is_active = 0 WHERE is_active = 1');
      if (id !== null) await tx.run('UPDATE resumes SET is_active = 1 WHERE id = ?', [id]);
    });
  }
}

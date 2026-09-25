import type { AccessReason } from '../../../domain/access/access';
import {
  EXPORT_OUTCOMES,
  EXPORT_TYPES,
  type ExportRecord,
  type NewExportRecord,
} from '../../../domain/export/export-record';
import type { ExportRecordRepository, StorageIssue } from '../../../domain/ports/repositories';
import type { SqlDatabase } from './sql';

interface ExportRow {
  id: string;
  resume_id: string | null;
  template_id: string;
  export_type: string;
  outcome: string;
  access_reason: string;
  error_message: string | null;
  created_at: number;
}

const COLUMNS = 'id, resume_id, template_id, export_type, outcome, access_reason, error_message, created_at';

/** Append-only export history (metadata only; never consulted for access decisions). */
export class SqliteExportRecordRepository implements ExportRecordRepository {
  constructor(
    private readonly db: SqlDatabase,
    private readonly newId: () => string,
    private readonly now: () => number = Date.now,
    private readonly onIssue: (issue: StorageIssue) => void = () => undefined,
  ) {}

  private fromRow(row: ExportRow): ExportRecord | null {
    const exportType = EXPORT_TYPES.find((type) => type === row.export_type);
    const outcome = EXPORT_OUTCOMES.find((value) => value === row.outcome);
    if (!exportType || !outcome) {
      this.onIssue({ table: 'export_records', id: row.id, problem: 'unknown export_type or outcome' });
      return null;
    }
    return {
      id: row.id,
      resumeId: row.resume_id,
      templateId: row.template_id,
      exportType,
      outcome,
      accessReason: row.access_reason as AccessReason,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    };
  }

  async add(record: NewExportRecord): Promise<ExportRecord> {
    const full: ExportRecord = { ...record, id: this.newId(), createdAt: this.now() };
    await this.db.run(`INSERT INTO export_records (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      full.id,
      full.resumeId,
      full.templateId,
      full.exportType,
      full.outcome,
      full.accessReason,
      full.errorMessage,
      full.createdAt,
    ]);
    return full;
  }

  async listRecent(limit: number): Promise<ExportRecord[]> {
    const rows = await this.db.all<ExportRow>(
      `SELECT ${COLUMNS} FROM export_records ORDER BY created_at DESC, id DESC LIMIT ?`,
      [Math.max(0, Math.trunc(limit))],
    );
    return rows.map((row) => this.fromRow(row)).filter((r): r is ExportRecord => r !== null);
  }

  async listForResume(resumeId: string): Promise<ExportRecord[]> {
    const rows = await this.db.all<ExportRow>(
      `SELECT ${COLUMNS} FROM export_records WHERE resume_id = ? ORDER BY created_at DESC, id DESC`,
      [resumeId],
    );
    return rows.map((row) => this.fromRow(row)).filter((r): r is ExportRecord => r !== null);
  }
}

// Export history metadata for diagnostics. It records what happened; it is
// never read to decide whether an export is allowed, and it never stores a
// file path or file contents (plan §11, §13).

export const EXPORT_TYPES = ['pdf', 'docx', 'png'] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export const EXPORT_OUTCOMES = ['succeeded', 'failed', 'denied'] as const;
export type ExportOutcome = (typeof EXPORT_OUTCOMES)[number];

export interface ExportRecord {
  id: string;
  /** Null once the resume has been deleted; the history row is kept. */
  resumeId: string | null;
  templateId: string;
  exportType: ExportType;
  outcome: ExportOutcome;
  /** The entitlement decision reason at the time of the request (e.g. verified, cached, not_premium). */
  accessReason: string;
  /** Short, non-personal error summary for failed exports. */
  errorMessage: string | null;
  createdAt: number;
}

export type NewExportRecord = Omit<ExportRecord, 'id' | 'createdAt'>;

const MAX_ERROR_LENGTH = 200;

export function summarizeExportError(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error';
  return message.slice(0, MAX_ERROR_LENGTH);
}

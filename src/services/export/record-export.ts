import type { ExportAccess } from '../../domain/access/access';
import { summarizeExportError, type ExportType } from '../../domain/export/export-record';
import type { ExportRecordRepository } from '../../domain/ports/repositories';
import type { StoredResume } from '../../domain/resume/types';

export class ExportLockedError extends Error {
  constructor() {
    super('Unlock exports to save or share your resume.');
    this.name = 'ExportLockedError';
  }
}

/**
 * Runs one export attempt: checks access first, then generates, and appends an
 * ExportRecord (metadata only) with the outcome. The record is written after
 * the decision and is never read to make one. A failure to write the record
 * never changes the export result.
 */
export async function runRecordedExport(
  resume: StoredResume,
  exportType: ExportType,
  access: ExportAccess,
  generate: () => Promise<void>,
  records?: ExportRecordRepository,
): Promise<void> {
  const record = async (outcome: 'succeeded' | 'failed' | 'denied', error?: unknown) => {
    if (!records) return;
    try {
      await records.add({
        resumeId: resume.id,
        templateId: resume.templateId,
        exportType,
        outcome,
        accessReason: access.reason,
        errorMessage: error === undefined ? null : summarizeExportError(error),
      });
    } catch {
      // Export history is diagnostics only.
    }
  };

  if (!access.unlocked) {
    await record('denied');
    throw new ExportLockedError();
  }
  try {
    await generate();
  } catch (error) {
    await record('failed', error);
    throw error;
  }
  await record('succeeded');
}

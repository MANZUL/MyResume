import { useMemo } from 'react';
import { useEntitlement } from '../entitlement/entitlement';
import { useDatabase } from '../storage/database-context';
import { createExpoExportPlatform } from './expo-export-platform';
import { ExportService } from './export-service';

/** The app's ExportService: premium comes from EntitlementService, never from the caller. */
export function useExportService(): ExportService {
  const { gate } = useEntitlement();
  const { exportRecords } = useDatabase();
  return useMemo(() => new ExportService(gate, createExpoExportPlatform(), exportRecords), [gate, exportRecords]);
}

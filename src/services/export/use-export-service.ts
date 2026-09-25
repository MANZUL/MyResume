import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { useEntitlement } from '../entitlement/entitlement';
import { useDatabase } from '../storage/database-context';
import { getExpoExportPlatform } from './expo-export-platform';
import { ExportService } from './export-service';

/** The app's ExportService: premium comes from EntitlementService, never from the caller. */
export function useExportService(): ExportService {
  const { gate } = useEntitlement();
  const { exportRecords } = useDatabase();
  const service = useMemo(
    () =>
      new ExportService(gate, getExpoExportPlatform(), {
        records: exportRecords,
        isForeground: () => AppState.currentState === 'active',
      }),
    [gate, exportRecords],
  );
  // Anything prepared but not shared is deleted when the screen goes away.
  useEffect(() => () => void service.discardAll(), [service]);
  return service;
}

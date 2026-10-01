import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { useDatabase } from '../storage/database-context';
import { getExpoExportPlatform } from './expo-export-platform';
import { ExportService } from './export-service';

/** The app's ExportService (every export is free). */
export function useExportService(): ExportService {
  const { exportRecords } = useDatabase();
  const service = useMemo(
    () =>
      new ExportService(getExpoExportPlatform(), {
        records: exportRecords,
        isForeground: () => AppState.currentState === 'active',
      }),
    [exportRecords],
  );
  // Anything prepared but not shared is deleted when the screen goes away.
  useEffect(() => () => void service.discardAll(), [service]);
  return service;
}

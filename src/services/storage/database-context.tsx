import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, colors, Muted } from '../../ui/components';
import { openAppDatabase } from './expo-database';
import type { AppDatabase } from './sqlite/database';
import { SchemaTooNewError } from './sqlite/migrate';

const DatabaseContext = createContext<AppDatabase | null>(null);

/** Opens and migrates the on-device database before the app renders its screens. */
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [database, setDatabase] = useState<AppDatabase | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    openAppDatabase((issue) => {
      if (__DEV__) console.warn('[storage]', issue);
    })
      .then((db) => {
        if (active) setDatabase(db);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  if (error) {
    // Nothing is deleted or reset here: the saved data stays untouched on disk.
    const tooNew = error instanceof SchemaTooNewError;
    return (
      <View style={{ flex: 1, padding: 24, gap: 12, justifyContent: 'center', backgroundColor: colors.bg }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>Your resumes couldn&apos;t be opened</Text>
        <Muted>
          {tooNew
            ? 'They were saved by a newer version of My Resume. Update the app to open them.'
            : 'Your saved data has not been changed. Please try again.'}
        </Muted>
        {tooNew ? null : <Button title="Try again" onPress={retry} />}
      </View>
    );
  }

  if (!database) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <DatabaseContext.Provider value={database}>{children}</DatabaseContext.Provider>;
}

export function useDatabase(): AppDatabase {
  const value = useContext(DatabaseContext);
  if (!value) throw new Error('useDatabase must be used inside DatabaseProvider');
  return value;
}

import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../ui/components';
import { EntitlementProvider } from '../services/entitlement/entitlement';
import { purgeExportArtifacts } from '../services/export/expo-export-platform';
import { RasterizerHost } from '../services/export/rasterizer/RasterizerHost';
import { DatabaseProvider } from '../services/storage/database-context';
import { ResumeStoreProvider } from '../services/storage/resume-store';

export default function RootLayout() {
  // Export files are transient: clear any left from the previous session.
  useEffect(() => {
    purgeExportArtifacts();
  }, []);

  return (
    <SafeAreaProvider>
      <DatabaseProvider>
        <EntitlementProvider>
          <ResumeStoreProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.bg },
                headerShadowVisible: false,
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '600' },
                contentStyle: { backgroundColor: colors.bg },
              }}
            >
              <Stack.Screen name="index" options={{ title: 'My Resume' }} />
              <Stack.Screen name="import" options={{ title: 'Import text', presentation: 'modal' }} />
              <Stack.Screen name="resume/[id]/index" options={{ title: 'Edit' }} />
              <Stack.Screen name="resume/[id]/preview" options={{ title: 'Preview' }} />
              <Stack.Screen name="resume/[id]/tools" options={{ title: 'Tools' }} />
              <Stack.Screen name="unlock" options={{ title: 'Premium', presentation: 'modal' }} />
            </Stack>
            {/* Hidden, offline pdf.js page for image export; renders nothing until an image export runs. */}
            <RasterizerHost />
          </ResumeStoreProvider>
        </EntitlementProvider>
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}

import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../ui/components';
import { purgeExportArtifacts } from '../services/export/expo-export-platform';
import { RasterizerHost } from '../services/export/rasterizer/RasterizerHost';
import { LocalizationProvider, useT } from '../services/i18n/localization';
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
        <LocalizationProvider>
          <ResumeStoreProvider>
            <StatusBar style="dark" />
            <AppStack />
            {/* Hidden, offline pdf.js page for image export; renders nothing until an image export runs. */}
            <RasterizerHost />
          </ResumeStoreProvider>
        </LocalizationProvider>
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}

/** Screen titles come from the app language. */
function AppStack() {
  const t = useT();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('nav.home') }} />
      <Stack.Screen name="templates/index" options={{ title: t('nav.templates') }} />
      <Stack.Screen name="templates/[templateId]" options={{ title: t('nav.template') }} />
      <Stack.Screen name="import" options={{ title: t('nav.import'), presentation: 'modal' }} />
      <Stack.Screen name="settings" options={{ title: t('nav.settings') }} />
      <Stack.Screen name="resume/[id]/index" options={{ title: t('nav.edit') }} />
      <Stack.Screen name="resume/[id]/preview" options={{ title: t('nav.preview') }} />
      <Stack.Screen name="resume/[id]/tools" options={{ title: t('nav.tools') }} />
    </Stack>
  );
}

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../ui/components';
import { EntitlementProvider } from '../services/entitlement/entitlement';
import { ResumeStoreProvider } from '../services/storage/resume-store';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ResumeStoreProvider>
        <EntitlementProvider>
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
            <Stack.Screen name="unlock" options={{ title: 'Unlock exports', presentation: 'modal' }} />
          </Stack>
        </EntitlementProvider>
      </ResumeStoreProvider>
    </SafeAreaProvider>
  );
}

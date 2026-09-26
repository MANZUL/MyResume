import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Button, colors, Muted } from '../../ui/components';
import { templateSampleHtml } from '../../domain/templates/sample-preview';
import { findTemplate } from '../../domain/templates/templates';
import { CategoryTag } from './TemplateCard';
import { useCreateFromTemplate } from './use-create-from-template';

/** Large template preview: the sample resume through the existing renderer (no watermark). */
export default function TemplatePreviewScreen() {
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  const template = findTemplate(String(templateId ?? ''));
  const html = useMemo(() => (template ? templateSampleHtml(template.id) : ''), [template]);
  const startFromTemplate = useCreateFromTemplate();
  const insets = useSafeAreaInsets();

  if (!template) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
        <Muted>This template is not available.</Muted>
        <Button title="Browse templates" onPress={() => router.replace('/templates')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: template.name }} />
      <WebView
        originWhitelist={['about:blank']}
        source={{ html }}
        style={{ flex: 1, backgroundColor: '#E9E7E2' }}
        javaScriptEnabled={false}
        // Static page: block navigation, file access and remote loads.
        onShouldStartLoadWithRequest={(request) => request.url === 'about:blank' || request.url.startsWith('data:')}
        allowFileAccess={false}
        setSupportMultipleWindows={false}
        textInteractionEnabled={false}
        accessibilityLabel={`${template.name} template preview with sample content`}
      />
      <View
        style={{
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: Math.max(insets.bottom, 14),
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{template.name}</Text>
          <CategoryTag label={template.category} />
        </View>
        <Muted>{template.description}</Muted>
        <Muted>Shown with sample content. Your resume starts blank.</Muted>
        <Button title="Use this template" onPress={() => startFromTemplate(template.id)} style={{ marginTop: 4 }} />
      </View>
    </View>
  );
}

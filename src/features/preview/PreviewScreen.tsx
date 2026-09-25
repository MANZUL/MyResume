import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Button, colors, Muted } from '../../ui/components';
import { PremiumRequiredError } from '../../domain/entitlement/features';
import { freeAccentsFor } from '../../domain/entitlement/palette';
import { getTemplate, TEMPLATES } from '../../domain/templates/templates';
import { useEntitlement } from '../../services/entitlement/entitlement';
import {
  ExportCancelledError,
  ExportInProgressError,
  ExportInterruptedError,
} from '../../services/export/export-service';
import { useExportService } from '../../services/export/use-export-service';
import { useResume } from '../../services/storage/resume-store';

export default function PreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { resume, setTemplate, setAccent, flush } = useResume(id);
  const { decision, entitlements, paywall, preview } = useEntitlement();
  const exporter = useExportService();
  const resumeId = resume?.id;

  // Template and color changes are saved when the screen loses focus.
  useFocusEffect(
    useCallback(() => {
      if (!resumeId) return undefined;
      return () => {
        void flush(resumeId);
      };
    }, [resumeId, flush]),
  );
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<'pdf' | 'docx' | 'image' | null>(null);
  const [html, setHtml] = useState('');

  // The preview service decides the watermark from the entitlement (FREE: watermarked).
  useEffect(() => {
    if (!resume) return undefined;
    let active = true;
    preview
      .render(resume)
      .then((result) => {
        if (active) setHtml(result.html);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [resume, preview, decision.premium]);

  if (!resume) return null;
  const template = getTemplate(resume.templateId);

  // Every export goes to the ExportService, which checks premium itself. When it
  // refuses, the paywall remembers this export and runs it again after subscribing.
  const runExport = async (kind: 'pdf' | 'docx' | 'image'): Promise<void> => {
    setBusy(kind);
    try {
      if (kind === 'pdf') await exporter.exportPdf(resume);
      else if (kind === 'docx') await exporter.exportDocx(resume);
      else await exporter.exportImage(resume);
    } catch (error) {
      if (error instanceof PremiumRequiredError) paywall.request({ feature: error.feature, run: () => runExport(kind) });
      else if (error instanceof ExportInProgressError || error instanceof ExportInterruptedError || error instanceof ExportCancelledError) {
        // Expected outcomes: another export is running, the app left the foreground, or the user cancelled.
      } else Alert.alert('Export failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const chooseAccent = async (color: string): Promise<void> => {
    try {
      await setAccent(resume.id, color);
    } catch (error) {
      if (error instanceof PremiumRequiredError) paywall.request({ feature: error.feature, run: () => chooseAccent(color) });
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <WebView
        originWhitelist={['about:blank']}
        source={{ html }}
        style={{ flex: 1, backgroundColor: '#E9E7E2' }}
        javaScriptEnabled={false}
        // The preview is static: block navigation, file access and remote loads.
        onShouldStartLoadWithRequest={(request) => request.url === 'about:blank' || request.url.startsWith('data:')}
        allowFileAccess={false}
        setSupportMultipleWindows={false}
        textInteractionEnabled={false}
        accessibilityLabel="Resume preview"
      />
      <View
        style={{
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 12),
          gap: 10,
        }}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {TEMPLATES.map((t) => {
            const selected = t.id === resume.templateId;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${t.name} template, ${t.category}`}
                onPress={() => setTemplate(resume.id, t.id)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: selected ? colors.text : colors.border,
                  backgroundColor: selected ? colors.text : colors.card,
                }}
              >
                <Text style={{ color: selected ? '#fff' : colors.text, fontWeight: '600' }}>{t.name.replace(/^The /, '')}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, alignItems: 'center' }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{template.category} · Accent</Text>
          {freeAccentsFor(resume.templateId).map((color) => (
            <Pressable
              key={color}
              accessibilityRole="button"
              accessibilityLabel={`Accent color ${color}`}
              accessibilityState={{ selected: resume.accent === color }}
              onPress={() => void chooseAccent(color)}
              hitSlop={6}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: color,
                borderWidth: resume.accent === color ? 3 : 0,
                borderColor: '#fff',
                outlineColor: color,
                outlineWidth: resume.accent === color ? 2 : 0,
                outlineStyle: 'solid',
              }}
            />
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16 }}>
          <Button title={decision.premium ? 'Export PDF' : 'PDF 🔒'} loading={busy === 'pdf'} onPress={() => runExport('pdf')} style={{ flex: 1 }} />
          <Button title={decision.premium ? 'Export Word' : 'Word 🔒'} variant="secondary" loading={busy === 'docx'} onPress={() => runExport('docx')} style={{ flex: 1 }} />
          <Button title={decision.premium ? 'Export Image' : 'Image 🔒'} variant="secondary" loading={busy === 'image'} onPress={() => runExport('image')} style={{ flex: 1 }} />
        </View>
        {entitlements.providerId === 'fake' ? (
          <View style={{ paddingHorizontal: 16 }}>
            <Muted>Development build: purchases use a simulated store.</Muted>
          </View>
        ) : null}
      </View>
    </View>
  );
}

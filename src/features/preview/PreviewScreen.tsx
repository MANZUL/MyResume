import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Button, colors } from '../../ui/components';
import { accentsFor } from '../../domain/templates/accents';
import { TEMPLATES } from '../../domain/templates/templates';
import { templateText } from '../../i18n/templates';
import { useT } from '../../services/i18n/localization';
import {
  ExportCancelledError,
  ExportInProgressError,
  ExportInterruptedError,
} from '../../services/export/export-service';
import { useExportService } from '../../services/export/use-export-service';
import { renderPreview } from '../../services/preview/preview-service';
import { useResume } from '../../services/storage/resume-store';

const EXPORT_BUTTONS = [
  { kind: 'pdf', variant: 'primary' },
  { kind: 'docx', variant: 'secondary' },
  { kind: 'image', variant: 'secondary' },
] as const;

export default function PreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { resume, setTemplate, setAccent, flush } = useResume(id);
  const exporter = useExportService();
  const t = useT();
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
  const html = useMemo(() => (resume ? renderPreview(resume) : ''), [resume]);

  if (!resume) return null;
  const current = templateText(t, resume.templateId);

  // Every export goes to the ExportService (prepare → opaque handle → share). All formats are free.
  const runExport = async (kind: 'pdf' | 'docx' | 'image'): Promise<void> => {
    setBusy(kind);
    try {
      if (kind === 'pdf') await exporter.exportPdf(resume);
      else if (kind === 'docx') await exporter.exportDocx(resume);
      else await exporter.exportImage(resume);
    } catch (error) {
      if (error instanceof ExportInProgressError || error instanceof ExportInterruptedError || error instanceof ExportCancelledError) {
        // Expected outcomes: another export is running, the app left the foreground, or the user cancelled.
      } else Alert.alert(t('preview.exportFailed'), error instanceof Error ? error.message : t('preview.tryAgain'));
    } finally {
      setBusy(null);
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
        accessibilityLabel={t('preview.a11y')}
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
          {TEMPLATES.map((option) => {
            const selected = option.id === resume.templateId;
            const text = templateText(t, option.id);
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={t('preview.templateA11y', { name: text.name, category: text.category })}
                onPress={() => setTemplate(resume.id, option.id)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: selected ? colors.text : colors.border,
                  backgroundColor: selected ? colors.text : colors.card,
                }}
              >
                <Text style={{ color: selected ? '#fff' : colors.text, fontWeight: '600' }}>{text.shortName}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4, gap: 10, alignItems: 'center' }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{t('preview.accent', { category: current.category })}</Text>
          {accentsFor(resume.templateId).map((color) => (
            <Pressable
              key={color}
              accessibilityRole="button"
              accessibilityLabel={t('preview.accentA11y', { color })}
              accessibilityState={{ selected: resume.accent === color }}
              onPress={() => setAccent(resume.id, color)}
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
          {EXPORT_BUTTONS.map(({ kind, variant }) => {
            const format = t(`preview.formats.${kind}`);
            return (
            <Button
              key={kind}
              title={t('preview.export', { format })}
              variant={variant}
              fit
              loading={busy === kind}
              onPress={() => runExport(kind)}
              style={{ flex: 1, paddingHorizontal: 10 }}
            />
            );
          })}
        </View>
      </View>
    </View>
  );
}

import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Button, colors } from '../../ui/components';
import { contentTextStyle } from '../../ui/direction';
import { accentsFor, CUSTOM_COLOR_EXAMPLE, customAccent } from '../../domain/templates/accents';
import { TEMPLATES } from '../../domain/templates/templates';
import { templateText } from '../../i18n/templates';
import { useT } from '../../services/i18n/localization';
import {
  ExportCancelledError,
  ExportInProgressError,
  ExportInterruptedError,
} from '../../services/export/export-service';
import { getPaperSize, setPaperSize, type PaperSize } from '../../services/export/paper-size';
import { useExportService } from '../../services/export/use-export-service';
import { renderPreview } from '../../services/preview/preview-service';
import { useResume } from '../../services/storage/resume-store';

const PAPER_SIZES = ['letter', 'a4'] as const;

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
  // One paper size for the page shown and for every export (PDF, Word, image) from this screen.
  const [paper, setPaper] = useState<PaperSize>(getPaperSize);
  // A color typed by the user: applied only when it is exactly six hex digits.
  const [customColor, setCustomColor] = useState('');
  const [customColorInvalid, setCustomColorInvalid] = useState(false);
  const html = useMemo(() => (resume ? renderPreview(resume, paper) : ''), [resume, paper]);

  if (!resume) return null;
  const current = templateText(t, resume.templateId);
  const sameColor = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();
  // The presets, plus the resume's own color when it is a custom one, so the selection is always visible.
  const presets = accentsFor(resume.templateId);
  const swatches = presets.some((color) => sameColor(color, resume.accent)) ? presets : [...presets, resume.accent];
  const applyCustomColor = () => {
    const result = customAccent(customColor, resume.accent);
    if (!result.valid) {
      setCustomColorInvalid(true); // the current color is left as it is
      return;
    }
    setCustomColorInvalid(false);
    setCustomColor(result.accent);
    setAccent(resume.id, result.accent);
  };

  // Every export goes to the ExportService (prepare → opaque handle → share). All formats are free.
  const runExport = async (kind: 'pdf' | 'docx' | 'image'): Promise<void> => {
    setBusy(kind);
    try {
      if (kind === 'pdf') await exporter.exportPdf(resume, paper);
      else if (kind === 'docx') await exporter.exportDocx(resume, paper);
      else await exporter.exportImage(resume, paper);
    } catch (error) {
      if (error instanceof ExportInProgressError || error instanceof ExportInterruptedError || error instanceof ExportCancelledError) {
        // Expected outcomes: another export is running, the app left the foreground, or the user cancelled.
      } else Alert.alert(t('preview.exportFailed'), error instanceof Error ? error.message : t('preview.tryAgain'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          {swatches.map((color) => {
            const selected = sameColor(color, resume.accent);
            return (
              <Pressable
                key={color}
                accessibilityRole="button"
                accessibilityLabel={t('preview.accentA11y', { color })}
                accessibilityState={{ selected }}
                onPress={() => setAccent(resume.id, color)}
                hitSlop={6}
                // A dark ring with a gap marks the selection whatever the color is; the thin
                // border keeps white and very light colors visible on the white bar.
                style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: selected ? colors.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color, borderWidth: 1, borderColor: colors.border }} />
              </Pressable>
            );
          })}
          <TextInput
            value={customColor}
            onChangeText={(text) => {
              setCustomColor(text);
              setCustomColorInvalid(false);
            }}
            onSubmitEditing={applyCustomColor}
            placeholder={t('preview.customColor.placeholder')}
            placeholderTextColor="#A3A6AC"
            accessibilityLabel={t('preview.customColor.label')}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            returnKeyType="done"
            // A color code is always left-to-right, in an Arabic app too.
            style={[{ width: 104, height: 36, borderWidth: 1, borderColor: customColorInvalid ? colors.danger : colors.border, borderRadius: 8, paddingHorizontal: 8, fontSize: 14, color: colors.text }, contentTextStyle('en')]}
          />
          <Button title={t('preview.customColor.apply')} variant="secondary" fit onPress={applyCustomColor} style={{ minHeight: 36, paddingHorizontal: 12 }} />
        </ScrollView>
        {customColorInvalid ? (
          <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13, paddingHorizontal: 16 }}>
            {t('preview.customColor.invalid', { example: CUSTOM_COLOR_EXAMPLE })}
          </Text>
        ) : null}
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('preview.paper.label')}
          accessibilityHint={t('preview.paper.hint')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }}
        >
          <Text style={{ color: colors.muted, fontSize: 13 }}>{t('preview.paper.label')}</Text>
          {PAPER_SIZES.map((size) => {
            const selected = size === paper;
            const name = t(`preview.paper.${size}`);
            return (
              <Pressable
                key={size}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: busy !== null }}
                accessibilityLabel={name}
                disabled={busy !== null}
                hitSlop={{ top: 8, bottom: 8 }}
                onPress={() => {
                  setPaper(size);
                  setPaperSize(size);
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: selected ? colors.text : colors.border,
                  backgroundColor: selected ? colors.text : colors.card,
                }}
              >
                <Text style={{ color: selected ? '#fff' : colors.text, fontWeight: '600', fontSize: 13 }}>{name}</Text>
              </Pressable>
            );
          })}
        </View>
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
    </KeyboardAvoidingView>
  );
}

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Button, colors, Muted } from '../../ui/components';
import { ExportLockedError, exportDocx, exportPdf } from '../../services/export/export';
import { useEntitlement } from '../../services/entitlement/entitlement';
import { renderResumeHtml } from '../../domain/render/render-html';
import { useResume } from '../../services/storage/resume-store';
import { getTemplate, TEMPLATES } from '../../domain/templates/templates';

const ACCENTS = ['#1B2B47', '#3B5168', '#2A6B6E', '#6B7F5C', '#A85432', '#6B2737', '#2D2D2D', '#5B3F8C'];

export default function PreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { resume, update } = useResume(id);
  const { access } = useEntitlement();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<'pdf' | 'docx' | null>(null);

  const html = useMemo(
    () =>
      resume
        ? renderResumeHtml(resume.data, {
            templateId: resume.templateId,
            accent: resume.accent,
            mode: 'preview',
            watermark: !access.unlocked,
          })
        : '',
    [resume, access.unlocked],
  );

  if (!resume) return null;
  const template = getTemplate(resume.templateId);

  const runExport = async (kind: 'pdf' | 'docx') => {
    if (!access.unlocked) {
      router.push('/unlock');
      return;
    }
    setBusy(kind);
    try {
      if (kind === 'pdf') await exportPdf(resume, access);
      else await exportDocx(resume, access);
    } catch (error) {
      if (error instanceof ExportLockedError) router.push('/unlock');
      else Alert.alert('Export failed', error instanceof Error ? error.message : 'Please try again.');
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
                onPress={() => update(resume.id, { templateId: t.id, accent: t.defaultAccent })}
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
          {ACCENTS.map((color) => (
            <Pressable
              key={color}
              accessibilityRole="button"
              accessibilityLabel={`Accent color ${color}`}
              accessibilityState={{ selected: resume.accent === color }}
              onPress={() => update(resume.id, { accent: color })}
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
          <Button title={access.unlocked ? 'Export PDF' : 'PDF 🔒'} loading={busy === 'pdf'} onPress={() => runExport('pdf')} style={{ flex: 1 }} />
          <Button title={access.unlocked ? 'Export Word' : 'Word 🔒'} variant="secondary" loading={busy === 'docx'} onPress={() => runExport('docx')} style={{ flex: 1 }} />
        </View>
        {access.reason === 'dev-unconfigured' ? (
          <View style={{ paddingHorizontal: 16 }}>
            <Muted>Development build: exports unlocked because in-app purchases are not configured.</Muted>
          </View>
        ) : null}
      </View>
    </View>
  );
}

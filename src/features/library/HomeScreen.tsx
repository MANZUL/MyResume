import { router, Stack } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, colors, Muted, styles } from '../../ui/components';
import { TemplateThumbnail } from '../templates/TemplateCard';
import { templateHref } from '../templates/use-create-from-template';
import { SAMPLE_RESUME, SAMPLE_RESUME_LANGUAGE } from '../../domain/resume/sample-data';
import { LANGUAGE_NAMES, type Language } from '../../domain/i18n/languages';
import { useResumeStore } from '../../services/storage/resume-store';
import { TEMPLATES } from '../../domain/templates/templates';
import { templateText } from '../../i18n/templates';
import { useLocalization } from '../../services/i18n/localization';
import type { ResumeData } from '../../domain/resume/types';

export default function Home() {
  const { ready, resumes, create, remove, duplicate } = useResumeStore();
  const { t, appLanguage, formatDate } = useLocalization();

  const open = (data: ResumeData, title?: string, language?: Language) => {
    const resume = create(data, title, undefined, language);
    router.push({ pathname: '/resume/[id]', params: { id: resume.id } });
  };

  const confirmDelete = (id: string, title: string) => {
    Alert.alert(t('home.deleteTitle'), t('home.deleteBody', { title }), [
      { text: t('home.cancel'), style: 'cancel' },
      { text: t('home.delete'), style: 'destructive', onPress: () => remove(id) },
    ]);
  };

  const showActions = (id: string, title: string) => {
    Alert.alert(title, undefined, [
      {
        text: t('home.duplicate'),
        onPress: () => {
          duplicate(id);
        },
      },
      { text: t('home.delete'), style: 'destructive', onPress: () => confirmDelete(id, title) },
      { text: t('home.cancel'), style: 'cancel' },
    ]);
  };

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('home.languageA11y', { language: LANGUAGE_NAMES[appLanguage] })}
              hitSlop={10}
              onPress={() => router.push('/settings')}
            >
              <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600' }}>{LANGUAGE_NAMES[appLanguage]}</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
        data={resumes}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 8 }}>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>{t('home.headline')}</Text>
            <Muted>{t('home.subtitle')}</Muted>
            <Button title={t('home.create')} onPress={() => router.push('/templates')} accessibilityHint={t('home.createHint')} />
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
              <Button title={t('home.importText')} variant="ghost" style={{ minHeight: 40 }} onPress={() => router.push('/import')} />
              <Button
                title={t('home.trySample')}
                variant="ghost"
                style={{ minHeight: 40 }}
                // The sample is written in English, so its resume language is English.
                onPress={() => open(JSON.parse(JSON.stringify(SAMPLE_RESUME)) as ResumeData, t('resume.sample'), SAMPLE_RESUME_LANGUAGE)}
              />
            </View>

            <View style={[styles.sectionHeader, { marginTop: 4 }]}>
              <Text style={styles.sectionTitle}>{t('home.exploreTemplates')}</Text>
              <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.push('/templates')}>
                <Text style={{ color: colors.accent, fontWeight: '600' }}>{t('home.seeAll')}</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} style={{ marginHorizontal: -16 }}>
              <View style={{ width: 4 }} />
              {TEMPLATES.map((template) => {
                const text = templateText(t, template.id);
                return (
                  <Pressable
                    key={template.id}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.templateA11y', { name: text.name, category: text.category })}
                    onPress={() => router.push(templateHref(template.id))}
                    style={({ pressed }) => [{ width: 112, gap: 6 }, pressed && { opacity: 0.8 }]}
                  >
                    <TemplateThumbnail template={template} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                      {text.shortName}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>{text.category}</Text>
                  </Pressable>
                );
              })}
              <View style={{ width: 4 }} />
            </ScrollView>

            <Text style={[styles.sectionTitle, { marginTop: 12 }]}>{t('home.yourResumes')}</Text>
          </View>
        }
        ListEmptyComponent={
          <Card>
            <Muted>{t('home.empty')}</Muted>
          </Card>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityHint={t('home.openHint')}
            onPress={() => router.push({ pathname: '/resume/[id]', params: { id: item.id } })}
            onLongPress={() => showActions(item.id, item.title)}
            style={({ pressed }) => [pressed && { opacity: 0.8 }]}
          >
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, backgroundColor: item.accent }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                  {item.title}
                </Text>
                <Muted>
                  {t('home.templateAndDate', { template: templateText(t, item.templateId).name, date: formatDate(item.updatedAt) })}
                </Muted>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('home.moreActions', { title: item.title })}
                hitSlop={10}
                onPress={() => showActions(item.id, item.title)}
              >
                <Text style={{ fontSize: 22, color: colors.muted }}>⋯</Text>
              </Pressable>
            </Card>
          </Pressable>
        )}
      />
    </>
  );
}

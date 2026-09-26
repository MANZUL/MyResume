import { router } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, colors, Muted, styles } from '../../ui/components';
import { TemplateThumbnail } from '../templates/TemplateCard';
import { templateHref } from '../templates/use-create-from-template';
import { SAMPLE_RESUME } from '../../domain/resume/sample-data';
import { useResumeStore } from '../../services/storage/resume-store';
import { getTemplate, TEMPLATES } from '../../domain/templates/templates';
import type { ResumeData } from '../../domain/resume/types';

export default function Home() {
  const { ready, resumes, create, remove, duplicate } = useResumeStore();

  const open = (data: ResumeData, title?: string) => {
    const resume = create(data, title);
    router.push({ pathname: '/resume/[id]', params: { id: resume.id } });
  };

  const confirmDelete = (id: string, title: string) => {
    Alert.alert('Delete resume?', `"${title}" will be removed from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(id) },
    ]);
  };

  const showActions = (id: string, title: string) => {
    Alert.alert(title, undefined, [
      {
        text: 'Duplicate',
        onPress: () => {
          duplicate(id);
        },
      },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(id, title) },
      { text: 'Cancel', style: 'cancel' },
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
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
      data={resumes}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>Build a resume that gets read.</Text>
          <Muted>Choose one of 12 ATS-friendly templates. Works offline; your resumes stay on this device.</Muted>
          <Button title="Create your resume" onPress={() => router.push('/templates')} accessibilityHint="Choose a template first" />
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
            <Button title="Import text" variant="ghost" style={{ minHeight: 40 }} onPress={() => router.push('/import')} />
            <Button
              title="Try sample"
              variant="ghost"
              style={{ minHeight: 40 }}
              onPress={() => open(JSON.parse(JSON.stringify(SAMPLE_RESUME)) as ResumeData, 'Sample resume')}
            />
          </View>

          <View style={[styles.sectionHeader, { marginTop: 4 }]}>
            <Text style={styles.sectionTitle}>Explore templates</Text>
            <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.push('/templates')}>
              <Text style={{ color: colors.accent, fontWeight: '600' }}>See all</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} style={{ marginHorizontal: -16 }}>
            <View style={{ width: 4 }} />
            {TEMPLATES.map((t) => (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityLabel={`${t.name}, ${t.category}. Opens a larger preview.`}
                onPress={() => router.push(templateHref(t.id))}
                style={({ pressed }) => [{ width: 112, gap: 6 }, pressed && { opacity: 0.8 }]}
              >
                <TemplateThumbnail template={t} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                  {t.name.replace(/^The /, '')}
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>{t.category}</Text>
              </Pressable>
            ))}
            <View style={{ width: 4 }} />
          </ScrollView>

          <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Your resumes</Text>
        </View>
      }
      ListEmptyComponent={
        <Card>
          <Muted>No resumes yet. Tap Create your resume to pick a template, or import your existing resume text.</Muted>
        </Card>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens the editor. Long press for more actions."
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
                {getTemplate(item.templateId).name} · {new Date(item.updatedAt).toLocaleDateString()}
              </Muted>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`More actions for ${item.title}`}
              hitSlop={10}
              onPress={() => showActions(item.id, item.title)}
            >
              <Text style={{ fontSize: 22, color: colors.muted }}>⋯</Text>
            </Pressable>
          </Card>
        </Pressable>
      )}
    />
  );
}

import { router } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { Button, Card, colors, Muted, styles } from '../../ui/components';
import { SAMPLE_RESUME } from '../../domain/resume/sample-data';
import { useResumeStore } from '../../services/storage/resume-store';
import { getTemplate } from '../../domain/templates/templates';
import { emptyResume, type ResumeData } from '../../domain/resume/types';

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
          <Muted>12 ATS-friendly templates. Works offline — your resumes stay on this device.</Muted>
          <Button title="New blank resume" onPress={() => open(emptyResume(), 'Untitled resume')} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button
              title="Import text"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => router.push('/import')}
            />
            <Button
              title="Try sample"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => open(JSON.parse(JSON.stringify(SAMPLE_RESUME)) as ResumeData, 'Sample resume')}
            />
          </View>
          {resumes.length ? <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Your resumes</Text> : null}
        </View>
      }
      ListEmptyComponent={
        <Card>
          <Muted>No resumes yet. Start blank, import your existing resume text, or try the sample.</Muted>
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

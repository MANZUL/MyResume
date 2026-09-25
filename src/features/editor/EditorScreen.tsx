import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import {
  Button,
  Collapsible,
  colors,
  Field,
  Muted,
  SectionHeader,
  StringListEditor,
  styles,
} from '../../ui/components';
import { useResume } from '../../services/storage/resume-store';
import {
  emptyCertification,
  emptyEducation,
  emptyExperience,
  emptyProject,
  type ResumeData,
} from '../../domain/resume/types';

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { resume, update, ready, flush, setActive } = useResume(id);
  const resumeId = resume?.id;

  // The resume being edited is the current one; pending edits are saved when the screen loses focus.
  useFocusEffect(
    useCallback(() => {
      if (!resumeId) return undefined;
      setActive(resumeId);
      return () => {
        void flush(resumeId);
      };
    }, [resumeId, setActive, flush]),
  );

  const setData = useCallback(
    (recipe: (draft: ResumeData) => ResumeData) => {
      if (!resume) return;
      update(resume.id, { data: recipe(resume.data) });
    },
    [resume, update],
  );

  if (!ready) return null;
  if (!resume) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Muted>This resume no longer exists.</Muted>
        <Button title="Back to resumes" onPress={() => router.replace('/')} />
      </View>
    );
  }

  const data = resume.data;
  const setContact = (key: keyof ResumeData['contact'], value: string) =>
    setData((d) => ({ ...d, contact: { ...d.contact, [key]: value } }));
  const setSummary = <K extends keyof ResumeData['summary']>(key: K, value: ResumeData['summary'][K]) =>
    setData((d) => ({ ...d, summary: { ...d.summary, [key]: value } }));

  function updateItem<K extends 'experience' | 'education' | 'certifications' | 'projects'>(
    key: K,
    index: number,
    patch: Partial<ResumeData[K][number]>,
  ) {
    setData((d) => ({
      ...d,
      [key]: (d[key] as ResumeData[K][number][]).map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }
  function removeItem(key: 'experience' | 'education' | 'certifications' | 'projects', index: number) {
    setData((d) => ({ ...d, [key]: (d[key] as unknown[]).filter((_, i) => i !== index) }));
  }
  function moveItem(key: 'experience' | 'education' | 'certifications' | 'projects', index: number, delta: -1 | 1) {
    setData((d) => {
      const list = [...(d[key] as unknown[])];
      const target = index + delta;
      if (target < 0 || target >= list.length) return d;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...d, [key]: list };
    });
  }

  const itemControls = (key: 'experience' | 'education' | 'certifications' | 'projects', index: number, count: number) => (
    <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'flex-end', marginTop: 4 }}>
      {index > 0 ? <LinkButton label="Move up" onPress={() => moveItem(key, index, -1)} /> : null}
      {index < count - 1 ? <LinkButton label="Move down" onPress={() => moveItem(key, index, 1)} /> : null}
      <LinkButton label="Remove" danger onPress={() => removeItem(key, index)} />
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: resume.title || 'Edit',
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <LinkButton label="Tools" onPress={() => router.push({ pathname: '/resume/[id]/tools', params: { id: resume.id } })} />
              <LinkButton label="Preview" bold onPress={() => router.push({ pathname: '/resume/[id]/preview', params: { id: resume.id } })} />
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Field label="Resume title (only you see this)" value={resume.title} onChangeText={(title) => update(resume.id, { title })} />

          <Collapsible title="Personal details" subtitle={data.name || 'Name and contact'} initiallyOpen={!data.name}>
            <Field label="Full name" value={data.name} onChangeText={(name) => setData((d) => ({ ...d, name }))} textContentType="name" autoComplete="name" />
            <Field label="Email" value={data.contact.email} onChangeText={(v) => setContact('email', v)} keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" autoComplete="email" />
            <Field label="Phone" value={data.contact.phone} onChangeText={(v) => setContact('phone', v)} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" />
            <Field label="Location" value={data.contact.location} onChangeText={(v) => setContact('location', v)} placeholder="City, State" />
            <Field label="LinkedIn" value={data.contact.linkedin} onChangeText={(v) => setContact('linkedin', v)} autoCapitalize="none" keyboardType="url" />
            <Field label="Website" value={data.contact.website} onChangeText={(v) => setContact('website', v)} autoCapitalize="none" keyboardType="url" />
          </Collapsible>

          <Collapsible title="Summary & skills" subtitle={data.summary.tagline || 'Headline, highlights, skills'}>
            <Field label="Headline" value={data.summary.tagline} onChangeText={(v) => setSummary('tagline', v)} multiline />
            <StringListEditor label="Highlights" items={data.summary.bullets} onChange={(v) => setSummary('bullets', v)} addLabel="Add highlight" />
            <StringListEditor label="Skills" items={data.summary.skills} onChange={(v) => setSummary('skills', v)} addLabel="Add skill" />
          </Collapsible>

          <SectionHeader
            title={`Experience (${data.experience.length})`}
            action={<LinkButton label="+ Add" onPress={() => setData((d) => ({ ...d, experience: [...d.experience, emptyExperience()] }))} />}
          />
          {data.experience.map((exp, index) => (
            <Collapsible key={index} title={exp.title || 'New role'} subtitle={[exp.company, [exp.start, exp.end].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')} initiallyOpen={!exp.title}>
              <Field label="Job title" value={exp.title} onChangeText={(v) => updateItem('experience', index, { title: v })} />
              <Field label="Company" value={exp.company} onChangeText={(v) => updateItem('experience', index, { company: v })} />
              <Field label="Location" value={exp.location} onChangeText={(v) => updateItem('experience', index, { location: v })} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Start" value={exp.start} placeholder="Mar 2020" onChangeText={(v) => updateItem('experience', index, { start: v })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="End" value={exp.end} placeholder="Present" onChangeText={(v) => updateItem('experience', index, { end: v })} />
                </View>
              </View>
              <Field label="Role summary (optional)" value={exp.summary} multiline onChangeText={(v) => updateItem('experience', index, { summary: v })} />
              <StringListEditor label="Achievements" items={exp.bullets} onChange={(v) => updateItem('experience', index, { bullets: v })} addLabel="Add bullet" placeholder="Start with an action verb and a result" />
              {itemControls('experience', index, data.experience.length)}
            </Collapsible>
          ))}

          <SectionHeader
            title={`Education (${data.education.length})`}
            action={<LinkButton label="+ Add" onPress={() => setData((d) => ({ ...d, education: [...d.education, emptyEducation()] }))} />}
          />
          {data.education.map((edu, index) => (
            <Collapsible key={index} title={edu.degree || 'New education'} subtitle={edu.school} initiallyOpen={!edu.degree}>
              <Field label="Degree / program" value={edu.degree} onChangeText={(v) => updateItem('education', index, { degree: v })} />
              <Field label="School" value={edu.school} onChangeText={(v) => updateItem('education', index, { school: v })} />
              <Field label="Location" value={edu.location} onChangeText={(v) => updateItem('education', index, { location: v })} />
              <Field label="Date" value={edu.date} onChangeText={(v) => updateItem('education', index, { date: v })} />
              <Field label="Honors (optional)" value={edu.honors} onChangeText={(v) => updateItem('education', index, { honors: v })} />
              {itemControls('education', index, data.education.length)}
            </Collapsible>
          ))}

          <SectionHeader
            title={`Certifications (${data.certifications.length})`}
            action={<LinkButton label="+ Add" onPress={() => setData((d) => ({ ...d, certifications: [...d.certifications, emptyCertification()] }))} />}
          />
          {data.certifications.map((cert, index) => (
            <Collapsible key={index} title={cert.name || 'New certification'} subtitle={cert.org} initiallyOpen={!cert.name}>
              <Field label="Name" value={cert.name} onChangeText={(v) => updateItem('certifications', index, { name: v })} />
              <Field label="Issuing organization" value={cert.org} onChangeText={(v) => updateItem('certifications', index, { org: v })} />
              <Field label="Date" value={cert.date} onChangeText={(v) => updateItem('certifications', index, { date: v })} />
              {itemControls('certifications', index, data.certifications.length)}
            </Collapsible>
          ))}

          <SectionHeader
            title={`Projects (${data.projects.length})`}
            action={<LinkButton label="+ Add" onPress={() => setData((d) => ({ ...d, projects: [...d.projects, emptyProject()] }))} />}
          />
          {data.projects.map((project, index) => (
            <Collapsible key={index} title={project.name || 'New project'} subtitle={project.description} initiallyOpen={!project.name}>
              <Field label="Project name" value={project.name} onChangeText={(v) => updateItem('projects', index, { name: v })} />
              <Field label="Short description" value={project.description} onChangeText={(v) => updateItem('projects', index, { description: v })} />
              <StringListEditor label="Details" items={project.bullets} onChange={(v) => updateItem('projects', index, { bullets: v })} addLabel="Add bullet" />
              {itemControls('projects', index, data.projects.length)}
            </Collapsible>
          ))}

          <SectionHeader title="Awards" />
          <View style={styles.card}>
            <StringListEditor label="Awards & honors" items={data.awards} onChange={(awards) => setData((d) => ({ ...d, awards }))} addLabel="Add award" />
          </View>

          <Button
            title="Preview & export"
            onPress={() => router.push({ pathname: '/resume/[id]/preview', params: { id: resume.id } })}
            style={{ marginTop: 12 }}
          />
          <Text style={[styles.muted, { textAlign: 'center' }]}>Changes save automatically on this device.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function LinkButton({ label, onPress, danger, bold }: { label: string; onPress: () => void; danger?: boolean; bold?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text style={{ color: danger ? colors.danger : colors.accent, fontSize: 16, fontWeight: bold ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

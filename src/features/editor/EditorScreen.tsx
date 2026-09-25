import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
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
import { applyListOp, useStableKeys, type ListOp } from '../../ui/entry-keys';
import { useResume } from '../../services/storage/resume-store';
import { parseSectionParam, SECTION_TITLES, type EditorSection } from '../../domain/resume/sections';
import {
  emptyCertification,
  emptyEducation,
  emptyExperience,
  emptyProject,
  type ResumeData,
} from '../../domain/resume/types';
import { EDITOR_COPY as COPY } from './editor-copy';

type ListKey = 'experience' | 'education' | 'certifications' | 'projects';
const EMPTY_ITEM: { [K in ListKey]: () => ResumeData[K][number] } = {
  experience: emptyExperience,
  education: emptyEducation,
  certifications: emptyCertification,
  projects: emptyProject,
};

export default function EditorScreen() {
  // `section` + `jump` come from Resume Check's "Improve" link (a new `jump` each time).
  const { id, section, jump } = useLocalSearchParams<{ id: string; section?: string; jump?: string }>();
  const { resume, update, ready, flush, setActive } = useResume(id);
  const resumeId = resume?.id;
  const data = resume?.data;

  // UI-only stable keys: resume data has no ids, and none are added.
  const [experienceKeys, applyExperience] = useStableKeys(data?.experience.length ?? 0);
  const [educationKeys, applyEducation] = useStableKeys(data?.education.length ?? 0);
  const [certificationKeys, applyCertifications] = useStableKeys(data?.certifications.length ?? 0);
  const [projectKeys, applyProjects] = useStableKeys(data?.projects.length ?? 0);
  const keysOf: Record<ListKey, string[]> = {
    experience: experienceKeys,
    education: educationKeys,
    certifications: certificationKeys,
    projects: projectKeys,
  };
  const applyKeys: Record<ListKey, (op: ListOp) => void> = {
    experience: applyExperience,
    education: applyEducation,
    certifications: applyCertifications,
    projects: applyProjects,
  };

  // Collapsibles opened by a jump: 'personal', 'summary' or entry keys.
  const [forcedOpen, setForcedOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [handledJump, setHandledJump] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<{ section: EditorSection; jump: string } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Section positions, written by onLayout and read when scrolling (never during render).
  const [anchors] = useState(() => {
    const y: Partial<Record<EditorSection, number>> = {};
    const handlers = {} as Record<EditorSection, (event: LayoutChangeEvent) => void>;
    return {
      y,
      onLayout: (name: EditorSection) =>
        (handlers[name] ??= (event: LayoutChangeEvent) => {
          y[name] = event.nativeEvent.layout.y;
        }),
    };
  });

  // A new jump request opens the target section. State is adjusted during render
  // (React's pattern for reacting to new props), so it opens in the same frame;
  // the effect below then scrolls to it.
  const target = parseSectionParam(section);
  const jumpToken = typeof jump === 'string' && jump ? jump : null;
  if (data && target && jumpToken && jumpToken !== handledJump) {
    setHandledJump(jumpToken);
    setForcedOpen(new Set(target === 'personal' || target === 'summary' ? [target] : target === 'awards' ? [] : keysOf[target]));
    setScrollTarget({ section: target, jump: jumpToken });
  }

  useEffect(() => {
    if (!scrollTarget) return undefined;
    // One layout pass for the opened sections, then bring the section header to the top.
    const timer = setTimeout(() => {
      const y = anchors.y[scrollTarget.section];
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [scrollTarget, anchors]);

  const anchor = anchors.onLayout;
  const openProps = (collapsibleId: string) => ({
    open: forcedOpen.has(collapsibleId) ? true : undefined,
    onOpenChange: (open: boolean) => {
      if (open || !forcedOpen.has(collapsibleId)) return;
      setForcedOpen((current) => {
        const next = new Set(current);
        next.delete(collapsibleId);
        return next;
      });
    },
  });

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
  if (!resume || !data) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Muted>This resume no longer exists.</Muted>
        <Button title="Back to resumes" onPress={() => router.replace('/')} />
      </View>
    );
  }

  const setContact = (key: keyof ResumeData['contact'], value: string) =>
    setData((d) => ({ ...d, contact: { ...d.contact, [key]: value } }));
  const setSummary = <K extends keyof ResumeData['summary']>(key: K, value: ResumeData['summary'][K]) =>
    setData((d) => ({ ...d, summary: { ...d.summary, [key]: value } }));

  function updateItem<K extends ListKey>(key: K, index: number, patch: Partial<ResumeData[K][number]>) {
    setData((d) => ({
      ...d,
      [key]: (d[key] as ResumeData[K][number][]).map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }
  /** Adds, removes or moves an entry; its key moves with it (same operation on both). */
  function changeList(key: ListKey, op: ListOp) {
    applyKeys[key](op);
    setData((d) => ({ ...d, [key]: applyListOp(d[key] as unknown[], op, EMPTY_ITEM[key]) }));
  }

  const itemControls = (key: ListKey, index: number, count: number) => (
    <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'flex-end', marginTop: 4 }}>
      {index > 0 ? <LinkButton label="Move up" onPress={() => changeList(key, { type: 'move', from: index, to: index - 1 })} /> : null}
      {index < count - 1 ? <LinkButton label="Move down" onPress={() => changeList(key, { type: 'move', from: index, to: index + 1 })} /> : null}
      <LinkButton label="Remove" danger onPress={() => changeList(key, { type: 'remove', index })} />
    </View>
  );
  const listHeader = (key: ListKey) => (
    <View onLayout={anchor(key)}>
      <SectionHeader
        title={`${SECTION_TITLES[key]} (${data[key].length})`}
        action={<LinkButton label="+ Add" onPress={() => changeList(key, { type: 'add' })} />}
      />
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
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Field label="Resume title (only you see this)" value={resume.title} onChangeText={(title) => update(resume.id, { title })} />

          <View onLayout={anchor('personal')}>
            <Collapsible title={SECTION_TITLES.personal} subtitle={data.name || 'Name and contact'} initiallyOpen={!data.name} {...openProps('personal')}>
              <Field label={COPY.personal.name} value={data.name} onChangeText={(name) => setData((d) => ({ ...d, name }))} textContentType="name" autoComplete="name" />
              <Field label={COPY.personal.email} value={data.contact.email} onChangeText={(v) => setContact('email', v)} keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" autoComplete="email" />
              <Field label={COPY.personal.phone} value={data.contact.phone} onChangeText={(v) => setContact('phone', v)} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" />
              <Field label={COPY.personal.location} value={data.contact.location} onChangeText={(v) => setContact('location', v)} placeholder="City, State" />
              <Field label={COPY.personal.linkedin} value={data.contact.linkedin} onChangeText={(v) => setContact('linkedin', v)} autoCapitalize="none" keyboardType="url" />
              <Field label={COPY.personal.website} value={data.contact.website} onChangeText={(v) => setContact('website', v)} autoCapitalize="none" keyboardType="url" />
            </Collapsible>
          </View>

          <View onLayout={anchor('summary')}>
            <Collapsible title={SECTION_TITLES.summary} subtitle={data.summary.tagline || 'Tagline, summary bullets, skills'} {...openProps('summary')}>
              <Field label={COPY.summary.tagline} value={data.summary.tagline} onChangeText={(v) => setSummary('tagline', v)} multiline />
              <StringListEditor label={COPY.summary.bullets} items={data.summary.bullets} onChange={(v) => setSummary('bullets', v)} placeholder={COPY.summary.bulletsPlaceholder} addLabel={COPY.summary.bulletsAdd} />
              <StringListEditor label={COPY.summary.skills} items={data.summary.skills} onChange={(v) => setSummary('skills', v)} placeholder={COPY.summary.skillsPlaceholder} addLabel={COPY.summary.skillsAdd} />
            </Collapsible>
          </View>

          {listHeader('experience')}
          {data.experience.map((exp, index) => (
            <Collapsible key={experienceKeys[index]} title={exp.title || 'New role'} subtitle={[exp.company, [exp.start, exp.end].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')} initiallyOpen={!exp.title} {...openProps(experienceKeys[index])}>
              <Field label={COPY.experience.title} value={exp.title} onChangeText={(v) => updateItem('experience', index, { title: v })} />
              <Field label={COPY.experience.company} value={exp.company} onChangeText={(v) => updateItem('experience', index, { company: v })} />
              <Field label={COPY.experience.location} value={exp.location} onChangeText={(v) => updateItem('experience', index, { location: v })} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label={COPY.experience.start} value={exp.start} placeholder="Mar 2020" onChangeText={(v) => updateItem('experience', index, { start: v })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label={COPY.experience.end} value={exp.end} placeholder="Present" onChangeText={(v) => updateItem('experience', index, { end: v })} />
                </View>
              </View>
              <Field label={COPY.experience.summary} value={exp.summary} multiline onChangeText={(v) => updateItem('experience', index, { summary: v })} />
              <StringListEditor label={COPY.experience.bullets} items={exp.bullets} onChange={(v) => updateItem('experience', index, { bullets: v })} addLabel={COPY.experience.bulletsAdd} placeholder="Start with an action verb and a result" />
              {itemControls('experience', index, data.experience.length)}
            </Collapsible>
          ))}

          {listHeader('education')}
          {data.education.map((edu, index) => (
            <Collapsible key={educationKeys[index]} title={edu.degree || 'New education'} subtitle={edu.school} initiallyOpen={!edu.degree} {...openProps(educationKeys[index])}>
              <Field label={COPY.education.degree} value={edu.degree} onChangeText={(v) => updateItem('education', index, { degree: v })} />
              <Field label={COPY.education.school} value={edu.school} onChangeText={(v) => updateItem('education', index, { school: v })} />
              <Field label={COPY.education.location} value={edu.location} onChangeText={(v) => updateItem('education', index, { location: v })} />
              <Field label={COPY.education.date} value={edu.date} onChangeText={(v) => updateItem('education', index, { date: v })} />
              <Field label={COPY.education.honors} value={edu.honors} onChangeText={(v) => updateItem('education', index, { honors: v })} />
              {itemControls('education', index, data.education.length)}
            </Collapsible>
          ))}

          {listHeader('certifications')}
          {data.certifications.map((cert, index) => (
            <Collapsible key={certificationKeys[index]} title={cert.name || 'New certification'} subtitle={cert.org} initiallyOpen={!cert.name} {...openProps(certificationKeys[index])}>
              <Field label={COPY.certifications.name} value={cert.name} onChangeText={(v) => updateItem('certifications', index, { name: v })} />
              <Field label={COPY.certifications.org} value={cert.org} onChangeText={(v) => updateItem('certifications', index, { org: v })} />
              <Field label={COPY.certifications.date} value={cert.date} onChangeText={(v) => updateItem('certifications', index, { date: v })} />
              {itemControls('certifications', index, data.certifications.length)}
            </Collapsible>
          ))}

          {listHeader('projects')}
          {data.projects.map((project, index) => (
            <Collapsible key={projectKeys[index]} title={project.name || 'New project'} subtitle={project.description} initiallyOpen={!project.name} {...openProps(projectKeys[index])}>
              <Field label={COPY.projects.name} value={project.name} onChangeText={(v) => updateItem('projects', index, { name: v })} />
              <Field label={COPY.projects.description} value={project.description} onChangeText={(v) => updateItem('projects', index, { description: v })} />
              <StringListEditor label={COPY.projects.bullets} items={project.bullets} onChange={(v) => updateItem('projects', index, { bullets: v })} placeholder={COPY.projects.bulletsPlaceholder} addLabel={COPY.projects.bulletsAdd} />
              {itemControls('projects', index, data.projects.length)}
            </Collapsible>
          ))}

          <View onLayout={anchor('awards')}>
            <SectionHeader title={SECTION_TITLES.awards} />
          </View>
          <View style={styles.card}>
            <StringListEditor label={COPY.awards.list} items={data.awards} onChange={(awards) => setData((d) => ({ ...d, awards }))} placeholder={COPY.awards.placeholder} addLabel={COPY.awards.add} />
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

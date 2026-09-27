import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { colors } from '../../ui/components';
import { useResume } from '../../services/storage/resume-store';
import { AtsTool } from '../ats/AtsTool';
import { CheckTool } from '../check/CheckTool';
import { improveHref } from '../check/improve-link';
import { LetterTool } from '../cover-letter/LetterTool';
import { MatchTool } from '../job-match/MatchTool';
import { useT } from '../../services/i18n/localization';

type Tool = 'check' | 'ats' | 'match' | 'letter';

// All tools are deterministic and run on-device. No AI, no network.
export default function ToolsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { resume } = useResume(id);
  const [tool, setTool] = useState<Tool>('check');
  const t = useT();

  if (!resume) return null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', backgroundColor: '#E7E4DE', borderRadius: 12, padding: 3 }} accessibilityRole="tablist">
          {(['check', 'ats', 'match', 'letter'] as const).map((key) => (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: tool === key }}
              onPress={() => setTool(key)}
              style={{
                flex: 1,
                paddingVertical: 9,
                borderRadius: 10,
                alignItems: 'center',
                backgroundColor: tool === key ? colors.card : 'transparent',
              }}
            >
              <Text style={{ fontWeight: '600', color: colors.text }}>{t(`tools.tabs.${key}`)}</Text>
            </Pressable>
          ))}
        </View>
        {tool === 'check' ? (
          // "Improve" returns to the editor below this screen, opened on the warning's section.
          <CheckTool data={resume.data} language={resume.language} onImprove={(section) => router.dismissTo(improveHref(resume.id, section, Date.now()))} />
        ) : null}
        {tool === 'ats' ? (
          <AtsTool data={resume.data} templateId={resume.templateId} language={resume.language} onImprove={(section) => router.dismissTo(improveHref(resume.id, section, Date.now()))} />
        ) : null}
        {tool === 'match' ? <MatchTool resumeId={resume.id} data={resume.data} language={resume.language} /> : null}
        {tool === 'letter' ? <LetterTool data={resume.data} language={resume.language} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

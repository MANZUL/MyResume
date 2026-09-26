import { router } from 'expo-router';
import { Image, Pressable, Text, View, type ViewStyle } from 'react-native';
import { Button, colors } from '../../ui/components';
import type { TemplateConfig } from '../../domain/templates/templates';
import { THUMBNAIL_ASPECT, thumbnailFor } from './thumbnails';
import { templateHref } from './use-create-from-template';

export function TemplateThumbnail({ template, style }: { template: TemplateConfig; style?: ViewStyle }) {
  const source = thumbnailFor(template.id);
  return (
    <View
      style={[
        {
          aspectRatio: THUMBNAIL_ASPECT,
          backgroundColor: '#fff',
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {source ? <Image source={source} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
    </View>
  );
}

export function CategoryTag({ label }: { label: string }) {
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: '#ECE9E3', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: colors.muted, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}

/** Gallery card: tap to see the large preview; "Use this template" creates the resume. */
export function TemplateCard({ template, onUse }: { template: TemplateConfig; onUse: (templateId: string) => void }) {
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${template.name}, ${template.category}. Opens a larger preview.`}
        onPress={() => router.push(templateHref(template.id))}
        style={({ pressed }) => [{ gap: 8 }, pressed && { opacity: 0.8 }]}
      >
        <TemplateThumbnail template={template} />
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }} numberOfLines={1}>
            {template.name}
          </Text>
          <CategoryTag label={template.category} />
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 16 }} numberOfLines={2}>
            {template.description}
          </Text>
        </View>
      </Pressable>
      <Button
        title="Use this template"
        variant="secondary"
        style={{ minHeight: 40, paddingHorizontal: 12 }}
        accessibilityHint={`Creates a new resume with ${template.name}`}
        onPress={() => onUse(template.id)}
      />
    </View>
  );
}

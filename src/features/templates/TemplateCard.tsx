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

/** Every template's text layer is machine-readable (checked by the ATS Readability tests). */
export function AtsReadyBadge() {
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: '#E6F2EA', borderWidth: 1, borderColor: '#CFE6D7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: colors.success, textTransform: 'uppercase' }}>ATS Ready</Text>
    </View>
  );
}

/** Gallery card: tap to see the large preview; "Use template" creates the resume. */
export function TemplateCard({ template, onUse }: { template: TemplateConfig; onUse: (templateId: string) => void }) {
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${template.name}, ${template.category}. Opens a larger preview.`}
        onPress={() => router.push(templateHref(template.id))}
        style={({ pressed }) => [{ gap: 8 }, pressed && { opacity: 0.8 }]}
      >
        <View>
          <TemplateThumbnail template={template} />
          <View style={{ position: 'absolute', top: 6, left: 6 }}>
            <AtsReadyBadge />
          </View>
        </View>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }} numberOfLines={1}>
            {template.name}
          </Text>
          <CategoryTag label={template.category} />
        </View>
      </Pressable>
      <Button
        title="Use template"
        variant="secondary"
        fit
        style={{ minHeight: 40, paddingHorizontal: 12 }}
        accessibilityHint={`Creates a new resume with ${template.name}`}
        onPress={() => onUse(template.id)}
      />
    </View>
  );
}

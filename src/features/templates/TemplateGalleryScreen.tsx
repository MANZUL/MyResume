import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { colors, Muted } from '../../ui/components';
import { TEMPLATE_CATEGORIES, TEMPLATES, type TemplateCategory } from '../../domain/templates/templates';
import { TemplateCard } from './TemplateCard';
import { useCreateFromTemplate } from './use-create-from-template';

type Filter = 'All' | TemplateCategory;
const FILTERS: readonly Filter[] = ['All', ...TEMPLATE_CATEGORIES];

export default function TemplateGalleryScreen() {
  const [filter, setFilter] = useState<Filter>('All');
  const startFromTemplate = useCreateFromTemplate();
  const templates = useMemo(() => (filter === 'All' ? TEMPLATES : TEMPLATES.filter((t) => t.category === filter)), [filter]);

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      data={templates}
      keyExtractor={(t) => t.id}
      numColumns={2}
      columnWrapperStyle={{ gap: 14 }}
      contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 48 }}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Muted>Pick a design to start. You can switch templates any time from Preview.</Muted>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {FILTERS.map((f) => {
              const selected = f === filter;
              return (
                <Pressable
                  key={f}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setFilter(f)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? colors.text : colors.border,
                    backgroundColor: selected ? colors.text : colors.card,
                  }}
                >
                  <Text style={{ color: selected ? '#fff' : colors.text, fontWeight: '600' }}>{f}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      }
      renderItem={({ item, index }) => (
        <>
          <TemplateCard template={item} onUse={startFromTemplate} />
          {/* Keep a lone last card at half width. */}
          {index === templates.length - 1 && templates.length % 2 === 1 ? <View style={{ flex: 1 }} /> : null}
        </>
      )}
    />
  );
}

import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useStableKeys } from './entry-keys';

/** Shown in an empty string list (web editor copy). */
export const EMPTY_LIST_HINT = 'Nothing added. Leave this empty if you do not need it.';

export const colors = {
  bg: '#F4F2EE',
  card: '#FFFFFF',
  text: '#16181D',
  muted: '#6B6F76',
  border: '#E2DFD8',
  primary: '#16181D',
  primaryText: '#FFFFFF',
  accent: '#A85432',
  danger: '#B3261E',
  success: '#2E7D4F',
  warn: '#9A6700',
};

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        pressed && { opacity: 0.75 },
        isDisabled && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.primaryText : colors.text} />
      ) : (
        <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#A3A6AC"
        accessibilityLabel={label}
        {...props}
        style={[styles.input, props.multiline && styles.multiline, props.style]}
      />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

/**
 * Uncontrolled by default (`initiallyOpen`). Pass `open` (and `onOpenChange`) to
 * control it, e.g. to open a section from outside.
 */
export function Collapsible({
  title,
  subtitle,
  initiallyOpen = false,
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  title: string;
  subtitle?: string;
  initiallyOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(initiallyOpen);
  const open = controlledOpen ?? internalOpen;
  const toggle = () => {
    // Internal state follows every toggle, so it is correct if control is released later.
    setInternalOpen(!open);
    onOpenChange?.(!open);
  };
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        style={styles.collapsibleHeader}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.collapsibleTitle}>{title}</Text>
          {subtitle ? <Text style={styles.muted} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <Text style={styles.chevron}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open ? <View style={{ marginTop: 12 }}>{children}</View> : null}
    </Card>
  );
}

/** Edits a list of strings (bullets, skills, awards) one line per item. */
export function StringListEditor({
  label,
  items,
  onChange,
  placeholder,
  addLabel = 'Add',
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
}) {
  // Stable row keys, so deleting a row keeps focus and input state on the right rows.
  const [keys, applyKeys] = useStableKeys(items.length);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {items.length === 0 ? <Text style={styles.emptyHint}>{EMPTY_LIST_HINT}</Text> : null}
      {items.map((item, index) => (
        <View key={keys[index]} style={styles.listRow}>
          <TextInput
            value={item}
            multiline
            placeholder={placeholder}
            placeholderTextColor="#A3A6AC"
            accessibilityLabel={`${label} ${index + 1}`}
            onChangeText={(text) => onChange(items.map((v, i) => (i === index ? text : v)))}
            style={[styles.input, { flex: 1 }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${label} ${index + 1}`}
            onPress={() => {
              applyKeys({ type: 'remove', index });
              onChange(items.filter((_, i) => i !== index));
            }}
            hitSlop={8}
            style={styles.removeButton}
          >
            <Text style={{ color: colors.danger, fontSize: 18 }}>×</Text>
          </Pressable>
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          applyKeys({ type: 'add' });
          onChange([...items, '']);
        }}
        style={styles.addRow}
      >
        <Text style={styles.addText}>+ {addLabel}</Text>
      </Pressable>
    </View>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 999,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button_primary: { backgroundColor: colors.primary },
  button_secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  button_ghost: { backgroundColor: 'transparent' },
  button_danger: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger },
  buttonText: { fontSize: 16, fontWeight: '600' },
  buttonText_primary: { color: colors.primaryText },
  buttonText_secondary: { color: colors.text },
  buttonText_ghost: { color: colors.text },
  buttonText_danger: { color: colors.danger },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  input: {
    backgroundColor: '#FAF9F7',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.6, textTransform: 'uppercase' },
  collapsibleHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 },
  collapsibleTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  chevron: { fontSize: 24, color: colors.muted, width: 24, textAlign: 'center' },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  removeButton: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  addRow: { paddingVertical: 8 },
  emptyHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  addText: { color: colors.accent, fontWeight: '600', fontSize: 15 },
});

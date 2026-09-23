import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Card } from './ui';
import { useColors } from '../lib/theme';

/**
 * The grouped list the account screens are built from.
 *
 * One card per section with hairlines between the rows, rather than a card
 * per row: a section is a single object with parts, and six separate cards
 * read as six unrelated things that happen to be stacked.
 */
export function SettingsGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const c = useColors();

  return (
    <View style={{ gap: 8 }}>
      {title && (
        <Text
          style={{
            color: c.text.tertiary,
            fontSize: 13,
            fontWeight: '600',
            paddingHorizontal: 4,
          }}
        >
          {title}
        </Text>
      )}
      <Card style={{ paddingHorizontal: 16 }}>{children}</Card>
    </View>
  );
}

/**
 * One row. Tappable with a chevron when it leads somewhere, inert when it is
 * only reporting a value.
 */
export function SettingsRow({
  icon,
  label,
  value,
  onPress,
  last = false,
  accessibilityHint,
}: {
  /** A glyph, or a drawn icon. */
  icon?: React.ReactNode;
  label: string;
  /** Shown right-aligned, for rows that state something. */
  value?: string;
  onPress?: () => void;
  /** Drops the hairline, so the group does not end in a stray line. */
  last?: boolean;
  accessibilityHint?: string;
}) {
  const c = useColors();

  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 16,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.glass.DEFAULT,
      }}
    >
      {icon && (
        <View style={{ width: 24, alignItems: 'center' }}>
          {typeof icon === 'string' ? <Text style={{ fontSize: 17 }}>{icon}</Text> : icon}
        </View>
      )}

      <Text style={{ flex: 1, color: c.text.primary, fontSize: 16 }}>{label}</Text>

      {value !== undefined && (
        <Text style={{ color: c.text.secondary, fontSize: 15, fontWeight: '600' }}>{value}</Text>
      )}

      {onPress && (
        <Text style={{ color: c.text.tertiary, fontSize: 20, lineHeight: 22 }}>›</Text>
      )}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={accessibilityHint}
    >
      {body}
    </Pressable>
  );
}

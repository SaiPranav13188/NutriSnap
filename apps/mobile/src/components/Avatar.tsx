import { Text, View } from 'react-native';
import { useColors } from '../lib/theme';

/**
 * Initials from whatever the account happens to carry.
 *
 * A name gives two letters, an email gives one. The email is cut at the @
 * first, because "S" is a plausible initial and "SG" — from
 * "sai@gmail.com" — is the mail provider, which is nobody's initial.
 */
export function initialsFrom(nameOrEmail: string | null | undefined): string {
  const raw = (nameOrEmail ?? '').trim();
  if (raw === '') return '?';

  const local = raw.includes('@') ? (raw.split('@')[0] ?? raw) : raw;
  const words = local.split(/[\s._-]+/).filter((word) => word.length > 0);
  const letters = words
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('');

  return (letters || local[0] || '?').toUpperCase();
}

/**
 * The initials disc.
 *
 * Shared by the Profile tab and the Profile screen's header so the same
 * person is the same colour and the same two letters in both places — the tab
 * is meant to read as a small copy of the card, not as a separate badge.
 */
export function Avatar({
  name,
  size = 40,
  muted = false,
}: {
  name: string | null | undefined;
  size?: number;
  /** Drawn faded, for the tab that is not currently selected. */
  muted?: boolean;
}) {
  const c = useColors();

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: muted ? c.glass.strong : c.accent.cyan,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          // The cyan fill is light in both themes, so the letters stay dark
          // against it rather than following the text colour.
          color: muted ? c.text.tertiary : '#07090C',
          fontSize: size * 0.4,
          fontWeight: '700',
          letterSpacing: 0.3,
        }}
      >
        {initialsFrom(name)}
      </Text>
    </View>
  );
}

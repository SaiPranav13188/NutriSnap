import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { canPushRollover, describeRollover, quoteRollover } from '@nutrisnap/core';
import { api, ApiError, type DayRollover } from '../lib/api';
import { useColors } from '../lib/theme';

/**
 * Carry a day's unspent calories into the next one.
 *
 * Only on a tap. Nothing rolls over by itself: a target that quietly grew
 * overnight would stop being a target, and the user would lose track of what
 * their actual plan was.
 *
 * The amount shown here is a preview. The server recomputes it from the day's
 * own rows when the button is pressed, so what gets stored cannot be whatever
 * the client happened to be displaying.
 */

interface RolloverBoxProps {
  date: string;
  consumed: number;
  /** The plain daily target, before anything carried in. */
  target: number;
  rollover: DayRollover;
  onChange: () => void;
  onError: (message: string) => void;
}

export function RolloverBox({
  date,
  consumed,
  target,
  rollover,
  onChange,
  onError,
}: RolloverBoxProps) {
  const c = useColors();
  const [busy, setBusy] = useState(false);

  const quote = quoteRollover({ consumed, target });
  const canPush = canPushRollover({ date, alreadyPushed: rollover.already_pushed, quote });
  const description = describeRollover({
    date,
    alreadyPushed: rollover.already_pushed,
    pushedAmount: rollover.pushed_out_kcal,
    quote,
  });

  async function push() {
    if (busy) return;
    setBusy(true);
    try {
      await api.pushRollover(date);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onChange();
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'Could not carry those over.');
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (busy) return;
    setBusy(true);
    try {
      await api.undoRollover(date);
      void Haptics.selectionAsync();
      onChange();
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'Could not undo that.');
    } finally {
      setBusy(false);
    }
  }

  const pushed = rollover.already_pushed;

  return (
    <View
      style={{
        alignSelf: 'stretch',
        padding: 14,
        borderRadius: 18,
        backgroundColor: c.glass.DEFAULT,
        gap: 10,
      }}
    >
      {rollover.carried_in_kcal > 0 && (
        // Say where an unusual allowance came from, rather than letting the
        // ring silently read higher than the plan.
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 12 }}>{'↓'}</Text>
          <Text style={{ color: c.accent.cyan, fontSize: 12, fontWeight: '600' }}>
            +{rollover.carried_in_kcal} kcal carried in from yesterday
          </Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.text.primary, fontSize: 14, fontWeight: '600' }}>
            {pushed ? 'Carried over' : 'Leftover calories'}
          </Text>
          <Text style={{ color: c.text.tertiary, fontSize: 12, lineHeight: 17 }}>
            {description}
          </Text>
        </View>

        {pushed ? (
          <Pressable
            onPress={() => void undo()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Undo carrying these calories over"
            style={{
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: c.glass.border,
              opacity: busy ? 0.5 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={c.text.secondary} />
            ) : (
              <Text style={{ color: c.text.secondary, fontSize: 13, fontWeight: '600' }}>
                Undo
              </Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void push()}
            disabled={!canPush || busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canPush || busy }}
            accessibilityLabel={`Carry ${quote.amount} calories into the next day`}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: canPush ? c.accent.lime : c.glass.DEFAULT,
              borderWidth: canPush ? 0 : 1,
              borderColor: c.glass.border,
              opacity: busy ? 0.5 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={c.base['900']} />
            ) : (
              <Text
                style={{
                  color: canPush ? c.base['900'] : c.text.tertiary,
                  fontSize: 13,
                  fontWeight: '700',
                }}
              >
                Push {quote.amount > 0 ? `${quote.amount} ` : ''}to tomorrow
              </Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

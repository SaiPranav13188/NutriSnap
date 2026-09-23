import { useCallback, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { flushPending, pendingCount } from '../lib/pendingLogs';
import { useColors } from '../lib/theme';

/**
 * Meals saved while there was no signal, and the state of getting them up.
 *
 * A queue the user cannot see is a queue they cannot trust. The point of this
 * strip is not the retry button — the flush happens on its own — it is being
 * able to look at the screen and know the meal you logged in the restaurant
 * basement is still going to count.
 */
export function PendingLogsBanner({ onSynced }: { onSynced: () => void }) {
  const c = useColors();
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const sync = useCallback(async () => {
    const waiting = await pendingCount();
    if (waiting === 0) {
      setCount(0);
      return;
    }

    setBusy(true);
    try {
      const { sent, left } = await flushPending();
      setCount(left);
      // Only bother the screen when something actually landed.
      if (sent > 0) onSynced();
    } finally {
      setBusy(false);
    }
  }, [onSynced]);

  // Coming back to the tab is the most likely moment for the signal to have
  // returned, and the cheapest place to notice.
  useFocusEffect(
    useCallback(() => {
      void sync();
    }, [sync]),
  );

  // As is coming back to the app at all — walking out of the basement.
  useFocusEffect(
    useCallback(() => {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void sync();
      });
      return () => subscription.remove();
    }, [sync]),
  );

  if (count === 0) return null;

  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          borderRadius: 18,
          backgroundColor: `${c.state.warning}1A`,
          borderWidth: 1,
          borderColor: `${c.state.warning}44`,
        }}
        accessibilityLiveRegion="polite"
      >
        <Text style={{ fontSize: 16 }}>📡</Text>

        <Text style={{ flex: 1, color: c.text.primary, fontSize: 13, lineHeight: 18 }}>
          {count === 1 ? '1 meal is' : `${count} meals are`} waiting for a connection. They are
          saved on this phone and will go up on their own.
        </Text>

        <Pressable
          onPress={() => void sync()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Try to sync now"
          hitSlop={8}
          style={{ opacity: busy ? 0.4 : 1 }}
        >
          <Text style={{ color: c.state.warning, fontSize: 13, fontWeight: '700' }}>
            {busy ? 'Trying…' : 'Retry'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

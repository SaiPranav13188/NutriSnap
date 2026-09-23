import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  bestRecheck,
  dayUncertainty,
  describeRange,
  describeRecheck,
  type FoodLog,
} from '@nutrisnap/core';
import { useColors } from '../lib/theme';

/**
 * How firm today's number actually is, and what to do about it.
 *
 * The ring above this shows a single figure, which is the only honest thing
 * to put in a ring and also a small lie: a day of barcode scans is known to
 * within a few calories and a day of dim photographs is not, and until now
 * both were drawn identically. The band says which kind of day this is.
 *
 * The second line is the part that earns its place. A band on its own is a
 * shrug; this names the one meal whose correction would actually narrow it,
 * and says by how much, so the work it asks for is work with a stated
 * payoff. When no single meal would move the number it says nothing at all,
 * which is most days.
 */
export function UncertaintyNote({ logs }: { logs: readonly FoodLog[] }) {
  const c = useColors();

  const day = dayUncertainty(logs);
  if (!day.worthShowing) return null;

  const recheck = bestRecheck(day);

  return (
    <View style={{ alignSelf: 'stretch', alignItems: 'center', gap: 6 }}>
      <Text
        style={{ color: c.text.tertiary, fontSize: 12 }}
        accessibilityLabel={`Today's total is about ${Math.round(
          day.calories,
        )} kcal, give or take ${day.marginKcal}.`}
      >
        About {describeRange(day)}
      </Text>

      {recheck && (
        <Pressable
          onPress={() => router.push({ pathname: '/log/[id]', params: { id: recheck.log.id } })}
          accessibilityRole="button"
          accessibilityLabel={describeRecheck(recheck)}
          accessibilityHint="Opens that meal so you can correct it"
          style={{
            alignSelf: 'stretch',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 14,
            backgroundColor: c.glass.DEFAULT,
            borderWidth: 1,
            borderColor: c.glass.border,
          }}
        >
          <Text style={{ color: c.text.secondary, fontSize: 12, lineHeight: 17 }}>
            {describeRecheck(recheck)}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

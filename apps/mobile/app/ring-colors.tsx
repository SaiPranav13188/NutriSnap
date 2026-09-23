import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RING_LEGEND, type RingState } from '@nutrisnap/core';
import { Card, Screen, ScreenHeader } from '../src/components/ui';
import { ProgressRing } from '../src/components/ProgressRing';
import { AppLogo } from '../src/components/AppLogo';
import { ringColorFor } from '../src/lib/ringColors';
import { useColors } from '../src/lib/theme';

/**
 * What the colours on the home calendar mean.
 *
 * The strip has five things it can draw and, until this screen existed, no
 * way to find out what any of them meant short of guessing from the colour —
 * which works for red and green and not at all for a broken circle.
 *
 * Every row here is generated from `RING_LEGEND` in core, the same table the
 * strip colours itself from. A legend typed out by hand is one that survives
 * exactly until the first threshold is retuned.
 */

/** The sample week across the top, chosen to show every state at once. */
const SAMPLE: ReadonlyArray<{
  weekday: string;
  day: number;
  state: RingState;
  ratio: number;
}> = [
  { weekday: 'Sun', day: 10, state: 'onTarget', ratio: 1 },
  { weekday: 'Mon', day: 11, state: 'over', ratio: 1 },
  { weekday: 'Tue', day: 12, state: 'empty', ratio: 0 },
  { weekday: 'Wed', day: 13, state: 'onTarget', ratio: 1 },
  { weekday: 'Thu', day: 14, state: 'close', ratio: 1 },
  { weekday: 'Fri', day: 15, state: 'under', ratio: 0.45 },
  { weekday: 'Sat', day: 16, state: 'under', ratio: 0 },
];

const RING_SIZE = 40;

export default function RingColors() {
  const c = useColors();

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScreenHeader title="Ring Colors Explained" />

        <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}>
          {/* A copy of the strip rather than a description of it, so the
              colours are compared against the real thing and not remembered. */}
          <Card style={{ padding: 18, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppLogo size={26} />
              <Text style={{ color: c.text.primary, fontSize: 18, fontWeight: '700' }}>
                NutriSnap
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {SAMPLE.map((sample) => {
                const colour = ringColorFor(sample.state, c);
                const dashed = sample.state === 'empty';

                return (
                  <View key={sample.day} style={{ alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: c.text.tertiary, fontSize: 11 }}>{sample.weekday}</Text>
                    <ProgressRing
                      ratio={sample.ratio}
                      size={RING_SIZE}
                      strokeWidth={3}
                      from={colour}
                      to={colour}
                      gradientId={`legend-${sample.day}`}
                      dashed={dashed}
                      trackColor={dashed ? colour : undefined}
                    >
                      <Text style={{ color: c.text.secondary, fontSize: 12, fontWeight: '600' }}>
                        {sample.day}
                      </Text>
                    </ProgressRing>
                  </View>
                );
              })}
            </View>
          </Card>

          <Text style={{ color: c.text.secondary, fontSize: 14, lineHeight: 21 }}>
            On the home calendar, the ring around each date shows how that day went against your
            calorie goal:
          </Text>

          <Card style={{ paddingHorizontal: 18 }}>
            {RING_LEGEND.map((entry, i) => {
              const colour = ringColorFor(entry.state, c);
              const dashed = entry.state === 'empty';

              return (
                <View
                  key={entry.state}
                  accessible
                  accessibilityLabel={`${entry.title}. ${entry.detail}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 16,
                    paddingVertical: 16,
                    borderBottomWidth: i === RING_LEGEND.length - 1 ? 0 : 1,
                    borderBottomColor: c.glass.DEFAULT,
                  }}
                >
                  {/* An empty ring, so the swatch is the shape being explained
                      rather than a filled dot that happens to share a colour. */}
                  <ProgressRing
                    ratio={0}
                    size={34}
                    strokeWidth={3}
                    from={colour}
                    to={colour}
                    gradientId={`swatch-${entry.state}`}
                    dashed={dashed}
                    trackColor={colour}
                  />

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '700' }}>
                      {entry.title}
                    </Text>
                    <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
                      {entry.detail}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>

          <Text style={{ color: c.text.tertiary, fontSize: 12, lineHeight: 18 }}>
            Each ring is measured against your daily calorie target. Calories carried over from
            the day before are not counted here, so a day you rolled calories into can read as
            over while the home screen still showed room.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

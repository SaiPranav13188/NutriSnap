import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  cardioProfile,
  compareCalorieSources,
  formatNumber,
  formatPace,
  zoneBreakdown,
} from '@nutrisnap/core';
import { ZONE_COLORS } from './CardioSessionSheet';
import type { FinishedCardio } from './CardioSessionSheet';
import { useColors } from '../lib/theme';

const minutes = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

/**
 * What a finished cardio session amounted to.
 *
 * The time-in-zone chart is the part worth the space: a total says how much
 * work was done, and the distribution says what kind. A session that spent
 * forty minutes in zone two is a different thing from one that spent fifteen
 * in zone four, even where the calories match.
 */
export function CardioSummaryCard({
  result,
  onClose,
}: {
  result: FinishedCardio;
  onClose: () => void;
}) {
  const c = useColors();
  const { snapshot, activity, machineKcal } = result;

  const profile = cardioProfile(activity);
  const zones = zoneBreakdown(snapshot.zoneSeconds, snapshot.zoneKcal);
  const usedHeartRate = zones.some((row) => row.seconds > 0);

  const divergence =
    machineKcal !== null && machineKcal > 0
      ? compareCalorieSources(Math.round(snapshot.kcal), machineKcal)
      : null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.base['900'] }} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
          <Text style={{ color: c.text.primary, fontSize: 20, fontWeight: '700' }}>
            {profile.label} complete
          </Text>

          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text
              style={{ color: c.accent.lime, fontSize: 60, fontWeight: '900', letterSpacing: -1.5 }}
            >
              {formatNumber(Math.round(snapshot.kcal))}
            </Text>
            <Text style={{ color: c.text.tertiary, fontSize: 12, letterSpacing: 3 }}>
              KCAL · {snapshot.source === 'heart-rate' ? 'FROM HEART RATE' : 'ESTIMATED'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label="Duration" value={minutes(snapshot.elapsedSec)} />
            {snapshot.distanceM > 0 && (
              <Stat label="Distance" value={`${(snapshot.distanceM / 1000).toFixed(2)} km`} />
            )}
            {snapshot.paceMinPerKm && (
              <Stat label="Avg pace" value={`${formatPace(snapshot.paceMinPerKm)} /km`} />
            )}
          </View>

          {/* Requirement six. Only drawn when a heart rate actually fed it —
              five empty bars would imply a measurement nobody took. */}
          {usedHeartRate ? (
            <View style={{ gap: 10 }}>
              <Text style={{ color: c.text.secondary, fontSize: 12, fontWeight: '700' }}>
                TIME IN ZONE
              </Text>

              {zones.map((row) => (
                <View key={row.zone} style={{ gap: 5 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: c.text.primary, fontSize: 13 }}>
                      Zone {row.zone}
                      <Text style={{ color: c.text.tertiary }}> · {row.label}</Text>
                    </Text>
                    <Text style={{ color: c.text.secondary, fontSize: 13, fontWeight: '600' }}>
                      {minutes(row.seconds)} · {Math.round(row.kcal)} kcal
                    </Text>
                  </View>

                  <View
                    style={{
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: c.glass.DEFAULT,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        width: `${row.share * 100}%`,
                        height: '100%',
                        borderRadius: 4,
                        backgroundColor: ZONE_COLORS[row.zone - 1],
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View
              style={{ padding: 14, borderRadius: 16, backgroundColor: c.glass.DEFAULT }}
            >
              <Text style={{ color: c.text.tertiary, fontSize: 12, lineHeight: 17 }}>
                No heart rate this session, so there is no zone breakdown. The calorie figure came
                from the activity and your weight rather than from measured effort.
              </Text>
            </View>
          )}

          {snapshot.interval && (
            <View style={{ padding: 14, borderRadius: 16, backgroundColor: c.glass.DEFAULT }}>
              <Text style={{ color: c.text.secondary, fontSize: 13 }}>
                <Text style={{ fontWeight: '700', color: c.text.primary }}>
                  {formatNumber(Math.round(snapshot.interval.workKcal))} kcal
                </Text>
                {` of that came from the work intervals, across ${snapshot.interval.round} round`}
                {snapshot.interval.round === 1 ? '' : 's'}.
              </Text>
            </View>
          )}

          {divergence && (
            <View
              style={{
                padding: 14,
                borderRadius: 16,
                backgroundColor: divergence.diverged ? `${c.state.warning}1A` : c.glass.DEFAULT,
              }}
            >
              <Text
                style={{
                  color: divergence.diverged ? c.state.warning : c.text.tertiary,
                  fontSize: 12,
                  lineHeight: 17,
                }}
              >
                {divergence.diverged
                  ? `The machine reported ${formatNumber(machineKcal!)} kcal — ${Math.round(divergence.ratio * 100)}% apart from this estimate. Machine figures rarely account for body weight, so treat the gap as a range rather than one of them being right.`
                  : `The machine reported ${formatNumber(machineKcal!)} kcal, which agrees with this estimate.`}
              </Text>
            </View>
          )}

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={{
              height: 54,
              borderRadius: 26,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.accent.lime,
            }}
          >
            <Text style={{ color: c.base['900'], fontSize: 16, fontWeight: '700' }}>Done</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 2,
        paddingVertical: 12,
        borderRadius: 16,
        backgroundColor: c.glass.DEFAULT,
      }}
    >
      <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: c.text.tertiary, fontSize: 10 }}>{label}</Text>
    </View>
  );
}

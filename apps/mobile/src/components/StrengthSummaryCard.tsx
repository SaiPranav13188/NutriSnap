import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot, { captureRef, type ViewShotRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import {
  breakdownByExercise,
  compareWithRecent,
  formatNumber,
  type LoggedSet,
} from '@nutrisnap/core';
import { AppLogo } from './AppLogo';
import { useColors } from '../lib/theme';

const clock = (totalSec: number): string => {
  const whole = Math.max(0, Math.round(totalSec));
  const h = Math.floor(whole / 3600);
  const m = Math.round((whole % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/**
 * What a finished session amounted to.
 *
 * Built to be looked at once and then sent to someone, which is why the card
 * itself is a self-contained block with its own background: the thing that
 * gets captured has to make sense outside the app, so it carries the mark and
 * the date rather than relying on the screen around it.
 */
export function StrengthSummaryCard({
  visible,
  sets,
  totalSeconds,
  activeSeconds,
  previousSessionKcal,
  onClose,
}: {
  visible: boolean;
  sets: LoggedSet[];
  totalSeconds: number;
  activeSeconds: number;
  /** Past session totals, newest first, for the rolling comparison. */
  previousSessionKcal: readonly number[];
  onClose: () => void;
}) {
  const c = useColors();
  const card = useRef<ViewShotRef>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = sets.reduce((sum, set) => sum + set.calories, 0);
  const breakdown = breakdownByExercise(sets);
  const comparison = compareWithRecent(total, previousSessionKcal);

  async function share() {
    if (sharing) return;
    setSharing(true);
    setError(null);
    try {
      // A temp file rather than base64: the image goes straight to the share
      // sheet, and a large data URI over the bridge would stall the UI.
      const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });

      if (!(await Sharing.isAvailableAsync())) {
        setError('Sharing is not available on this device.');
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share your session',
        UTI: 'public.png',
      });
    } catch {
      setError('Could not build that image.');
    } finally {
      setSharing(false);
    }
  }

  const deltaTint =
    comparison.delta === null
      ? c.text.tertiary
      : comparison.delta >= 0
        ? c.state.success
        : c.state.warning;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.base['900'] }} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {/* Everything inside this ref is what ends up in the image. */}
          <ViewShot ref={card} options={{ format: 'png', quality: 1 }}>
            <LinearGradient
              colors={[c.base['800'], c.base['900']]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                padding: 22,
                borderRadius: 26,
                borderWidth: 1,
                borderColor: c.glass.border,
                gap: 18,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <AppLogo size={30} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text.primary, fontSize: 15, fontWeight: '700' }}>
                    Strength session
                  </Text>
                  <Text style={{ color: c.text.tertiary, fontSize: 11 }}>
                    {new Date().toLocaleDateString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </Text>
                </View>
              </View>

              <View style={{ alignItems: 'center' }}>
                <Text
                  style={{
                    color: c.accent.lime,
                    fontSize: 58,
                    fontWeight: '900',
                    letterSpacing: -1.5,
                  }}
                >
                  {formatNumber(Math.round(total))}
                </Text>
                <Text style={{ color: c.text.tertiary, fontSize: 12, letterSpacing: 3 }}>
                  KCAL BURNED
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Stat label="Duration" value={clock(totalSeconds)} />
                <Stat label="Working" value={clock(activeSeconds)} />
                <Stat label="Sets" value={String(sets.length)} />
              </View>

              {/* Which exercise did the most, and how the rest compare. */}
              <View style={{ gap: 8 }}>
                <Text style={{ color: c.text.secondary, fontSize: 12, fontWeight: '700' }}>
                  BY EXERCISE
                </Text>

                {breakdown.slice(0, 5).map((row) => (
                  <View key={row.exercise} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text
                        numberOfLines={1}
                        style={{ color: c.text.primary, fontSize: 13, flex: 1 }}
                      >
                        {row.exercise}
                        <Text style={{ color: c.text.tertiary }}> · {row.sets}</Text>
                      </Text>
                      <Text style={{ color: c.text.secondary, fontSize: 13, fontWeight: '600' }}>
                        {Math.round(row.calories)} kcal
                      </Text>
                    </View>

                    <View
                      style={{
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: c.glass.DEFAULT,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          width: `${Math.max(3, row.share * 100)}%`,
                          height: '100%',
                          borderRadius: 3,
                          backgroundColor: c.accent.lime,
                        }}
                      />
                    </View>
                  </View>
                ))}
              </View>

              {/* Requirement six: against the rolling average, and honest
                  about having nothing to compare with on a first session. */}
              <View
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 16,
                  backgroundColor: c.glass.DEFAULT,
                }}
              >
                {comparison.average === null ? (
                  <Text style={{ color: c.text.tertiary, fontSize: 12, lineHeight: 17 }}>
                    First session on record — the next one will have this to measure against.
                  </Text>
                ) : (
                  <Text style={{ color: c.text.secondary, fontSize: 12, lineHeight: 17 }}>
                    <Text style={{ color: deltaTint, fontWeight: '800' }}>
                      {comparison.delta! >= 0 ? '+' : '−'}
                      {formatNumber(Math.abs(Math.round(comparison.delta!)))} kcal
                    </Text>
                    {' vs your last '}
                    {comparison.sampleSize} session
                    {comparison.sampleSize === 1 ? '' : 's'}
                    {` (avg ${formatNumber(Math.round(comparison.average))})`}
                  </Text>
                )}
              </View>
            </LinearGradient>
          </ViewShot>

          {error && (
            <Text style={{ color: c.state.danger, fontSize: 13, textAlign: 'center' }}>
              {error}
            </Text>
          )}

          <Pressable
            onPress={() => void share()}
            disabled={sharing}
            accessibilityRole="button"
            style={{
              height: 54,
              borderRadius: 26,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.accent.lime,
              opacity: sharing ? 0.6 : 1,
            }}
          >
            {sharing ? (
              <ActivityIndicator color={c.base['900']} />
            ) : (
              <Text style={{ color: c.base['900'], fontSize: 16, fontWeight: '700' }}>
                Share as image
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={{ height: 50, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: c.text.secondary, fontSize: 15, fontWeight: '600' }}>Done</Text>
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
        paddingVertical: 11,
        borderRadius: 14,
        backgroundColor: c.glass.DEFAULT,
      }}
    >
      <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: c.text.tertiary, fontSize: 10 }}>{label}</Text>
    </View>
  );
}

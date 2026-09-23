import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ACTIVITY_LABELS,
  formatWeight,
  type ActivityLevel,
  type DailyTarget,
  type Goal,
  type Profile,
  type Units,
} from '@nutrisnap/core';
import { api, ApiError } from '../src/lib/api';
import { Button, Card, ErrorNote, Screen, ScreenHeader } from '../src/components/ui';
import { useColors } from '../src/lib/theme';

/**
 * The plan, and the two answers it is computed from.
 *
 * Goal and activity level both move every number on this screen, so they are
 * shown next to the numbers they move rather than three cards apart. Changing
 * either recalculates on the server in the same request, which is why the
 * figures above update without a reload.
 */
export default function NutritionGoals() {
  const c = useColors();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [targets, setTargets] = useState<DailyTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api
        .getProfile()
        .then(({ profile: p, targets: t }) => {
          setProfile(p);
          setTargets(t);
        })
        .catch((caught) =>
          setError(caught instanceof ApiError ? caught.message : 'Could not load your plan.'),
        )
        .finally(() => setLoading(false));
    }, []),
  );

  async function patch(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const { profile: p, targets: t } = await api.updateProfile(body);
      setProfile(p);
      setTargets(t);
      setNotice('Saved. Your targets have been recalculated.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that change.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.accent.lime} />
        </View>
      </Screen>
    );
  }

  const units: Units = profile?.units ?? 'metric';

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScreenHeader title="Nutrition Goals" />

        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
          {error && <ErrorNote message={error} />}
          {notice && (
            <View
              style={{ backgroundColor: `${c.state.success}1A`, borderRadius: 18, padding: 14 }}
            >
              <Text style={{ color: c.state.success, fontSize: 14 }}>{notice}</Text>
            </View>
          )}

          <Card style={{ padding: 18, gap: 14 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Your daily targets
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              <Stat label="Calories" value={targets ? `${Math.round(targets.calories)} kcal` : '—'} />
              <Stat label="Protein" value={targets ? `${Math.round(targets.protein_g)} g` : '—'} />
              <Stat label="Carbs" value={targets ? `${Math.round(targets.carbs_g)} g` : '—'} />
              <Stat label="Fat" value={targets ? `${Math.round(targets.fat_g)} g` : '—'} />
              <Stat label="BMR" value={targets?.bmr ? `${Math.round(targets.bmr)} kcal` : '—'} />
              <Stat
                label="Daily burn"
                value={targets?.tdee ? `${Math.round(targets.tdee)} kcal` : '—'}
              />
            </View>

            <Button
              variant="glass"
              loading={busy === 'recalc'}
              onPress={async () => {
                setBusy('recalc');
                try {
                  const { targets: t } = await api.recalculateTargets();
                  setTargets(t);
                  setNotice('Targets recalculated from your current stats.');
                } catch (caught) {
                  setError(caught instanceof ApiError ? caught.message : 'Could not recalculate.');
                } finally {
                  setBusy(null);
                }
              }}
            >
              Recalculate
            </Button>
          </Card>

          <Card style={{ padding: 18, gap: 12 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>Goal</Text>
            <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
              Currently aiming for{' '}
              {profile?.goal_weight_kg ? formatWeight(profile.goal_weight_kg, units) : 'no set weight'}.
              Changing this recalculates your calorie and macro targets straight away.
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(['lose', 'maintain', 'gain'] as const).map((goal: Goal) => (
                <Chip
                  key={goal}
                  label={`${goal} weight`}
                  active={profile?.goal === goal}
                  disabled={busy !== null}
                  onPress={() => patch({ goal }, 'goal')}
                />
              ))}
            </View>
          </Card>

          <Card style={{ padding: 18, gap: 12 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Activity level
            </Text>
            <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
              How much you move before any logged exercise. This is what your daily burn is built
              from.
            </Text>

            <View style={{ gap: 8 }}>
              {(
                ['sedentary', 'light', 'moderate', 'very_active', 'extreme'] as const
              ).map((level: ActivityLevel) => {
                const active = profile?.activity_level === level;
                return (
                  <Pressable
                    key={level}
                    onPress={() => patch({ activity_level: level }, 'activity')}
                    disabled={busy !== null}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: busy !== null }}
                    style={{
                      padding: 14,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: active ? c.accent.lime : c.glass.border,
                      backgroundColor: active ? c.glass.strong : 'transparent',
                      opacity: busy !== null && !active ? 0.5 : 1,
                    }}
                  >
                    <Text
                      style={{
                        color: c.text.primary,
                        fontSize: 15,
                        fontWeight: active ? '700' : '500',
                      }}
                    >
                      {ACTIVITY_LABELS[level].title}
                    </Text>
                    <Text style={{ color: c.text.tertiary, fontSize: 12, marginTop: 2 }}>
                      {ACTIVITY_LABELS[level].subtitle}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ minWidth: '42%' }}>
      <Text
        style={{
          color: c.text.tertiary,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        {label}
      </Text>
      <Text style={{ color: c.text.primary, fontSize: 15, fontWeight: '600', marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

function Chip({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? 'rgba(198,255,61,0.6)' : c.glass.border,
        backgroundColor: active ? 'rgba(198,255,61,0.10)' : 'transparent',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          color: active ? c.text.primary : c.text.secondary,
          fontSize: 14,
          textTransform: 'capitalize',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

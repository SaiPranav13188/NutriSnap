import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatWater, resolveWaterTarget, type Profile, type Units } from '@nutrisnap/core';
import { api, ApiError } from '../src/lib/api';
import { Button, Card, ErrorNote, Screen, ScreenHeader } from '../src/components/ui';
import { useColors } from '../src/lib/theme';
import {
  DEFAULT_REMINDERS,
  applyReminders,
  readReminderSettings,
  remindersSupported,
  type ReminderSettings,
} from '../src/lib/reminders';

/**
 * Units, reminders and the data export — the settings that are about the app
 * rather than about the body using it.
 *
 * Lifted wholesale off the old Settings screen. Nothing here changed except
 * where it lives: these three were buried under the plan and the body stats,
 * which are the things people came to that screen for.
 */
/**
 * The goals worth offering, in whole and half litres.
 *
 * A wheel of every value between 500 and 6000 would be precision nobody
 * wants: people think about water in glasses and litres, not millilitres.
 */
const WATER_CHOICES = [1500, 2000, 2500, 3000, 3500, 4000];

export default function Preferences() {
  const c = useColors();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reminders, setReminders] = useState<ReminderSettings>(DEFAULT_REMINDERS);
  const [reminderNote, setReminderNote] = useState<string | null>(null);

  useEffect(() => {
    void readReminderSettings().then(setReminders);
  }, []);

  useFocusEffect(
    useCallback(() => {
      api
        .getProfile()
        .then(({ profile: p }) => setProfile(p))
        .catch((caught) =>
          setError(caught instanceof ApiError ? caught.message : 'Could not load your profile.'),
        )
        .finally(() => setLoading(false));
    }, []),
  );

  /**
   * Writes straight through to the OS schedule. If permission is refused the
   * toggle goes back down, because leaving it on would promise a reminder
   * that is never going to arrive.
   */
  async function updateReminders(next: ReminderSettings) {
    setReminders(next);
    setReminderNote(null);

    const ok = await applyReminders(next);
    if (!ok) {
      setReminders({ ...next, mealEnabled: false, weighInEnabled: false });
      setReminderNote(
        remindersSupported
          ? 'Notifications are blocked for NutriSnap. Turn them on in your phone settings first.'
          : 'Reminders need a development build. Expo Go cannot schedule them on Android.',
      );
    }
  }

  async function setUnits(units: Units) {
    setBusy('units');
    setError(null);
    setNotice(null);
    try {
      const { profile: p } = await api.updateProfile({ units });
      setProfile(p);
      setNotice('Saved.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that change.');
    } finally {
      setBusy(null);
    }
  }

  /** Null clears the override and hands the goal back to the formula. */
  async function setWaterGoal(water_goal_ml: number | null) {
    setBusy('water');
    setError(null);
    setNotice(null);
    try {
      const { profile: p } = await api.updateProfile({ water_goal_ml });
      setProfile(p);
      setNotice('Saved.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that change.');
    } finally {
      setBusy(null);
    }
  }

  async function exportData() {
    setBusy('export');
    try {
      const data = await api.exportData();
      // Phones have no filesystem download; the share sheet is the native
      // equivalent — save to Files, mail it, whatever the user prefers.
      await Share.share({
        title: 'NutriSnap data export',
        message: JSON.stringify(data, null, 2),
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not export your data.');
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
        <ScreenHeader title="Preferences" />

        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
          {error && <ErrorNote message={error} />}
          {notice && (
            <View
              style={{ backgroundColor: `${c.state.success}1A`, borderRadius: 18, padding: 14 }}
            >
              <Text style={{ color: c.state.success, fontSize: 14 }}>{notice}</Text>
            </View>
          )}

          <Card style={{ padding: 18, gap: 12 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>Units</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['metric', 'imperial'] as const).map((unit) => (
                <Chip
                  key={unit}
                  label={unit}
                  active={units === unit}
                  disabled={busy !== null}
                  onPress={() => void setUnits(unit)}
                />
              ))}
            </View>
          </Card>

          <Card style={{ padding: 18, gap: 12 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Water goal
            </Text>
            <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
              {profile?.water_goal_ml
                ? 'Your own figure. Clear it to go back to deriving one from your weight.'
                : `Derived from your weight — currently ${formatWater(
                    resolveWaterTarget(null, profile?.current_weight_kg ?? null),
                    units,
                  )} a day.`}
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {WATER_CHOICES.map((ml) => (
                <Chip
                  key={ml}
                  label={formatWater(ml, units)}
                  active={profile?.water_goal_ml === ml}
                  disabled={busy !== null}
                  onPress={() => void setWaterGoal(ml)}
                />
              ))}
              <Chip
                label="Automatic"
                active={!profile?.water_goal_ml}
                disabled={busy !== null}
                onPress={() => void setWaterGoal(null)}
              />
            </View>
          </Card>

          <Card style={{ padding: 18, gap: 14 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Reminders
            </Text>

            <ReminderToggle
              label="Daily log reminder"
              detail={`Every evening at ${String(reminders.mealHour).padStart(2, '0')}:00`}
              value={reminders.mealEnabled}
              onValueChange={(value) => void updateReminders({ ...reminders, mealEnabled: value })}
            />

            <ReminderToggle
              label="Weekly weigh-in"
              detail={`Mondays at ${String(reminders.weighInHour).padStart(2, '0')}:00`}
              value={reminders.weighInEnabled}
              onValueChange={(value) =>
                void updateReminders({ ...reminders, weighInEnabled: value })
              }
            />

            {reminderNote && (
              <Text style={{ color: c.state.warning, fontSize: 12, lineHeight: 18 }}>
                {reminderNote}
              </Text>
            )}

            <Text style={{ color: c.text.tertiary, fontSize: 12, lineHeight: 18 }}>
              {remindersSupported
                ? 'Reminders are set on this phone only. Nothing is scheduled on a server and no push token is registered.'
                : 'Expo Go cannot schedule notifications on Android. These switches will work in a development build; everything else in the app is unaffected.'}
            </Text>
          </Card>

          <Card style={{ padding: 18, gap: 12 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Your data
            </Text>
            <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
              Everything NutriSnap holds about you — profile, targets, every meal and weigh-in.
            </Text>
            <Button variant="glass" loading={busy === 'export'} onPress={exportData}>
              Export everything
            </Button>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

function ReminderToggle({
  label,
  detail,
  value,
  onValueChange,
}: {
  label: string;
  detail: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const c = useColors();

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text.primary, fontSize: 15 }}>{label}</Text>
        <Text style={{ color: c.text.tertiary, fontSize: 12, marginTop: 2 }}>{detail}</Text>
      </View>
      <Switch
        value={value}
        disabled={!remindersSupported}
        onValueChange={onValueChange}
        trackColor={{ true: c.accent.lime, false: c.glass.borderStrong }}
        accessibilityLabel={label}
      />
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

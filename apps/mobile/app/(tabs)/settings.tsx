import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  Switch,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ACTIVITY_LABELS,
  formatHeight,
  formatWeight,
  type DailyTarget,
  type Profile,
} from '@nutrisnap/core';
import { api, ApiError } from '../../src/lib/api';
import { supabase } from '../../src/lib/supabase';
import { Button, Card, ErrorNote, Screen } from '../../src/components/ui';
import { useColors } from '../../src/lib/theme';
import {
  DEFAULT_REMINDERS,
  applyReminders,
  readReminderSettings,
  remindersSupported,
  type ReminderSettings,
} from '../../src/lib/reminders';

export default function Settings() {
  const c = useColors();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [targets, setTargets] = useState<DailyTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reminders, setReminders] = useState<ReminderSettings>(DEFAULT_REMINDERS);
  const [reminderNote, setReminderNote] = useState<string | null>(null);

  useEffect(() => {
    void readReminderSettings().then(setReminders);
  }, []);

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

  useEffect(() => {
    api
      .getProfile()
      .then(({ profile: p, targets: t }) => {
        setProfile(p);
        setTargets(t);
      })
      .catch((caught) =>
        setError(caught instanceof ApiError ? caught.message : 'Could not load your profile.'),
      )
      .finally(() => setLoading(false));
  }, []);

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

  const units = profile?.units ?? 'metric';

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
          <View>
            <Text style={{ color: c.text.primary, fontSize: 26, fontWeight: '700' }}>Settings</Text>
            <Text style={{ color: c.text.secondary, fontSize: 15, marginTop: 4 }}>
              Your plan, your data, your account.
            </Text>
          </View>

          {error && <ErrorNote message={error} />}
          {notice && (
            <View style={{ backgroundColor: 'rgba(67,230,160,0.10)', borderRadius: 18, padding: 14 }}>
              <Text style={{ color: c.state.success, fontSize: 14 }}>{notice}</Text>
            </View>
          )}

          <Card style={{ padding: 18, gap: 14 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>Your plan</Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              <Stat label="Calories" value={targets ? `${Math.round(targets.calories)} kcal` : '—'} />
              <Stat label="Protein" value={targets ? `${Math.round(targets.protein_g)} g` : '—'} />
              <Stat label="Carbs" value={targets ? `${Math.round(targets.carbs_g)} g` : '—'} />
              <Stat label="Fat" value={targets ? `${Math.round(targets.fat_g)} g` : '—'} />
              <Stat label="BMR" value={targets?.bmr ? `${Math.round(targets.bmr)} kcal` : '—'} />
              <Stat label="Daily burn" value={targets?.tdee ? `${Math.round(targets.tdee)} kcal` : '—'} />
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

          <Card style={{ padding: 18, gap: 14 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>Your body</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              <Stat label="Height" value={profile?.height_cm ? formatHeight(profile.height_cm, units) : '—'} />
              <Stat
                label="Weight"
                value={profile?.current_weight_kg ? formatWeight(profile.current_weight_kg, units) : '—'}
              />
              <Stat
                label="Goal weight"
                value={profile?.goal_weight_kg ? formatWeight(profile.goal_weight_kg, units) : '—'}
              />
              <Stat
                label="Activity"
                value={profile?.activity_level ? ACTIVITY_LABELS[profile.activity_level].title : '—'}
              />
            </View>
          </Card>

          <Card style={{ padding: 18, gap: 12 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>Goal</Text>
            <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
              Changing this recalculates your calorie and macro targets straight away.
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(['lose', 'maintain', 'gain'] as const).map((goal) => (
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
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>Units</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['metric', 'imperial'] as const).map((unit) => (
                <Chip
                  key={unit}
                  label={unit}
                  active={units === unit}
                  disabled={busy !== null}
                  onPress={() => patch({ units: unit }, 'units')}
                />
              ))}
            </View>
          </Card>

          <Card style={{ padding: 18, gap: 12 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>Your data</Text>
            <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
              Everything NutriSnap holds about you — profile, targets, every meal and weigh-in.
            </Text>
            <Button variant="glass" loading={busy === 'export'} onPress={exportData}>
              Export everything
            </Button>
          </Card>

          <Card style={{ padding: 18, gap: 14 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Reminders
            </Text>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text.primary, fontSize: 15 }}>Daily log reminder</Text>
                <Text style={{ color: c.text.tertiary, fontSize: 12, marginTop: 2 }}>
                  Every evening at {String(reminders.mealHour).padStart(2, '0')}:00
                </Text>
              </View>
              <Switch
                value={reminders.mealEnabled}
                disabled={!remindersSupported}
                onValueChange={(value) =>
                  void updateReminders({ ...reminders, mealEnabled: value })
                }
                trackColor={{ true: c.accent.lime, false: c.glass.borderStrong }}
                accessibilityLabel="Daily log reminder"
              />
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text.primary, fontSize: 15 }}>Weekly weigh-in</Text>
                <Text style={{ color: c.text.tertiary, fontSize: 12, marginTop: 2 }}>
                  Mondays at {String(reminders.weighInHour).padStart(2, '0')}:00
                </Text>
              </View>
              <Switch
                value={reminders.weighInEnabled}
                disabled={!remindersSupported}
                onValueChange={(value) =>
                  void updateReminders({ ...reminders, weighInEnabled: value })
                }
                trackColor={{ true: c.accent.lime, false: c.glass.borderStrong }}
                accessibilityLabel="Weekly weigh-in reminder"
              />
            </View>

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

          <Button
            variant="danger"
            onPress={async () => {
              await supabase.auth.signOut();
              router.replace('/signin');
            }}
          >
            Sign out
          </Button>

          <Text
            style={{
              color: c.text.tertiary,
              fontSize: 12,
              lineHeight: 18,
              textAlign: 'center',
              paddingHorizontal: 8,
              marginTop: 4,
            }}
          >
            NutriSnap provides general wellness guidance, not medical advice. Calorie estimates
            from photos are approximate. Talk to a qualified professional before making
            significant dietary changes, particularly if you have a medical condition.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ minWidth: '42%' }}>
      <Text style={{ color: c.text.tertiary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>
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

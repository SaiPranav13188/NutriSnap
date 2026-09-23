import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  formatHeight,
  formatWeight,
  kgToLb,
  lbToKg,
  type Gender,
  type Profile,
  type Units,
} from '@nutrisnap/core';
import { api, ApiError } from '../src/lib/api';
import { Button, Card, ErrorNote, Screen, ScreenHeader } from '../src/components/ui';
import { SettingsGroup } from '../src/components/SettingsRow';
import { RulerPicker } from '../src/components/RulerPicker';
import { HeightPicker } from '../src/components/HeightPicker';
import { DateOfBirthPicker } from '../src/components/DateOfBirthPicker';
import { WheelColumn, WheelGroup } from '../src/components/WheelPicker';
import { useColors } from '../src/lib/theme';

/**
 * Everything the plan is calculated from, in one place.
 *
 * These numbers were previously read-only on the Settings screen — visible,
 * but only changeable by retaking the whole onboarding quiz. That is a poor
 * trade for the one thing people genuinely revise, which is their weight.
 *
 * Each row opens the same picker the quiz used rather than a text field. A
 * keyboard invites "17" into a height in centimetres; a wheel that only
 * contains plausible heights cannot be given one.
 */

type Field = 'weight' | 'height' | 'dob' | 'gender' | 'steps';

const GENDERS: ReadonlyArray<{ value: Gender; label: string }> = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

/**
 * The step goals worth offering.
 *
 * A wheel of five hundred numbers to find 10,000 is worse than a short list
 * of the ones people actually pick, and every one of these is inside the
 * column's 1,000–50,000 bounds.
 */
const STEP_GOALS = [4000, 5000, 6000, 7500, 8000, 10000, 12000, 15000, 20000];

const TITLES: Record<Field, string> = {
  weight: 'Current weight',
  height: 'Height',
  dob: 'Date of birth',
  gender: 'Gender',
  steps: 'Daily step goal',
};

export default function PersonalDetails() {
  const c = useColors();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Which field is being edited, and the value the picker is holding. */
  const [editing, setEditing] = useState<Field | null>(null);
  const [draftWeightKg, setDraftWeightKg] = useState(70);
  const [draftHeightCm, setDraftHeightCm] = useState(170);
  const [draftDob, setDraftDob] = useState<string | null>(null);
  const [draftGender, setDraftGender] = useState<Gender>('male');
  const [draftSteps, setDraftSteps] = useState(10000);

  useFocusEffect(
    useCallback(() => {
      api
        .getProfile()
        .then(({ profile: p }) => {
          setProfile(p);
          setError(null);
        })
        .catch((caught) =>
          setError(caught instanceof ApiError ? caught.message : 'Could not load your details.'),
        )
        .finally(() => setLoading(false));
    }, []),
  );

  const units: Units = profile?.units ?? 'metric';

  function open(field: Field) {
    if (!profile) return;
    setError(null);
    setDraftWeightKg(profile.current_weight_kg ?? 70);
    setDraftHeightCm(profile.height_cm ?? 170);
    setDraftDob(profile.date_of_birth);
    setDraftGender(profile.gender ?? 'male');
    setDraftSteps(profile.daily_step_goal ?? 10000);
    setEditing(field);
  }

  async function save(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const { profile: p } = await api.updateProfile(body);
      setProfile(p);
      setEditing(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that change.');
    } finally {
      setSaving(false);
    }
  }

  function commit() {
    switch (editing) {
      case 'weight':
        return save({ current_weight_kg: Math.round(draftWeightKg * 10) / 10 });
      case 'height':
        return save({ height_cm: Math.round(draftHeightCm) });
      case 'dob':
        return draftDob ? save({ date_of_birth: draftDob }) : setEditing(null);
      case 'gender':
        return save({ gender: draftGender });
      case 'steps':
        return save({ daily_step_goal: draftSteps });
      default:
        return setEditing(null);
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

  const dob = profile?.date_of_birth ? new Date(profile.date_of_birth) : null;

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScreenHeader title="Personal details" />

        <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }}>
          {error && <ErrorNote message={error} />}

          {/* The goal sits above the rest and carries its own action: it is
              the only number here that changes the whole plan rather than one
              line of it. */}
          <Card
            style={{
              padding: 18,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <View>
              <Text style={{ color: c.text.secondary, fontSize: 15 }}>Goal weight</Text>
              <Text
                style={{ color: c.text.primary, fontSize: 24, fontWeight: '700', marginTop: 2 }}
              >
                {profile?.goal_weight_kg ? formatWeight(profile.goal_weight_kg, units) : '—'}
              </Text>
            </View>

            <Pressable
              onPress={() => router.push('/nutrition-goals')}
              accessibilityRole="button"
              accessibilityLabel="Change goal"
              style={{
                paddingHorizontal: 18,
                paddingVertical: 12,
                borderRadius: 999,
                backgroundColor: c.glass.strong,
                borderWidth: 1,
                borderColor: c.glass.border,
              }}
            >
              <Text style={{ color: c.text.primary, fontSize: 14, fontWeight: '700' }}>
                Change Goal
              </Text>
            </Pressable>
          </Card>

          <SettingsGroup>
            <EditableRow
              label="Current Weight"
              value={
                profile?.current_weight_kg ? formatWeight(profile.current_weight_kg, units) : '—'
              }
              onPress={() => open('weight')}
            />
            <EditableRow
              label="Height"
              // Rounded on the way out. The stored value can carry the float
              // left behind by an inches-to-centimetres conversion, and
              // "172.71999 cm" is a number nobody asked to be told.
              value={profile?.height_cm ? formatHeight(profile.height_cm, units) : '—'}
              onPress={() => open('height')}
            />
            <EditableRow
              label="Date of birth"
              value={
                dob
                  ? dob.toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })
                  : '—'
              }
              onPress={() => open('dob')}
            />
            <EditableRow
              label="Gender"
              value={GENDERS.find((g) => g.value === profile?.gender)?.label ?? '—'}
              onPress={() => open('gender')}
            />
            <EditableRow
              label="Daily Step Goal"
              value={`${(profile?.daily_step_goal ?? 10000).toLocaleString('en-US')} steps`}
              onPress={() => open('steps')}
              last
            />
          </SettingsGroup>

          <Text style={{ color: c.text.tertiary, fontSize: 12, lineHeight: 18 }}>
            Changing your weight, height, date of birth or gender recalculates your calorie and
            macro targets. The step goal does not — your activity level already accounts for how
            much you move, and counting it twice would inflate the target.
          </Text>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={editing !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
          onPress={() => setEditing(null)}
          accessibilityLabel="Close"
        />

        <View
          style={{
            backgroundColor: c.base['800'],
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 20,
            paddingBottom: 34,
            gap: 16,
            borderTopWidth: 1,
            borderColor: c.glass.border,
          }}
        >
          <Text style={{ color: c.text.primary, fontSize: 18, fontWeight: '700' }}>
            {editing ? TITLES[editing] : ''}
          </Text>

          {editing === 'weight' && (
            <RulerPicker
              value={units === 'imperial' ? kgToLb(draftWeightKg) : draftWeightKg}
              onChange={(next) =>
                setDraftWeightKg(units === 'imperial' ? lbToKg(next) : next)
              }
              units={units}
              // The unit switch belongs to Preferences, where it applies to
              // the whole app rather than to this one sheet.
              onUnits={() => {}}
              caption="Drag to your current weight"
              bleed={20}
            />
          )}

          {editing === 'height' && (
            <HeightPicker
              value={draftHeightCm}
              onChange={setDraftHeightCm}
              units={units}
              onUnits={() => {}}
            />
          )}

          {editing === 'dob' && (
            <DateOfBirthPicker value={draftDob ?? undefined} onChange={setDraftDob} />
          )}

          {editing === 'gender' && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {GENDERS.map((option) => {
                const active = draftGender === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setDraftGender(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 14,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: active ? c.accent.lime : c.glass.border,
                      backgroundColor: active ? c.glass.strong : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        color: c.text.primary,
                        fontSize: 15,
                        fontWeight: active ? '700' : '500',
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {editing === 'steps' && (
            <WheelGroup>
              <WheelColumn
                items={STEP_GOALS.map((value) => ({
                  value: String(value),
                  label: `${value.toLocaleString('en-US')} steps`,
                }))}
                value={String(draftSteps)}
                onChange={(next) => setDraftSteps(Number(next))}
                accessibilityLabel="Daily step goal"
              />
            </WheelGroup>
          )}

          <Button onPress={() => void commit()} loading={saving}>
            Save
          </Button>
          <Button variant="ghost" onPress={() => setEditing(null)}>
            Cancel
          </Button>
        </View>
      </Modal>
    </Screen>
  );
}

/** A row that states a value and opens its editor. */
function EditableRow({
  label,
  value,
  onPress,
  last = false,
}: {
  label: string;
  value: string;
  onPress: () => void;
  last?: boolean;
}) {
  const c = useColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityHint={`Change your ${label.toLowerCase()}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 16,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.glass.DEFAULT,
      }}
    >
      <Text style={{ flex: 1, color: c.text.primary, fontSize: 16 }}>{label}</Text>
      <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '700' }}>{value}</Text>
      <Text style={{ fontSize: 15 }}>✏️</Text>
    </Pressable>
  );
}

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { COMMON_ALLERGENS, type DietaryPreference, type Profile } from '@nutrisnap/core';
import { api, ApiError } from '../src/lib/api';
import { Button, Card, ErrorNote, Screen, ScreenHeader } from '../src/components/ui';
import { useColors } from '../src/lib/theme';

/**
 * What you do and do not eat.
 *
 * Both of these were written once during the quiz and then unreachable, which
 * was fine right up until two features started depending on them: the meal
 * suggestion engine treats them as its hardest rules, and the menu reader
 * uses them to mark dishes as Avoid. An allergen list you cannot correct is
 * the wrong shape for a field whose job is to keep shellfish off a list.
 *
 * Changes are staged and saved together rather than written per tap. Tapping
 * "peanuts" off by accident and having it saved before the finger lifts is
 * not a property anybody wants from this particular screen.
 */

/**
 * `COMMON_ALLERGENS` is a tuple of string literals, so a plain `includes`
 * against an arbitrary string is a type error. Widening once here beats
 * casting at each call site.
 */
const isCommon = (allergen: string): boolean =>
  (COMMON_ALLERGENS as readonly string[]).includes(allergen);

const DIETS: ReadonlyArray<{ value: DietaryPreference; label: string; hint: string }> = [
  { value: 'classic', label: 'Classic', hint: 'No restrictions' },
  { value: 'vegetarian', label: 'Vegetarian', hint: 'No meat or fish' },
  { value: 'vegan', label: 'Vegan', hint: 'No animal products at all' },
  { value: 'pescatarian', label: 'Pescatarian', hint: 'Fish, but no meat' },
];

export default function Diet() {
  const c = useColors();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [diet, setDiet] = useState<DietaryPreference>('classic');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Kept so the box can be handed the caret back after each entry. */
  const input = useRef<TextInput>(null);

  /**
   * Loaded once, on mount.
   *
   * Deliberately not `useFocusEffect`. This is a form with unsaved state in
   * it, and refetching on every focus overwrote `allergies` with the server's
   * copy — so anything added since the last save silently vanished. It
   * presented as only ever being able to add one thing: the first entry
   * survived because it was saved, and every one after it was wiped by the
   * next refetch before it could be.
   */
  useEffect(() => {
    api
      .getProfile()
      .then(({ profile: p }) => {
        setProfile(p);
        setDiet(p.dietary_preference ?? 'classic');
        setAllergies(p.allergies ?? []);
      })
      .catch((caught) =>
        setError(caught instanceof ApiError ? caught.message : 'Could not load your profile.'),
      )
      .finally(() => setLoading(false));
  }, []);

  function toggle(allergen: string) {
    void Haptics.selectionAsync();
    setNotice(null);
    setAllergies((current) =>
      current.includes(allergen)
        ? current.filter((entry) => entry !== allergen)
        : [...current, allergen],
    );
  }

  function addCustom() {
    const entry = custom.trim();
    if (entry === '') return;

    setAllergies((current) =>
      // Case-insensitive, so "Sesame" cannot be added next to "sesame" and
      // leave the model two rules that look like one. Checked inside the
      // updater rather than against the render's copy, so adding several in
      // quick succession cannot decide against a list that is already stale.
      current.some((a) => a.toLowerCase() === entry.toLowerCase())
        ? current
        : [...current, entry],
    );

    setCustom('');
    setNotice(null);
    // The keyboard stays up and the caret stays put, because somebody listing
    // what they cannot eat rarely has exactly one thing to say.
    input.current?.focus();
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { profile: p } = await api.updateProfile({
        dietary_preference: diet,
        allergies,
      });
      setProfile(p);
      setNotice('Saved. Suggestions and menu scans will respect this from now on.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that change.');
    } finally {
      setSaving(false);
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

  const dirty =
    diet !== (profile?.dietary_preference ?? 'classic') ||
    allergies.length !== (profile?.allergies ?? []).length ||
    allergies.some((entry) => !(profile?.allergies ?? []).includes(entry));

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScreenHeader title="Diet & allergies" />

        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {error && <ErrorNote message={error} />}
          {notice && (
            <View style={{ backgroundColor: `${c.state.success}1A`, borderRadius: 18, padding: 14 }}>
              <Text style={{ color: c.state.success, fontSize: 14, lineHeight: 20 }}>{notice}</Text>
            </View>
          )}

          <Card style={{ padding: 18, gap: 10 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              How you eat
            </Text>

            {DIETS.map((option) => {
              const active = diet === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setDiet(option.value);
                    setNotice(null);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={{
                    padding: 14,
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
                  <Text style={{ color: c.text.tertiary, fontSize: 12, marginTop: 2 }}>
                    {option.hint}
                  </Text>
                </Pressable>
              );
            })}
          </Card>

          <Card style={{ padding: 18, gap: 12 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Allergies
            </Text>
            <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
              Anything listed here is excluded outright from suggestions, and flagged as Avoid when
              a menu is scanned — including where it is an ingredient rather than the dish.
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {COMMON_ALLERGENS.map((allergen) => {
                const active = allergies.includes(allergen);
                return (
                  <Pressable
                    key={allergen}
                    onPress={() => toggle(allergen)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 11,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? 'rgba(198,255,61,0.6)' : c.glass.border,
                      backgroundColor: active ? 'rgba(198,255,61,0.10)' : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        color: active ? c.text.primary : c.text.secondary,
                        fontSize: 14,
                        textTransform: 'capitalize',
                      }}
                    >
                      {allergen}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Anything typed in rather than picked, so it can be taken off
                again — a custom entry has no chip in the grid above.

                Sits directly under that grid and above the box it was typed
                into, so everything on the list reads as one set: below the
                input it looked like output from the box rather than part of
                the same answer, and each new entry pushed the list further
                from the chips it belongs with. */}
            {allergies.filter((a) => !isCommon(a)).length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {allergies
                  .filter((a) => !isCommon(a))
                  .map((allergen) => (
                    <Pressable
                      key={allergen}
                      onPress={() => toggle(allergen)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${allergen}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        paddingHorizontal: 16,
                        paddingVertical: 11,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: 'rgba(198,255,61,0.6)',
                        backgroundColor: 'rgba(198,255,61,0.10)',
                      }}
                    >
                      <Text style={{ color: c.text.primary, fontSize: 14 }}>{allergen}</Text>
                      <Text style={{ color: c.state.danger, fontSize: 15 }}>×</Text>
                    </Pressable>
                  ))}
              </View>
            )}

            {/* The common eight cover most people and not everybody. */}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput
                ref={input}
                value={custom}
                onChangeText={setCustom}
                onSubmitEditing={addCustom}
                // Keeps the keyboard up when the return key commits an entry,
                // so the next one can be typed straight away.
                blurOnSubmit={false}
                returnKeyType="done"
                maxLength={40}
                placeholder="Something else"
                placeholderTextColor={c.text.tertiary}
                style={{
                  flex: 1,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: c.glass.border,
                  backgroundColor: c.glass.DEFAULT,
                  color: c.text.primary,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                }}
              />
              <Pressable
                onPress={addCustom}
                disabled={custom.trim() === ''}
                accessibilityRole="button"
                accessibilityLabel="Add allergy"
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 13,
                  borderRadius: 16,
                  backgroundColor: c.glass.strong,
                  borderWidth: 1,
                  borderColor: c.glass.border,
                  opacity: custom.trim() === '' ? 0.45 : 1,
                }}
              >
                <Text style={{ color: c.text.primary, fontSize: 15, fontWeight: '700' }}>Add</Text>
              </Pressable>
            </View>
          </Card>

          <Button onPress={() => void save()} loading={saving} disabled={!dirty}>
            {dirty ? 'Save changes' : 'Saved'}
          </Button>

          <Text style={{ color: c.text.tertiary, fontSize: 12, lineHeight: 18 }}>
            This tells the app what to suggest and what to warn you about. It is not a substitute
            for reading a label or asking a kitchen — an allergen the model does not know about is
            one it cannot flag.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  MEAL_SLOTS,
  describeBudget,
  formatNumber,
  reconcileSuggestion,
  safeIllustration,
  type MealBudget,
  type MealSlot,
  type MealSuggestion,
} from '@nutrisnap/core';
import { api, ApiError } from '../src/lib/api';
import { Card, ErrorNote, Screen } from '../src/components/ui';
import { FoodIllustration } from '../src/components/FoodIllustration';
import { SuggestionDetail } from '../src/components/SuggestionDetail';
import { useColors } from '../src/lib/theme';

/**
 * What to eat next.
 *
 * The calorie range is worked out on the server from the day's target and
 * what has been logged, then handed to the model as a constraint — so the
 * suggestions fit what is actually left rather than what a generic day looks
 * like. Dietary preference and allergies come off the profile, so a
 * vegetarian is never offered chicken.
 */
export default function Suggest() {
  const c = useColors();

  const [slot, setSlot] = useState<MealSlot | null>(null);
  const [budget, setBudget] = useState<MealBudget | null>(null);
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The one being read in full, if any. */
  const [open, setOpen] = useState<MealSuggestion | null>(null);
  const [logged, setLogged] = useState<string | null>(null);

  /**
   * `seen` is what is already on screen.
   *
   * Passing it makes "more ideas" mean more, rather than the same five
   * rephrased — the model is told what it has already offered and told not
   * to offer it again.
   */
  const ask = useCallback(async (chosen: MealSlot, seen?: readonly string[]) => {
    void Haptics.selectionAsync();
    setSlot(chosen);
    setBusy(true);
    setError(null);
    if (!seen) setSuggestions([]);

    try {
      const response = await api.suggestMeals(chosen, seen);
      setBudget(response.budget);
      // Reconciled here, once, so the card, the detail and the diary all
      // show the same number rather than three versions of it.
      const fresh = response.suggestions.map((item) =>
        reconcileSuggestion({ ...item, illustration: safeIllustration(item.illustration) }),
      );
      setSuggestions((current) => (seen ? [...current, ...fresh] : fresh));
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not come up with anything just now.',
      );
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingHorizontal: 20,
            paddingTop: 8,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: c.glass.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: c.text.primary, fontSize: 18, lineHeight: 20 }}>‹</Text>
          </Pressable>

          <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: '700' }}>
            Suggestions
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
          {error && (
            <View style={{ gap: 10 }}>
              <ErrorNote message={error} />
              {slot && (
                <Pressable
                  onPress={() => void ask(slot)}
                  disabled={busy}
                  accessibilityRole="button"
                  style={{
                    height: 46,
                    borderRadius: 23,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: c.glass.borderStrong,
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: c.text.primary, fontSize: 15, fontWeight: '700' }}>
                    Try again
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          <Text style={{ color: c.text.secondary, fontSize: 14, lineHeight: 20 }}>
            Pick a meal and we will suggest something that fits what is left of today, and what you
            do and do not eat.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {MEAL_SLOTS.map((option) => {
              const selected = option.value === slot;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => void ask(option.value)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={option.label}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    gap: 4,
                    paddingTop: 12,
                    paddingBottom: 12,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: selected ? c.accent.lime : c.glass.border,
                    backgroundColor: selected ? c.glass.strong : c.glass.DEFAULT,
                    opacity: busy && !selected ? 0.5 : 1,
                  }}
                >
                  <FoodIllustration name={option.illustration} size={34} />
                  <Text
                    style={{
                      color: c.text.primary,
                      fontSize: 14,
                      fontWeight: selected ? '800' : '600',
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {logged && (
            <View
              style={{
                padding: 14,
                borderRadius: 16,
                backgroundColor: `${c.state.success}1A`,
              }}
            >
              <Text style={{ color: c.state.success, fontSize: 13, lineHeight: 18 }}>
                {logged} is in today&apos;s diary — it will show under Recently uploaded.
              </Text>
            </View>
          )}

          {budget && !busy && (
            <Text style={{ color: c.text.tertiary, fontSize: 13, textAlign: 'center' }}>
              Aiming for {describeBudget(budget)}
            </Text>
          )}

          {busy && (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
              <ActivityIndicator color={c.accent.lime} />
              <Text style={{ color: c.text.tertiary, fontSize: 13 }}>Thinking about it…</Text>
            </View>
          )}

          {!busy && budget?.overspent && (
            <Card style={{ padding: 22, alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 34 }}>🌙</Text>
              <Text
                style={{
                  color: c.text.primary,
                  fontSize: 15,
                  fontWeight: '600',
                  textAlign: 'center',
                }}
              >
                Today&apos;s budget is spent
              </Text>
              <Text
                style={{
                  color: c.text.secondary,
                  fontSize: 13,
                  textAlign: 'center',
                  lineHeight: 19,
                }}
              >
                Nothing worth suggesting without going over. Tomorrow is a fresh allowance.
              </Text>
            </Card>
          )}

          {suggestions.map((item, i) => (
            <Animated.View key={`${item.name}-${i}`} entering={FadeInDown.delay(i * 80)}>
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  setOpen(item);
                }}
                accessibilityRole="button"
                accessibilityHint="Opens the amounts and where the nutrients come from"
              >
              <Card style={{ padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                {/* The picture carries the card: a wall of text is what makes
                    a list of meals hard to choose from. */}
                <View
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: 20,
                    backgroundColor: c.glass.DEFAULT,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <FoodIllustration name={item.illustration} size={64} />
                </View>

                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '700' }}>
                    {item.name}
                  </Text>
                  <Text style={{ color: c.text.secondary, fontSize: 12, lineHeight: 17 }}>
                    {item.note}
                  </Text>

                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ color: c.state.success, fontSize: 16, fontWeight: '800' }}>
                      {formatNumber(Math.round(item.calories))}
                    </Text>
                    <Text style={{ color: c.text.tertiary, fontSize: 11 }}>
                      kcal · P {Math.round(item.protein_g)} · C {Math.round(item.carbs_g)} · F{' '}
                      {Math.round(item.fat_g)}
                    </Text>
                  </View>
                </View>
              </Card>
              </Pressable>
            </Animated.View>
          ))}

          {!busy && slot && suggestions.length > 0 && (
            <Pressable
              onPress={() => void ask(slot, suggestions.map((item) => item.name))}
              accessibilityRole="button"
              style={{
                height: 50,
                borderRadius: 25,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: c.glass.borderStrong,
              }}
            >
              <Text style={{ color: c.text.primary, fontSize: 15, fontWeight: '700' }}>
                More ideas
              </Text>
            </Pressable>
          )}

          {!busy && slot && suggestions.length === 0 && !budget?.overspent && !error && (
            <Text style={{ color: c.text.tertiary, fontSize: 13, textAlign: 'center' }}>
              Nothing came back. Try another meal.
            </Text>
          )}
        </ScrollView>

        {open && (
          <SuggestionDetail
            suggestion={open}
            onClose={() => setOpen(null)}
            onLogged={() => {
              setLogged(open.name);
              setOpen(null);
            }}
          />
        )}
      </SafeAreaView>
    </Screen>
  );
}

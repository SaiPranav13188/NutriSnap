import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  LEAD_NUTRIENTS,
  formatNumber,
  nutrientLeaders,
  type MealSuggestion,
} from '@nutrisnap/core';
import { api, ApiError } from '../lib/api';
import { logMeal } from '../lib/pendingLogs';
import { FoodIllustration } from './FoodIllustration';
import { ErrorNote } from './ui';
import { useColors } from '../lib/theme';

/**
 * A suggestion, opened up.
 *
 * Two questions follow "what should I eat": how much of it, and where the
 * protein is coming from. Both are answered here rather than on the card,
 * because a list of four meals each carrying a full breakdown is a list
 * nobody reads.
 */
export function SuggestionDetail({
  suggestion,
  onClose,
  onLogged,
}: {
  suggestion: MealSuggestion;
  onClose: () => void;
  onLogged: () => void;
}) {
  const c = useColors();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoised so the `?? []` fallback does not hand the hooks below a fresh
  // array on every render.
  const items = useMemo(() => suggestion.items ?? [], [suggestion.items]);
  const leaders = useMemo(() => nutrientLeaders(items), [items]);

  /**
   * Already reconciled against the breakdown by the screen that opened this,
   * so the totals here are the sum of the amounts below them.
   */
  const totals = {
    calories: suggestion.calories,
    protein_g: suggestion.protein_g,
    carbs_g: suggestion.carbs_g,
    fat_g: suggestion.fat_g,
    fiber_g: suggestion.fiber_g ?? 0,
  };

  async function log() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await logMeal({
        name: suggestion.name,
        serving_multiplier: 1,
        calories: Math.round(totals.calories),
        protein_g: Math.round(totals.protein_g),
        carbs_g: Math.round(totals.carbs_g),
        fat_g: Math.round(totals.fat_g),
        fiber_g: Math.round(totals.fiber_g),
        // The breakdown travels with the log, so the meal can be opened later
        // and still say what went into it.
        ingredients: items.map((item) => ({
          name: `${item.name} (${item.amount})`,
          grams: 0,
          calories: Math.round(item.calories),
        })),
        source: 'manual',
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onLogged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not log that meal.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.base['900'] }} edges={['top', 'bottom']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingHorizontal: 20,
            paddingTop: 6,
          }}
        >
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
            <Text style={{ color: c.text.tertiary, fontSize: 18 }}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 30 }}>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 132,
                height: 132,
                borderRadius: 32,
                backgroundColor: c.glass.DEFAULT,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FoodIllustration name={suggestion.illustration} size={104} />
            </View>

            <Text
              style={{
                color: c.text.primary,
                fontSize: 22,
                fontWeight: '700',
                textAlign: 'center',
              }}
            >
              {suggestion.name}
            </Text>
            <Text
              style={{
                color: c.text.secondary,
                fontSize: 13,
                lineHeight: 19,
                textAlign: 'center',
              }}
            >
              {suggestion.note}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Macro label="kcal" value={Math.round(totals.calories)} tint={c.state.success} />
            <Macro label="Protein" value={Math.round(totals.protein_g)} suffix="g" />
            <Macro label="Carbs" value={Math.round(totals.carbs_g)} suffix="g" />
            <Macro label="Fat" value={Math.round(totals.fat_g)} suffix="g" />
            <Macro label="Fibre" value={Math.round(totals.fiber_g)} suffix="g" />
          </View>

          {/* Where each nutrient is actually coming from. */}
          {Object.keys(leaders).length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ color: c.text.secondary, fontSize: 12, fontWeight: '700' }}>
                WHERE IT COMES FROM
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {LEAD_NUTRIENTS.filter((entry) => leaders[entry.key]).map((entry) => (
                  <View
                    key={entry.key}
                    style={{
                      flexDirection: 'row',
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: c.glass.border,
                      backgroundColor: c.glass.DEFAULT,
                    }}
                  >
                    <Text style={{ color: c.accent.cyan, fontSize: 12, fontWeight: '700' }}>
                      {entry.label}
                    </Text>
                    <Text style={{ color: c.text.secondary, fontSize: 12 }}>
                      {leaders[entry.key]}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {items.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ color: c.text.secondary, fontSize: 12, fontWeight: '700' }}>
                HOW MUCH
              </Text>

              {items.map((item, i) => (
                <View
                  key={`${item.name}-${i}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 13,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: c.glass.border,
                    backgroundColor: c.glass.DEFAULT,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text.primary, fontSize: 14, fontWeight: '600' }}>
                      {item.name}
                    </Text>
                    <Text style={{ color: c.accent.cyan, fontSize: 13, marginTop: 2 }}>
                      {item.amount}
                    </Text>
                    <Text style={{ color: c.text.tertiary, fontSize: 11, marginTop: 3 }}>
                      P {Math.round(item.protein_g)} · C {Math.round(item.carbs_g)} · F{' '}
                      {Math.round(item.fat_g)} · Fib {Math.round(item.fiber_g)}
                    </Text>
                  </View>

                  <Text style={{ color: c.text.primary, fontSize: 14, fontWeight: '700' }}>
                    {Math.round(item.calories)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {error && <ErrorNote message={error} />}

          <Pressable
            onPress={() => void log()}
            disabled={saving}
            accessibilityRole="button"
            style={{
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.accent.lime,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator color={c.base['900']} />
            ) : (
              <Text style={{ color: c.base['900'], fontSize: 16, fontWeight: '800' }}>
                Log this meal
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Macro({
  label,
  value,
  suffix,
  tint,
}: {
  label: string;
  value: number;
  suffix?: string;
  tint?: string;
}) {
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
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color: tint ?? c.text.primary, fontSize: 17, fontWeight: '800' }}
      >
        {formatNumber(value)}
        {suffix ?? ''}
      </Text>
      <Text style={{ color: c.text.tertiary, fontSize: 10 }}>{label}</Text>
    </View>
  );
}

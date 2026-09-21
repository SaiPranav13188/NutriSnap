import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  formatNumber,
  scaleIngredients,
  scaleTotals,
  type FoodLog,
  type MacroTotals,
} from '@nutrisnap/core';
import { Button, Card, ErrorNote } from './ui';
import { useColors } from '../lib/theme';

/**
 * Edit a logged meal: its name and its portion size.
 *
 * Getting the portion wrong is the most common thing to want to fix, and until
 * now the only route was to delete the meal and scan it again.
 *
 * The arithmetic subtlety: the stored macros already have the original
 * multiplier applied, and `serving_multiplier` records which one. So changing
 * the portion scales by the RATIO of new to old, not by the new value — doing
 * the latter would compound the original multiplier every time the sheet was
 * opened.
 */

const PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2];

interface MealEditSheetProps {
  log: FoodLog;
  visible: boolean;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}

export function MealEditSheet({ log, visible, onClose, onSave }: MealEditSheetProps) {
  const c = useColors();

  const originalMultiplier = log.serving_multiplier > 0 ? log.serving_multiplier : 1;

  const [name, setName] = useState(log.name);
  const [multiplier, setMultiplier] = useState(originalMultiplier);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ratio = multiplier / originalMultiplier;

  const preview: MacroTotals = useMemo(
    () =>
      scaleTotals(
        {
          calories: log.calories,
          protein_g: log.protein_g,
          carbs_g: log.carbs_g,
          fat_g: log.fat_g,
          sugar_g: log.sugar_g ?? 0,
          fiber_g: log.fiber_g ?? 0,
          sodium_mg: log.sodium_mg ?? 0,
        },
        ratio,
      ),
    [log, ratio],
  );

  const nudge = (direction: 1 | -1) => {
    void Haptics.selectionAsync();
    setMultiplier((m) => Math.min(10, Math.max(0.1, Number((m + direction * 0.1).toFixed(2)))));
  };

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the meal a name.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave({
        name: trimmed,
        serving_multiplier: multiplier,
        calories: Math.round(preview.calories),
        protein_g: Math.round(preview.protein_g),
        carbs_g: Math.round(preview.carbs_g),
        fat_g: Math.round(preview.fat_g),
        sugar_g: Math.round(preview.sugar_g),
        fiber_g: Math.round(preview.fiber_g),
        sodium_mg: Math.round(preview.sodium_mg),
        ingredients: scaleIngredients(log.ingredients, ratio),
        ...(log.estimated_grams != null
          ? { estimated_grams: Math.round(log.estimated_grams * ratio) }
          : {}),
      });
      onClose();
    } catch {
      setError('Could not save those changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: c.base['800'],
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: '88%',
          }}
        >
          <SafeAreaView edges={['bottom']}>
            <ScrollView contentContainerStyle={{ padding: 22, gap: 18 }}>
              <View
                style={{
                  alignSelf: 'center',
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: c.glass.borderStrong,
                }}
              />

              <Text style={{ color: c.text.primary, fontSize: 20, fontWeight: '700' }}>
                Edit meal
              </Text>

              {error && <ErrorNote message={error} />}

              <View style={{ gap: 8 }}>
                <Text style={{ color: c.text.secondary, fontSize: 13 }}>Name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="What was it?"
                  placeholderTextColor={c.text.tertiary}
                  style={{
                    height: 52,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: c.glass.border,
                    backgroundColor: c.glass.DEFAULT,
                    color: c.text.primary,
                    fontSize: 16,
                    paddingHorizontal: 16,
                  }}
                />
              </View>

              <View style={{ gap: 10 }}>
                <Text style={{ color: c.text.secondary, fontSize: 13 }}>Portion</Text>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {PRESETS.map((preset) => {
                    const selected = Math.abs(multiplier - preset) < 0.001;
                    return (
                      <Pressable
                        key={preset}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          setMultiplier(preset);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 9,
                          borderRadius: 999,
                          backgroundColor: selected ? c.accent.lime : c.glass.DEFAULT,
                        }}
                      >
                        <Text
                          style={{
                            color: selected ? c.base['900'] : c.text.secondary,
                            fontSize: 14,
                            fontWeight: '600',
                          }}
                        >
                          {preset}x
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 }}
                >
                  <Pressable
                    onPress={() => nudge(-1)}
                    accessibilityRole="button"
                    accessibilityLabel="Smaller portion"
                    hitSlop={8}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      borderWidth: 1,
                      borderColor: c.glass.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: c.text.primary, fontSize: 22 }}>-</Text>
                  </Pressable>

                  <Text
                    style={{ color: c.text.primary, fontSize: 24, fontWeight: '700', minWidth: 74, textAlign: 'center' }}
                  >
                    {multiplier.toFixed(2).replace(/\.?0+$/, '')}x
                  </Text>

                  <Pressable
                    onPress={() => nudge(1)}
                    accessibilityRole="button"
                    accessibilityLabel="Larger portion"
                    hitSlop={8}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      borderWidth: 1,
                      borderColor: c.glass.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: c.text.primary, fontSize: 22 }}>+</Text>
                  </Pressable>
                </View>
              </View>

              <Card style={{ padding: 18, alignItems: 'center', gap: 12 }}>
                <Text style={{ color: c.accent.lime, fontSize: 32, fontWeight: '700' }}>
                  {formatNumber(Math.round(preview.calories))}
                  <Text style={{ color: c.text.tertiary, fontSize: 14, fontWeight: '500' }}>
                    {' '}
                    kcal
                  </Text>
                </Text>

                <View style={{ flexDirection: 'row', gap: 20 }}>
                  {(
                    [
                      { label: 'P', value: preview.protein_g, color: c.macro.protein },
                      { label: 'C', value: preview.carbs_g, color: c.macro.carbs },
                      { label: 'F', value: preview.fat_g, color: c.macro.fat },
                    ] as const
                  ).map((macro) => (
                    <Text key={macro.label} style={{ color: macro.color, fontSize: 14, fontWeight: '600' }}>
                      {macro.label} {Math.round(macro.value)}g
                    </Text>
                  ))}
                </View>
              </Card>

              <Button onPress={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>

              <Pressable onPress={onClose} accessibilityRole="button" disabled={saving}>
                <Text style={{ color: c.text.tertiary, fontSize: 14, textAlign: 'center' }}>
                  Cancel
                </Text>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

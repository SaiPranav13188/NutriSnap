import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  MEAL_SLOTS,
  describeBudget,
  describeMenu,
  formatNumber,
  type DishVerdict,
  type MealSlot,
  type RankedDish,
} from '@nutrisnap/core';
import { api, ApiError, type MenuResponse } from '../src/lib/api';
import { logMeal } from '../src/lib/pendingLogs';
import { Button, Card, ErrorNote, Screen } from '../src/components/ui';
import { FoodIllustration } from '../src/components/FoodIllustration';
import { CameraSheet, type CapturedPhoto } from '../src/components/CameraSheet';
import { useColors } from '../src/lib/theme';

/**
 * The menu reader.
 *
 * Every tracker can look up a Big Mac. None of them can help at the
 * independent place around the corner, where the only nutrition information
 * on the premises is a laminated card of dish names — so the card gets
 * photographed, and the dishes come back ordered against what is actually
 * left of the day.
 *
 * The ranking is not done here and not done by the model: the server reads
 * the menu, then `rankMenu` in core does the arithmetic. This screen renders
 * the answer and lets one dish be logged.
 */

/**
 * The meal the clock suggests, for the chip that starts selected.
 *
 * Deliberately not `inferMealType`, which has a fourth bucket for late-night
 * snacking. There is no snack budget to rank a menu against, so the evening
 * runs to midnight here.
 */
function slotNow(): MealSlot {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  return 'dinner';
}

const VERDICT_LABEL: Record<DishVerdict, string> = {
  fits: 'Fits',
  light: 'Light',
  over: 'Over',
  excluded: 'Avoid',
};

export default function Menu() {
  const c = useColors();

  const [slot, setSlot] = useState<MealSlot>(slotNow);
  const [result, setResult] = useState<MenuResponse | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /**
   * Which dish has its "add" button showing, by position.
   *
   * Not by name: a menu that lists the same side under two headings would
   * otherwise open both at once.
   */
  const [open, setOpen] = useState<number | null>(null);
  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verdictColour: Record<DishVerdict, string> = {
    fits: c.state.success,
    light: c.accent.cyan,
    over: c.state.warning,
    excluded: c.state.danger,
  };

  async function read(photo: CapturedPhoto) {
    setBusy(true);
    setError(null);
    setOpen(null);
    setLogged(null);

    try {
      const response = await api.analyzeMenu({
        image: photo.base64,
        media_type: photo.mediaType,
        slot,
      });
      setResult(response);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not read that menu.');
    } finally {
      setBusy(false);
    }
  }

  async function pickFromLibrary() {
    setError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(
        permission.canAskAgain
          ? 'NutriSnap needs photo access to read your library.'
          : 'Photo access is off for NutriSnap. Turn it on in your phone’s settings to pick a menu from your library.',
      );
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
      allowsEditing: false,
    });

    if (picked.canceled || !picked.assets[0]?.base64) return;

    const asset = picked.assets[0];
    await read({
      uri: asset.uri,
      base64: asset.base64!,
      mediaType: asset.mimeType ?? 'image/jpeg',
    });
  }

  async function logDish(entry: RankedDish) {
    setLogging(true);
    setError(null);

    try {
      await logMeal({
        name: entry.dish.name,
        serving_multiplier: 1,
        calories: Math.round(entry.dish.calories),
        protein_g: Math.round(entry.dish.protein_g),
        carbs_g: Math.round(entry.dish.carbs_g),
        fat_g: Math.round(entry.dish.fat_g),
        fiber_g: Math.round(entry.dish.fiber_g),
        /**
         * A dish read off a menu was estimated from its name and a line of
         * description — which is exactly what the text logger does, so it is
         * logged as text rather than as a photo. Nobody photographed the
         * food; they photographed a card about the food.
         */
        source: 'text',
        // Carried through so the day's error bar knows how firm this one is.
        ai_confidence: entry.dish.confidence,
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLogged(entry.dish.name);
      setOpen(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not log that dish.');
    } finally {
      setLogging(false);
    }
  }

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

          <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: '700' }}>Menu</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
          {error && <ErrorNote message={error} />}

          <Text style={{ color: c.text.secondary, fontSize: 14, lineHeight: 20 }}>
            Photograph the menu and we will work out which dishes fit what is left of today — and
            which ones you should not be ordering at all.
          </Text>

          {/* The budget depends on which meal this is, so it is asked before
              the photo rather than assumed from the clock alone. */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {MEAL_SLOTS.map((option) => {
              const selected = option.value === slot;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setSlot(option.value);
                  }}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={option.label}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    gap: 4,
                    paddingVertical: 12,
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

          {!result && !busy && (
            <Card style={{ padding: 20, gap: 16 }}>
              <View
                style={{
                  aspectRatio: 1,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: c.glass.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 24,
                }}
              >
                <Text style={{ fontSize: 40 }}>📋</Text>
                <Text
                  style={{
                    color: c.text.primary,
                    fontSize: 16,
                    fontWeight: '600',
                    marginTop: 16,
                    textAlign: 'center',
                  }}
                >
                  Photograph the menu
                </Text>
                <Text
                  style={{
                    color: c.text.secondary,
                    fontSize: 13,
                    marginTop: 8,
                    textAlign: 'center',
                    lineHeight: 19,
                  }}
                >
                  One page at a time, close enough to read. Anything blurred gets left out rather
                  than guessed at.
                </Text>
              </View>

              <Button
                onPress={() => {
                  setError(null);
                  setCameraOpen(true);
                }}
              >
                Take photo
              </Button>
              <Button variant="glass" onPress={() => void pickFromLibrary()}>
                Choose from library
              </Button>
            </Card>
          )}

          {busy && (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
              <ActivityIndicator color={c.accent.lime} />
              <Text style={{ color: c.text.tertiary, fontSize: 13 }}>Reading the menu…</Text>
            </View>
          )}

          {logged && (
            <View style={{ padding: 14, borderRadius: 16, backgroundColor: `${c.state.success}1A` }}>
              <Text style={{ color: c.state.success, fontSize: 13, lineHeight: 18 }}>
                {logged} is in today&apos;s diary.
              </Text>
            </View>
          )}

          {result && !busy && (
            <>
              <Card style={{ padding: 18, gap: 6 }}>
                {result.venue && (
                  <Text style={{ color: c.text.primary, fontSize: 17, fontWeight: '700' }}>
                    {result.venue}
                  </Text>
                )}
                <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
                  {describeMenu(result.dishes)}
                </Text>
                <Text style={{ color: c.text.tertiary, fontSize: 12 }}>
                  Aiming for {describeBudget(result.budget)}
                  {result.protein_left_g > 0
                    ? ` · ${formatNumber(result.protein_left_g)}g protein still owed`
                    : ''}
                </Text>
              </Card>

              {result.dishes.map((entry, i) => {
                const isOpen = open === i;
                const colour = verdictColour[entry.verdict];
                const loggable = entry.verdict !== 'excluded';

                return (
                  <Animated.View
                    key={`${entry.dish.name}-${i}`}
                    entering={FadeInDown.delay(Math.min(i, 8) * 60)}
                  >
                    <Pressable
                      onPress={() => {
                        if (!loggable) return;
                        void Haptics.selectionAsync();
                        setOpen(isOpen ? null : i);
                      }}
                      disabled={!loggable}
                      accessibilityRole="button"
                      accessibilityLabel={`${entry.dish.name}, ${Math.round(
                        entry.dish.calories,
                      )} calories. ${entry.reason}`}
                      accessibilityHint={loggable ? 'Opens the button to log this dish' : undefined}
                    >
                      <Card
                        style={{
                          padding: 16,
                          gap: 10,
                          // The one dish worth ordering should be findable
                          // without reading all twenty.
                          borderColor: i === 0 && entry.verdict === 'fits' ? colour : c.glass.border,
                          opacity: entry.verdict === 'excluded' ? 0.55 : 1,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{ color: c.text.primary, fontSize: 16, fontWeight: '700' }}
                            >
                              {entry.dish.name}
                            </Text>
                            {entry.dish.section && (
                              <Text style={{ color: c.text.tertiary, fontSize: 11, marginTop: 2 }}>
                                {entry.dish.section}
                              </Text>
                            )}
                          </View>

                          <View
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 999,
                              backgroundColor: `${colour}1A`,
                            }}
                          >
                            <Text style={{ color: colour, fontSize: 11, fontWeight: '700' }}>
                              {VERDICT_LABEL[entry.verdict]}
                            </Text>
                          </View>
                        </View>

                        <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 18 }}>
                          {entry.reason}
                        </Text>

                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                          <Text style={{ color: c.accent.lime, fontSize: 16, fontWeight: '800' }}>
                            {formatNumber(Math.round(entry.dish.calories))}
                          </Text>
                          <Text style={{ color: c.text.tertiary, fontSize: 11 }}>
                            kcal · P {Math.round(entry.dish.protein_g)} · C{' '}
                            {Math.round(entry.dish.carbs_g)} · F {Math.round(entry.dish.fat_g)}
                          </Text>
                        </View>

                        {isOpen && (
                          <Button onPress={() => void logDish(entry)} loading={logging}>
                            Add to my day
                          </Button>
                        )}
                      </Card>
                    </Pressable>
                  </Animated.View>
                );
              })}

              <Button
                variant="glass"
                onPress={() => {
                  setResult(null);
                  setOpen(null);
                  setLogged(null);
                }}
              >
                Read another menu
              </Button>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <CameraSheet
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        hint="One page at a time, close enough to read the prices."
        onCapture={(photo) => {
          setCameraOpen(false);
          void read(photo);
        }}
      />
    </Screen>
  );
}

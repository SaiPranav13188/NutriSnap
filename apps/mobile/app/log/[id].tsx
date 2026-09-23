import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  describeEaten,
  describeOutcome,
  describeSatiety,
  formatNumber,
  logSigma,
  personalSatiety,
  satietyOutcomesFromLogs,
  type FoodLog,
  type LogSource,
} from '@nutrisnap/core';
import { api, ApiError } from '../../src/lib/api';
import { Card, ErrorNote, Metric, Screen } from '../../src/components/ui';
import { MealEditSheet } from '../../src/components/MealEditSheet';
import { IngredientOverlay } from '../../src/components/IngredientOverlay';
import { CameraSheet } from '../../src/components/CameraSheet';
import { useColors } from '../../src/lib/theme';

/**
 * The full report for one logged meal.
 *
 * Tapping a row on the dashboard used to do nothing — the only gesture it
 * carried was a long press to delete, which is both undiscoverable and
 * destructive. Everything the scan captured beyond the four headline numbers
 * (the photo, the ingredient breakdown, how confident the model was, what
 * serving size was applied) had nowhere to be read back.
 */

const SOURCE_LABELS: Record<LogSource, string> = {
  photo: 'Photo scan',
  barcode: 'Barcode',
  label: 'Nutrition label',
  text: 'Text description',
  manual: 'Entered by hand',
  favorite: 'Saved favourite',
};

/** One label-and-value line in the details card. */
function DetailRow({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}
    >
      <Text style={{ color: c.text.tertiary, fontSize: 13 }}>{label}</Text>
      <Text
        style={{ color: c.text.secondary, fontSize: 14, fontWeight: '500', flexShrink: 1 }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export default function LogDetail() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [log, setLog] = useState<FoodLog | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [favouriting, setFavouriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Plate-diff: photographing what was left, and what came of it. */
  const [scanningPlate, setScanningPlate] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState<string | null>(null);

  /**
   * Recent meals, for two jobs: calibrating the satiety model to this person,
   * and finding what they ate next so the prediction can be graded.
   */
  const [recent, setRecent] = useState<FoodLog[]>([]);

  /**
   * Meal photos live in a private bucket, so `photo_url` holds a storage path
   * rather than something an <Image> can fetch. It has to be exchanged for a
   * signed URL first — handing the raw path straight to the image source is
   * what left this screen showing an empty grey square.
   */
  const resolvePhoto = useCallback(async (stored: string | null) => {
    if (!stored) {
      setPhotoUri(null);
      return;
    }

    // Older logs, and anything captured before the bucket existed, may already
    // hold a usable URL.
    if (/^(https?:|file:|data:)/.test(stored)) {
      setPhotoUri(stored);
      return;
    }

    try {
      const { url } = await api.getPhotoUrl(stored);
      setPhotoUri(url);
    } catch {
      // The report stands on its own without the picture.
      setPhotoUri(null);
    }
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const { log: found } = await api.getLog(id);
      setLog(found);
      void resolvePhoto(found.photo_url);

      // Fetched alongside rather than blocking on: the report stands without
      // the satiety line, and a failure here should not empty the screen.
      void api
        .getRecent(60)
        .then(({ logs }) => setRecent(logs))
        .catch(() => setRecent([]));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load that meal.');
    } finally {
      setLoading(false);
    }
  }, [id, resolvePhoto]);

  // Reload on focus so an edit made elsewhere is reflected on the way back.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /**
   * Correct this meal by what was left on the plate.
   *
   * The photo goes straight to the server, which measures it against this
   * meal's own ingredient list and scales the log down. Nothing is
   * re-estimated here, so a blurry second picture cannot overwrite a good
   * first one.
   */
  const applyLeftoverPhoto = useCallback(
    async (base64: string, mediaType: string) => {
      if (!id) return;
      setScanningPlate(false);
      setCorrecting(true);
      setError(null);
      setCorrection(null);

      try {
        const result = await api.correctLeftovers(id, base64, mediaType);
        setLog(result.log);

        if (result.changed) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setCorrection(
            `${describeEaten(result.eaten_fraction)} — this meal is now ${formatNumber(
              Math.round(result.log.calories),
            )} kcal.`,
          );
        } else {
          setCorrection('That plate looks finished, so the meal is unchanged.');
        }
      } catch (caught) {
        setError(
          caught instanceof ApiError ? caught.message : 'Could not read that plate.',
        );
      } finally {
        setCorrecting(false);
      }
    },
    [id],
  );

  /**
   * How long this meal should hold, and how long it did.
   *
   * The prediction is bent towards this person by their own history, and the
   * grade comes from the gap to whatever they logged next — both of which are
   * already on disk, so neither needs a column of its own.
   */
  const satiety = useMemo(() => {
    if (!log) return null;

    const outcomes = satietyOutcomesFromLogs(recent);
    const prediction = personalSatiety(
      {
        calories: log.calories,
        protein_g: log.protein_g,
        fat_g: log.fat_g,
        fiber_g: log.fiber_g ?? 0,
        sugar_g: log.sugar_g ?? 0,
      },
      outcomes,
    );

    if (prediction.hours <= 0) return null;

    // The next meal after this one, if there was one close enough to count.
    const loggedAt = Date.parse(log.logged_at);
    const next = recent
      .filter((entry) => Date.parse(entry.logged_at) > loggedAt)
      .sort((a, b) => Date.parse(a.logged_at) - Date.parse(b.logged_at))[0];

    const actualHours = next ? (Date.parse(next.logged_at) - loggedAt) / 3_600_000 : null;

    return {
      line: describeSatiety(prediction),
      calibrated: prediction.calibrated,
      outcome:
        actualHours !== null && actualHours > 0 && actualHours <= 8
          ? describeOutcome({ predictedHours: prediction.hours, actualHours })
          : null,
    };
  }, [log, recent]);

  const saveEdits = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!log) return;
      const { log: updated } = await api.updateLog(log.id, patch);
      setLog(updated);
    },
    [log],
  );

  /**
   * Favourites drive one-tap re-logging. The toggle writes straight through
   * and reflects the row the server returns rather than guessing locally, so
   * a failed write cannot leave the star lit.
   */
  const toggleFavourite = useCallback(async () => {
    if (!log || favouriting) return;
    setFavouriting(true);
    try {
      const { log: updated } = await api.updateLog(log.id, { is_favorite: !log.is_favorite });
      setLog(updated);
      void Haptics.selectionAsync();
    } catch {
      setError('Could not update that.');
    } finally {
      setFavouriting(false);
    }
  }, [log, favouriting]);

  const confirmDelete = () => {
    if (!log) return;
    Alert.alert('Delete this meal?', `"${log.name}" will be removed from your day.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await api.deleteLog(log.id);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          } catch {
            setDeleting(false);
            setError('Could not delete that meal.');
          }
        },
      },
    ]);
  };

  const photoSize = width - 40;

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
            paddingBottom: 4,
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

          <Text
            style={{ color: c.text.secondary, fontSize: 13, letterSpacing: 1.2, flex: 1 }}
            accessibilityRole="header"
          >
            MEAL REPORT
          </Text>

          {log && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={toggleFavourite}
                disabled={favouriting}
                accessibilityRole="button"
                accessibilityState={{ selected: log.is_favorite }}
                accessibilityLabel={
                  log.is_favorite ? 'Remove from favourites' : 'Save to favourites'
                }
                hitSlop={8}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: log.is_favorite ? c.accent.lime : c.glass.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: favouriting ? 0.5 : 1,
                }}
              >
                <Text style={{ fontSize: 15 }}>{log.is_favorite ? '\u2605' : '\u2606'}</Text>
              </Pressable>

              <Pressable
                onPress={() => setEditing(true)}
                accessibilityRole="button"
                accessibilityLabel="Edit this meal"
                hitSlop={8}
                style={{
                  paddingHorizontal: 14,
                  height: 36,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: c.glass.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: c.text.primary, fontSize: 13, fontWeight: '600' }}>
                  Edit
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={c.accent.lime} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
            {error && <ErrorNote message={error} />}

            {!log ? (
              !error && (
                <Card style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: c.text.secondary }}>This meal is no longer here.</Text>
                </Card>
              )
            ) : (
              <>
                <Text
                  style={{
                    color: c.text.primary,
                    fontSize: 26,
                    fontWeight: '700',
                    lineHeight: 32,
                  }}
                >
                  {log.name}
                </Text>

                {photoUri ? (
                  <Animated.View entering={FadeInDown.duration(320)}>
                    {log.ingredients.length > 0 ? (
                      <IngredientOverlay
                        uri={photoUri}
                        ingredients={log.ingredients}
                        totalProteinG={log.protein_g}
                        size={photoSize}
                      />
                    ) : (
                      <Image
                        source={{ uri: photoUri }}
                        style={{ width: photoSize, height: photoSize, borderRadius: 24 }}
                        accessibilityLabel={`Photo of ${log.name}`}
                        onError={() => setPhotoUri(null)}
                      />
                    )}
                  </Animated.View>
                ) : log.photo_url ? (
                  // Held a photo, but it could not be fetched. Say so rather
                  // than leaving a blank rectangle the user has to interpret.
                  <Card style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ color: c.text.tertiary, fontSize: 13 }}>
                      Photo unavailable.
                    </Text>
                  </Card>
                ) : null}

                <Card style={{ padding: 22, alignItems: 'center', gap: 20 }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text
                      style={{ color: c.accent.lime, fontSize: 44, fontWeight: '700' }}
                    >
                      {formatNumber(Math.round(log.calories))}
                    </Text>
                    <Text
                      style={{
                        color: c.text.tertiary,
                        fontSize: 11,
                        letterSpacing: 2,
                        textTransform: 'uppercase',
                        marginTop: 2,
                      }}
                    >
                      kcal
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-around',
                      alignSelf: 'stretch',
                    }}
                  >
                    <Metric
                      label="Protein"
                      value={log.protein_g}
                      suffix="g"
                      color={c.macro.protein}
                    />
                    <Metric label="Carbs" value={log.carbs_g} suffix="g" color={c.macro.carbs} />
                    <Metric label="Fat" value={log.fat_g} suffix="g" color={c.macro.fat} />
                  </View>
                </Card>

                {log.ingredients.length > 0 && (
                  <Card style={{ padding: 20, gap: 14 }}>
                    <Text
                      style={{
                        color: c.text.secondary,
                        fontSize: 12,
                        fontWeight: '600',
                        letterSpacing: 1.2,
                        textTransform: 'uppercase',
                      }}
                    >
                      What&apos;s in it
                    </Text>

                    {log.ingredients.map((ingredient, i) => (
                      <View
                        key={`${ingredient.name}-${i}`}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        <Text
                          style={{ color: c.text.primary, fontSize: 15, flex: 1 }}
                          numberOfLines={1}
                        >
                          {ingredient.name}
                        </Text>
                        <Text style={{ color: c.text.tertiary, fontSize: 13 }}>
                          {Math.round(ingredient.grams)}g
                        </Text>
                        <Text
                          style={{
                            color: c.text.secondary,
                            fontSize: 13,
                            fontWeight: '600',
                            minWidth: 64,
                            textAlign: 'right',
                          }}
                        >
                          {formatNumber(Math.round(ingredient.calories))} kcal
                        </Text>
                      </View>
                    ))}
                  </Card>
                )}

                <Card style={{ padding: 20, gap: 13 }}>
                  <Text
                    style={{
                      color: c.text.secondary,
                      fontSize: 12,
                      fontWeight: '600',
                      letterSpacing: 1.2,
                      textTransform: 'uppercase',
                    }}
                  >
                    Details
                  </Text>

                  <DetailRow
                    label="Logged"
                    value={new Date(log.logged_at).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  />
                  <DetailRow label="Source" value={SOURCE_LABELS[log.source] ?? log.source} />
                  {log.meal_type && (
                    <DetailRow
                      label="Meal"
                      value={log.meal_type[0]!.toUpperCase() + log.meal_type.slice(1)}
                    />
                  )}
                  {log.serving_multiplier !== 1 && (
                    <DetailRow label="Serving" value={`${log.serving_multiplier}×`} />
                  )}
                  {log.estimated_grams != null && (
                    <DetailRow
                      label="Estimated weight"
                      value={`${Math.round(log.estimated_grams)}g`}
                    />
                  )}
                  {log.barcode && <DetailRow label="Barcode" value={log.barcode} />}
                  {log.ai_confidence != null && (
                    // Worth surfacing: an estimate the model was unsure about is
                    // one the user may want to correct rather than trust.
                    <DetailRow
                      label="Model confidence"
                      value={`${Math.round(log.ai_confidence * 100)}%`}
                    />
                  )}

                  {/* What that confidence and this way of logging are worth in
                      calories — the same figure this meal contributes to the
                      band under the ring on the home screen. */}
                  <DetailRow
                    label="Estimate margin"
                    value={`± ${formatNumber(Math.round(logSigma(log)))} kcal`}
                  />
                </Card>

                {(log.sugar_g != null || log.fiber_g != null || log.sodium_mg != null) && (
                  <Card style={{ padding: 20, gap: 13 }}>
                    <Text
                      style={{
                        color: c.text.secondary,
                        fontSize: 12,
                        fontWeight: '600',
                        letterSpacing: 1.2,
                        textTransform: 'uppercase',
                      }}
                    >
                      Also tracked
                    </Text>
                    {log.sugar_g != null && (
                      <DetailRow label="Sugar" value={`${Math.round(log.sugar_g)}g`} />
                    )}
                    {log.fiber_g != null && (
                      <DetailRow label="Fiber" value={`${Math.round(log.fiber_g)}g`} />
                    )}
                    {log.sodium_mg != null && (
                      <DetailRow label="Sodium" value={`${Math.round(log.sodium_mg)}mg`} />
                    )}
                  </Card>
                )}

                {satiety && (
                  <Card style={{ padding: 16, gap: 6, marginTop: 4 }}>
                    <Text style={{ color: c.text.primary, fontSize: 14, lineHeight: 20 }}>
                      {satiety.line}
                    </Text>

                    {satiety.outcome && (
                      <Text style={{ color: c.accent.cyan, fontSize: 13, lineHeight: 18 }}>
                        {satiety.outcome}
                      </Text>
                    )}

                    <Text style={{ color: c.text.tertiary, fontSize: 11, lineHeight: 16 }}>
                      {satiety.calibrated
                        ? 'Tuned to how your own meals have actually gone.'
                        : 'A rule of thumb for now — it learns from your meals as you log them.'}
                    </Text>
                  </Card>
                )}

                {correction && (
                  <View
                    style={{
                      marginTop: 4,
                      padding: 14,
                      borderRadius: 16,
                      backgroundColor: `${c.state.success}1A`,
                    }}
                  >
                    <Text style={{ color: c.state.success, fontSize: 13, lineHeight: 19 }}>
                      {correction}
                    </Text>
                  </View>
                )}

                {/* Plate-diff. The photo that was logged shows what was
                    served; this one shows what was actually eaten. */}
                <Pressable
                  onPress={() => {
                    setCorrection(null);
                    setScanningPlate(true);
                  }}
                  disabled={correcting}
                  accessibilityRole="button"
                  accessibilityLabel="Photograph what is left on the plate"
                  accessibilityHint="Corrects this meal by what you did not finish"
                  style={{
                    marginTop: 4,
                    paddingVertical: 15,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: c.glass.borderStrong,
                    alignItems: 'center',
                    opacity: correcting ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: c.text.primary, fontSize: 15, fontWeight: '600' }}>
                    {correcting ? 'Reading the plate…' : "Didn't finish it? Photograph the plate"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={confirmDelete}
                  disabled={deleting}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${log.name}`}
                  style={{
                    marginTop: 4,
                    paddingVertical: 15,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: `${c.state.danger}55`,
                    alignItems: 'center',
                    opacity: deleting ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: c.state.danger, fontSize: 15, fontWeight: '600' }}>
                    {deleting ? 'Deleting…' : 'Delete this meal'}
                  </Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        )}

        {scanningPlate && (
          <CameraSheet
            visible
            hint="Photograph the plate as it is now — whatever is left of the meal."
            onClose={() => setScanningPlate(false)}
            onCapture={(photo) => void applyLeftoverPhoto(photo.base64, photo.mediaType)}
          />
        )}

        {log && (
          <MealEditSheet
            log={log}
            visible={editing}
            onClose={() => setEditing(false)}
            onSave={saveEdits}
          />
        )}
      </SafeAreaView>
    </Screen>
  );
}

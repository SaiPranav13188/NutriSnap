import { useCallback, useState } from 'react';
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
import { formatNumber, type FoodLog, type LogSource } from '@nutrisnap/core';
import { api, ApiError } from '../../src/lib/api';
import { Card, ErrorNote, Metric, Screen } from '../../src/components/ui';
import { IngredientOverlay } from '../../src/components/IngredientOverlay';
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
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const { log: found } = await api.getLog(id);
      setLog(found);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load that meal.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Reload on focus so an edit made elsewhere is reflected on the way back.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

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
            style={{ color: c.text.secondary, fontSize: 13, letterSpacing: 1.2 }}
            accessibilityRole="header"
          >
            MEAL REPORT
          </Text>
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

                {log.photo_url ? (
                  <Animated.View entering={FadeInDown.duration(320)}>
                    {log.ingredients.length > 0 ? (
                      <IngredientOverlay
                        uri={log.photo_url}
                        ingredients={log.ingredients}
                        totalProteinG={log.protein_g}
                        size={photoSize}
                      />
                    ) : (
                      <Image
                        source={{ uri: log.photo_url }}
                        style={{ width: photoSize, height: photoSize, borderRadius: 24 }}
                        accessibilityLabel={`Photo of ${log.name}`}
                      />
                    )}
                  </Animated.View>
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
                      <DetailRow label="Fibre" value={`${Math.round(log.fiber_g)}g`} />
                    )}
                    {log.sodium_mg != null && (
                      <DetailRow label="Sodium" value={`${Math.round(log.sodium_mg)}mg`} />
                    )}
                  </Card>
                )}

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
      </SafeAreaView>
    </Screen>
  );
}

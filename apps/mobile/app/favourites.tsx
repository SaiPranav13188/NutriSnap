import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { formatNumber, type FoodLog } from '@nutrisnap/core';
import { api, ApiError } from '../src/lib/api';
import { Card, ErrorNote, Screen, ScreenHeader } from '../src/components/ui';
import { MealThumb } from '../src/components/MealThumb';
import { useColors } from '../src/lib/theme';

/**
 * The meals pinned to the home strip.
 *
 * Favouriting happens on a meal's own screen, which made unfavouriting a
 * matter of remembering which meal it was and finding it in the diary. A
 * list that can only be added to is a list that fills with the thing you ate
 * twice in March.
 */
export default function Favourites() {
  const c = useColors();

  const [favourites, setFavourites] = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .getFavorites(50)
      .then(({ logs }) => {
        setFavourites(logs);
        setError(null);
      })
      .catch((caught) =>
        setError(caught instanceof ApiError ? caught.message : 'Could not load your favourites.'),
      )
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  async function unfavourite(log: FoodLog) {
    setRemoving(log.id);
    setError(null);
    try {
      await api.updateLog(log.id, { is_favorite: false });
      void Haptics.selectionAsync();
      // Dropped locally rather than refetched: the row is still a perfectly
      // good meal in the diary, it has just stopped being pinned.
      setFavourites((current) => current.filter((entry) => entry.id !== log.id));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not remove that favourite.');
    } finally {
      setRemoving(null);
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

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScreenHeader title="Favourites" />

        <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }}>
          {error && <ErrorNote message={error} />}

          <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
            These show on the home screen as one-tap re-logs. Removing one here leaves the meal in
            your diary — it just stops being pinned.
          </Text>

          {favourites.length === 0 ? (
            <Card style={{ padding: 24, gap: 6, alignItems: 'center' }}>
              <Text style={{ fontSize: 30 }}>⭐</Text>
              <Text
                style={{
                  color: c.text.secondary,
                  fontSize: 14,
                  textAlign: 'center',
                  lineHeight: 20,
                }}
              >
                Nothing pinned yet. Open a meal you eat often and mark it a favourite to put it
                one tap from the home screen.
              </Text>
            </Card>
          ) : (
            favourites.map((log, i) => (
              <Animated.View key={log.id} entering={FadeInDown.delay(Math.min(i, 8) * 50)}>
                <Pressable
                  onPress={() => router.push({ pathname: '/log/[id]', params: { id: log.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${log.name}, ${Math.round(log.calories)} calories`}
                >
                  <Card
                    style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                  >
                    <MealThumb path={log.photo_url} name={log.name} />

                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ color: c.text.primary, fontSize: 15, fontWeight: '500' }}
                        numberOfLines={1}
                      >
                        {log.name}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                        <Text style={{ color: c.accent.lime, fontSize: 13, fontWeight: '700' }}>
                          {formatNumber(Math.round(log.calories))} kcal
                        </Text>
                        <Text style={{ color: c.text.tertiary, fontSize: 11 }}>
                          P {Math.round(log.protein_g)}g
                        </Text>
                        <Text style={{ color: c.text.tertiary, fontSize: 11 }}>
                          C {Math.round(log.carbs_g)}g
                        </Text>
                        <Text style={{ color: c.text.tertiary, fontSize: 11 }}>
                          F {Math.round(log.fat_g)}g
                        </Text>
                      </View>
                    </View>

                    <Pressable
                      onPress={() => void unfavourite(log)}
                      disabled={removing === log.id}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${log.name} from favourites`}
                      style={{ padding: 8, opacity: removing === log.id ? 0.4 : 1 }}
                    >
                      <Text style={{ fontSize: 19 }}>⭐</Text>
                    </Pressable>
                  </Card>
                </Pressable>
              </Animated.View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

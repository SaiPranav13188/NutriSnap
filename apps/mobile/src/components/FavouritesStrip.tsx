import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { FoodLog } from '@nutrisnap/core';
import { api, ApiError } from '../lib/api';
import { useColors } from '../lib/theme';

/**
 * Saved meals, re-logged in one tap.
 *
 * Most people eat the same handful of meals on rotation, so re-scanning a
 * regular breakfast every morning is the friction that makes people stop
 * tracking. A favourite carries its own macros, so re-logging it is a copy
 * rather than a fresh estimate — no photo, no model call, no waiting.
 */

interface FavouritesStripProps {
  favourites: FoodLog[];
  onLogged: () => void;
  onError: (message: string) => void;
}

export function FavouritesStrip({ favourites, onLogged, onError }: FavouritesStripProps) {
  const c = useColors();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (favourites.length === 0) return null;

  async function relog(log: FoodLog) {
    if (busyId) return;
    setBusyId(log.id);

    try {
      // Copied field by field rather than spread: the source row carries an
      // id, a user_id and timestamps that must not travel with it, and
      // logged_at has to default to now so it lands on today.
      await api.createLog({
        name: log.name,
        photo_url: log.photo_url,
        serving_multiplier: log.serving_multiplier,
        estimated_grams: log.estimated_grams,
        calories: Math.round(log.calories),
        protein_g: Math.round(log.protein_g),
        carbs_g: Math.round(log.carbs_g),
        fat_g: Math.round(log.fat_g),
        sugar_g: Math.round(log.sugar_g ?? 0),
        fiber_g: Math.round(log.fiber_g ?? 0),
        sodium_mg: Math.round(log.sodium_mg ?? 0),
        ingredients: log.ingredients,
        source: 'favorite',
        is_favorite: true,
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onLogged();
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'Could not log that again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          color: c.text.secondary,
          fontSize: 12,
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          paddingHorizontal: 20,
        }}
      >
        Log again
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
      >
        {favourites.map((log) => {
          const busy = busyId === log.id;
          return (
            <Pressable
              key={log.id}
              onPress={() => void relog(log)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Log ${log.name} again, ${Math.round(log.calories)} calories`}
              style={{
                width: 150,
                padding: 14,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: c.glass.border,
                backgroundColor: c.glass.DEFAULT,
                gap: 6,
                opacity: busy ? 0.55 : 1,
              }}
            >
              <Text
                numberOfLines={2}
                style={{ color: c.text.primary, fontSize: 14, fontWeight: '600', minHeight: 36 }}
              >
                {log.name}
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: c.accent.lime, fontSize: 14, fontWeight: '700' }}>
                  {Math.round(log.calories)} kcal
                </Text>
                {busy && <ActivityIndicator size="small" color={c.accent.lime} />}
              </View>

              <Text style={{ color: c.text.tertiary, fontSize: 11 }}>
                P {Math.round(log.protein_g)} · C {Math.round(log.carbs_g)} · F{' '}
                {Math.round(log.fat_g)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

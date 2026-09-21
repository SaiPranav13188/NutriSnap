import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GLASS_ML, formatWater, type Units } from '@nutrisnap/core';
import { api, ApiError } from '../lib/api';
import { Card } from './ui';
import { ProgressRing } from './ProgressRing';
import { useColors } from '../lib/theme';

/**
 * Water for the day: a ring, quick-add buttons and an undo.
 *
 * Quick-add rather than a keypad, because the interaction happens several
 * times a day and typing "250" each time is what stops people bothering. Undo
 * rather than a per-entry delete list, because the mistake this design creates
 * is a double tap, not a regret about the glass at eleven o'clock.
 */

const QUICK_ADDS = [GLASS_ML, 500, 750];

interface WaterCardProps {
  totalMl: number;
  targetMl: number;
  units: Units;
  onChange: () => void;
  onError: (message: string) => void;
}

export function WaterCard({ totalMl, targetMl, units, onChange, onError }: WaterCardProps) {
  const c = useColors();
  const [busy, setBusy] = useState(false);

  const ratio = targetMl > 0 ? Math.min(1, totalMl / targetMl) : 0;
  const glasses = Math.round(totalMl / GLASS_ML);
  const remaining = Math.max(0, targetMl - totalMl);

  async function add(amountMl: number) {
    if (busy) return;
    setBusy(true);
    try {
      await api.addWater(amountMl);
      void Haptics.selectionAsync();
      onChange();
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'Could not log that.');
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (busy || totalMl <= 0) return;
    setBusy(true);
    try {
      await api.undoWater();
      void Haptics.selectionAsync();
      onChange();
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'Nothing to undo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ padding: 20, gap: 18, alignItems: 'center' }}>
      <ProgressRing
        ratio={ratio}
        size={150}
        strokeWidth={12}
        from={c.macro.carbs}
        to={c.accent.cyan}
        gradientId="waterRing"
      >
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 22 }}>{'💧'}</Text>
          <Text style={{ color: c.text.primary, fontSize: 20, fontWeight: '700', marginTop: 2 }}>
            {formatWater(totalMl, units)}
          </Text>
          <Text style={{ color: c.text.tertiary, fontSize: 11, marginTop: 1 }}>
            of {formatWater(targetMl, units)}
          </Text>
        </View>
      </ProgressRing>

      <Text style={{ color: c.text.secondary, fontSize: 13, textAlign: 'center' }}>
        {remaining > 0
          ? `${glasses} ${glasses === 1 ? 'glass' : 'glasses'} in — ${formatWater(remaining, units)} to go.`
          : 'Goal reached for today.'}
      </Text>

      <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
        {QUICK_ADDS.map((amount) => (
          <Pressable
            key={amount}
            onPress={() => void add(amount)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Add ${amount} millilitres of water`}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 12,
              borderRadius: 16,
              backgroundColor: c.glass.DEFAULT,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Text style={{ color: c.text.primary, fontSize: 14, fontWeight: '700' }}>
              +{formatWater(amount, units)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => void undo()}
        disabled={busy || totalMl <= 0}
        accessibilityRole="button"
        accessibilityLabel="Undo the last water entry"
      >
        <Text
          style={{
            color: totalMl > 0 ? c.text.tertiary : 'transparent',
            fontSize: 13,
          }}
        >
          Undo last
        </Text>
      </Pressable>
    </Card>
  );
}

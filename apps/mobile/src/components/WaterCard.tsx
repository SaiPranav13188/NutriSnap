import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GLASS_ML, formatWater, type Units } from '@nutrisnap/core';
import { api, ApiError } from '../lib/api';
import { Card } from './ui';
import { ProgressRing } from './ProgressRing';
import { WaterVessel, type Vessel } from './WaterVessel';
import { useColors } from '../lib/theme';

/**
 * Water for the day: a ring, quick-add buttons and an undo.
 *
 * Quick-add rather than a keypad, because the interaction happens several
 * times a day and typing "250" each time is what stops people bothering. Undo
 * rather than a per-entry delete list, because the mistake this design creates
 * is a double tap, not a regret about the glass at eleven o'clock.
 */

/**
 * The quick adds, each with the thing you would actually have drunk.
 *
 * Paired here rather than looked up by amount so that changing a size is one
 * edit: the vessel travels with the number it stands for.
 */
const QUICK_ADDS: ReadonlyArray<{ ml: number; vessel: Vessel; label: string }> = [
  { ml: GLASS_ML, vessel: 'glass', label: 'Glass' },
  { ml: 500, vessel: 'smallBottle', label: 'Bottle' },
  { ml: 750, vessel: 'bottle', label: 'Large' },
];

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
    <View style={{ gap: 14 }}>
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

      {/* Laid out as the macro row on page one is: three cards of their own
          beside the big ring, not three tiles inside it. Nesting them in the
          water card stacked one translucent surface on another and lost the
          edges that make them read as separate things to tap. */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {QUICK_ADDS.map(({ ml, vessel, label }) => (
          <QuickAdd
            key={ml}
            ml={ml}
            vessel={vessel}
            label={label}
            units={units}
            targetMl={targetMl}
            disabled={busy}
            onPress={() => void add(ml)}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * One quick-add, built like a macro tile.
 *
 * The same four rows in the same order: the figure, the name, a ring with a
 * glyph inside it, and a line of context underneath. The ring here shows what
 * share of the day's goal this one drink covers, which is the question the
 * tile exists to answer — a ring drawn only for symmetry would be decoration
 * pretending to be a reading.
 */
function QuickAdd({
  ml,
  vessel,
  label,
  units,
  targetMl,
  disabled,
  onPress,
}: {
  ml: number;
  vessel: Vessel;
  label: string;
  units: Units;
  targetMl: number;
  disabled: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  const share = targetMl > 0 ? Math.min(1, ml / targetMl) : 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Add a ${label.toLowerCase()}, ${formatWater(ml, units)} of water`}
      style={{ flex: 1, opacity: disabled ? 0.5 : 1 }}
    >
      {({ pressed }) => (
        <Card
          style={{
            alignItems: 'center',
            gap: 3,
            paddingVertical: 14,
            paddingHorizontal: 6,
            // The only departure from the macro tile: these are buttons, and
            // a tap that takes a moment to come back needs to look pressed.
            borderColor: pressed ? c.accent.cyan : c.glass.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{ color: c.text.primary, fontSize: 15, fontWeight: '700' }}
            >
              +{formatWater(ml, units)}
            </Text>
          </View>

          <Text style={{ color: c.accent.cyan, fontSize: 10, fontWeight: '600' }}>{label}</Text>

          <ProgressRing
            ratio={share}
            size={54}
            strokeWidth={5}
            from={c.macro.carbs}
            to={c.accent.cyan}
            gradientId={`water-add-${ml}`}
          >
            <WaterVessel vessel={vessel} size={24} />
          </ProgressRing>

          <Text style={{ color: c.text.tertiary, fontSize: 10 }}>
            {Math.round(share * 100)}% of goal
          </Text>
        </Card>
      )}
    </Pressable>
  );
}

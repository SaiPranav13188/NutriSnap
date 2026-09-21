import { Image, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import type { Ingredient } from '@nutrisnap/core';
import { useColors } from '../lib/theme';

interface IngredientOverlayProps {
  uri: string;
  ingredients: Ingredient[];
  /** Protein grams for the whole dish, split across ingredients by weight. */
  totalProteinG: number;
  size: number;
}

/**
 * Leader-line callouts over the meal photo, labelled with protein.
 *
 * The vision model returns ingredient names, grams and calories, but no pixel
 * coordinates, so anchors sit on a ring around the centre of the plate —
 * deterministic per index, so the same dish always draws the same way instead
 * of jumping on every render.
 */
export function IngredientOverlay({
  uri,
  ingredients,
  totalProteinG,
  size,
}: IngredientOverlayProps) {
  const c = useColors();
  const shown = ingredients.slice(0, 4);

  // Protein is only reported for the dish as a whole. Splitting it by each
  // ingredient's share of total weight is an approximation, and a rough one
  // for a plate mixing meat and vegetables — but it is directionally right and
  // makes the relative contribution of each component visible, which is the
  // point of the labels.
  const totalGrams = ingredients.reduce((sum, i) => sum + (i.grams || 0), 0);
  const proteinFor = (ingredient: Ingredient): number =>
    totalGrams > 0 ? (ingredient.grams / totalGrams) * totalProteinG : 0;

  return (
    <View style={{ width: size, height: size }}>
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: 24 }}
        accessibilityLabel="The meal you photographed"
      />

      {/* Darken the edges so white callouts stay legible on a bright photo. */}
      <View
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 24,
          backgroundColor: 'rgba(7,9,12,0.22)',
        }}
        pointerEvents="none"
      />

      <Svg width={size} height={size} style={{ position: 'absolute' }} pointerEvents="none">
        {shown.map((ingredient, i) => {
          const { anchor, label } = layoutFor(i, shown.length, size);
          return (
            <Circle
              key={`${ingredient.name}-dot-${i}`}
              cx={anchor.x}
              cy={anchor.y}
              r={4}
              fill={c.accent.lime}
              stroke="rgba(7,9,12,0.55)"
              strokeWidth={1.5}
            />
          );
        })}
        {shown.map((ingredient, i) => {
          const { anchor, label } = layoutFor(i, shown.length, size);
          return (
            <Line
              key={`${ingredient.name}-line-${i}`}
              x1={anchor.x}
              y1={anchor.y}
              x2={label.x}
              y2={label.y}
              stroke="rgba(255,255,255,0.75)"
              strokeWidth={1.5}
            />
          );
        })}
      </Svg>

      {shown.map((ingredient, i) => {
        const { label } = layoutFor(i, shown.length, size);
        const onRight = label.x >= size / 2;

        return (
          <Animated.View
            key={`${ingredient.name}-label-${i}`}
            entering={ZoomIn.delay(350 + i * 130).springify()}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: onRight ? label.x : undefined,
              right: onRight ? undefined : size - label.x,
              top: label.y - 14,
              maxWidth: size * 0.42,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 9,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: 'rgba(7,9,12,0.82)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.20)',
            }}
          >
            <Text numberOfLines={1} style={{ color: '#F4F7FA', fontSize: 11, flexShrink: 1 }}>
              {ingredient.name}
            </Text>
            <Text style={{ color: c.macro.protein, fontSize: 11, fontWeight: '700' }}>
              {Math.round(proteinFor(ingredient))}g
            </Text>
          </Animated.View>
        );
      })}

      <Animated.View
        entering={FadeIn.delay(900)}
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 10,
          alignSelf: 'center',
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: 'rgba(7,9,12,0.7)',
        }}
      >
        <Text style={{ color: 'rgba(244,247,250,0.75)', fontSize: 10, letterSpacing: 0.6 }}>
          PROTEIN PER ITEM
        </Text>
      </Animated.View>
    </View>
  );
}

/** Anchors evenly around a circle inside the dish; labels pushed to the nearer edge. */
function layoutFor(index: number, total: number, size: number) {
  const angle = (-55 + (index * 290) / Math.max(total, 1)) * (Math.PI / 180);
  const radius = size * 0.22;

  const anchor = {
    x: size / 2 + Math.cos(angle) * radius,
    y: size / 2 + Math.sin(angle) * radius,
  };

  const onRight = anchor.x >= size / 2;
  const label = {
    x: onRight ? size * 0.72 : size * 0.28,
    y: Math.min(size - 34, Math.max(28, size / 2 + Math.sin(angle) * (size * 0.36))),
  };

  return { anchor, label };
}

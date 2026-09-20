'use client';

import { motion } from 'framer-motion';
import type { Ingredient } from '@nutrisnap/core';

interface IngredientOverlayProps {
  imageSrc: string;
  ingredients: Ingredient[];
}

/**
 * The leader-line callouts from plan section 3.1 / Image 2: labels sit around
 * the photo, each connected to a point on the dish by a line that draws itself
 * in, then the label pops.
 *
 * The vision model returns ingredient names and weights, not pixel
 * coordinates, so anchor points are laid out on a ring around the centre —
 * deterministic per index, so the same dish always draws the same way rather
 * than jumping on every re-render.
 */
export function IngredientOverlay({ imageSrc, ingredients }: IngredientOverlayProps) {
  const shown = ingredients.slice(0, 5);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl">
      <motion.img
        src={imageSrc}
        alt="The meal you photographed"
        className="h-full w-full object-cover"
        initial={{ scale: 1.06, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* Darken the edges so white callouts stay legible on a bright photo. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-base-900/75 via-transparent to-base-900/35" />

      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {shown.map((ingredient, i) => {
          const { anchor, label } = layoutFor(i, shown.length);

          return (
            <g key={`${ingredient.name}-${i}`}>
              <motion.line
                x1={anchor.x}
                y1={anchor.y}
                x2={label.x}
                y2={label.y}
                stroke="rgba(255,255,255,0.75)"
                strokeWidth={0.35}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ delay: 0.45 + i * 0.16, duration: 0.42, ease: 'easeOut' }}
              />
              <motion.circle
                cx={anchor.x}
                cy={anchor.y}
                r={1.1}
                fill="#C6FF3D"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.45 + i * 0.16, type: 'spring', stiffness: 420, damping: 16 }}
              />
            </g>
          );
        })}
      </svg>

      {shown.map((ingredient, i) => {
        const { label } = layoutFor(i, shown.length);

        return (
          <motion.div
            key={`${ingredient.name}-label-${i}`}
            className="pointer-events-none absolute -translate-y-1/2 whitespace-nowrap rounded-full border border-white/20 bg-base-900/80 px-2.5 py-1 text-[11px] font-medium backdrop-blur-md"
            style={{
              left: `${label.x}%`,
              top: `${label.y}%`,
              transform: `translate(${label.x > 50 ? '0' : '-100%'}, -50%)`,
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8 + i * 0.16, type: 'spring', stiffness: 380, damping: 20 }}
          >
            {ingredient.name}
            <span className="ml-1.5 text-accent-lime">{Math.round(ingredient.calories)}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * Spread anchors evenly around a circle inside the dish, with each label
 * pushed out to the nearer edge of the frame.
 */
function layoutFor(index: number, total: number) {
  // Start at the top-right and walk around, skipping straight up and down
  // where a label would collide with the dish name overlay.
  const angle = (-60 + (index * 300) / Math.max(total, 1)) * (Math.PI / 180);

  const anchor = {
    x: 50 + Math.cos(angle) * 22,
    y: 50 + Math.sin(angle) * 22,
  };

  const onRight = anchor.x >= 50;
  const label = {
    x: onRight ? 88 : 12,
    y: Math.min(92, Math.max(8, 50 + Math.sin(angle) * 40)),
  };

  return { anchor, label };
}

'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Star, Trash2, UtensilsCrossed } from 'lucide-react';
import type { FoodLog } from '@nutrisnap/core';
import { colors } from '@nutrisnap/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

interface MealCardProps {
  log: FoodLog;
  index: number;
  onDelete: (id: string) => void;
  onToggleFavorite: (log: FoodLog) => void;
}

/** A row in the "Recently uploaded" feed — thumbnail, macros, time. */
export function MealCard({ log, index, onDelete, onToggleFavorite }: MealCardProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Meal photos live in a private bucket, so they need a signed URL.
  useEffect(() => {
    if (!log.photo_url) return;
    let cancelled = false;

    api
      .getPhotoUrl(log.photo_url)
      .then(({ url }) => {
        if (!cancelled) setPhotoUrl(url);
      })
      .catch(() => {
        // A missing thumbnail is not worth surfacing to the user.
      });

    return () => {
      cancelled = true;
    };
  }, [log.photo_url]);

  const chips = [
    { label: 'P', value: log.protein_g, color: colors.macro.protein },
    { label: 'C', value: log.carbs_g, color: colors.macro.carbs },
    { label: 'F', value: log.fat_g, color: colors.macro.fat },
  ];

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.3), duration: 0.35 }}
      className="glass group flex items-center gap-3.5 rounded-2xl p-3"
    >
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/[0.05]">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL with a short TTL; next/image would cache a URL that expires
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <UtensilsCrossed className="h-5 w-5 text-ink-tertiary" aria-hidden />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium leading-snug">{log.name}</h3>

        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="tnum text-sm font-semibold text-accent-lime">
            {Math.round(log.calories)} kcal
          </span>
          {chips.map((chip) => (
            <span key={chip.label} className="tnum text-[11px] text-ink-tertiary">
              <span style={{ color: chip.color }}>{chip.label}</span> {Math.round(chip.value)}g
            </span>
          ))}
        </div>

        <p className="mt-0.5 text-[11px] text-ink-tertiary">
          {new Date(log.logged_at).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}
          {log.ai_confidence !== null && ` · ${Math.round(log.ai_confidence * 100)}% confident`}
        </p>
      </div>

      <div className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button suppressHydrationWarning
          type="button"
          onClick={() => onToggleFavorite(log)}
          aria-label={log.is_favorite ? 'Remove from favourites' : 'Save to favourites'}
          className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-white/[0.08]"
        >
          <Star
            className={cn('h-4 w-4', log.is_favorite ? 'fill-accent-lime text-accent-lime' : 'text-ink-tertiary')}
            aria-hidden
          />
        </button>
        <button suppressHydrationWarning
          type="button"
          onClick={() => onDelete(log.id)}
          aria-label={`Delete ${log.name}`}
          className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-state-danger/15"
        >
          <Trash2 className="h-4 w-4 text-ink-tertiary" aria-hidden />
        </button>
      </div>
    </motion.article>
  );
}

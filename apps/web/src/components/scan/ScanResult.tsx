'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Minus, Plus, Sparkles, Trash2, X } from 'lucide-react';
import {
  scaleIngredients,
  scaleTotals,
  totalsFromIngredients,
  type FoodAnalysis,
  type Ingredient,
  type MealType,
} from '@nutrisnap/core';
import { colors } from '@nutrisnap/ui';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { IngredientOverlay } from './IngredientOverlay';

interface ScanResultProps {
  analysis: FoodAnalysis;
  photoUrl: string | null;
  /** Local object URL of the captured image, for the overlay. */
  previewSrc: string | null;
  saving: boolean;
  fixing: boolean;
  onFix: (correction: string) => void;
  onSave: (payload: Record<string, unknown>) => void;
  onDiscard: () => void;
}

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * The results screen from plan section 3.1 / Image 3: editable serving
 * stepper, editable ingredient list, a "Fix Results" correction loop back to
 * the model, and Done.
 */
export function ScanResult({
  analysis,
  photoUrl,
  previewSrc,
  saving,
  fixing,
  onFix,
  onSave,
  onDiscard,
}: ScanResultProps) {
  const [multiplier, setMultiplier] = useState(1);
  const [ingredients, setIngredients] = useState<Ingredient[]>(analysis.ingredients);
  const [mealType, setMealType] = useState<MealType | null>(null);
  const [showFix, setShowFix] = useState(false);
  const [correction, setCorrection] = useState('');

  /**
   * Totals follow two edits: removing ingredients rebalances the base, then
   * the serving stepper scales whatever is left.
   */
  const totals = useMemo(() => {
    const afterEdits = totalsFromIngredients(ingredients, analysis.totals, analysis.ingredients);
    return scaleTotals(afterEdits, multiplier);
  }, [ingredients, multiplier, analysis]);

  const scaledIngredients = useMemo(
    () => scaleIngredients(ingredients, multiplier),
    [ingredients, multiplier],
  );

  const confidencePercent = Math.round(analysis.confidence * 100);
  const lowConfidence = confidencePercent < 60;

  function handleSave() {
    onSave({
      name: analysis.name,
      photo_url: photoUrl,
      serving_multiplier: multiplier,
      estimated_grams: analysis.estimated_grams * multiplier,
      calories: Math.round(totals.calories),
      protein_g: Math.round(totals.protein_g),
      carbs_g: Math.round(totals.carbs_g),
      fat_g: Math.round(totals.fat_g),
      sugar_g: Math.round(totals.sugar_g),
      fiber_g: Math.round(totals.fiber_g),
      sodium_mg: Math.round(totals.sodium_mg),
      ai_confidence: analysis.confidence,
      source: photoUrl ? 'photo' : 'text',
      ingredients: scaledIngredients,
      ...(mealType ? { meal_type: mealType } : {}),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {previewSrc && <IngredientOverlay imageSrc={previewSrc} ingredients={ingredients} />}

      <GlassCard className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-balance text-xl font-semibold leading-snug">{analysis.name}</h1>
            <p className="mt-1 text-sm text-ink-tertiary">
              About {Math.round(analysis.estimated_grams * multiplier)} g
            </p>
          </div>

          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{
              color: lowConfidence ? colors.state.warning : colors.state.success,
              background: `${lowConfidence ? colors.state.warning : colors.state.success}1A`,
            }}
          >
            {confidencePercent}% sure
          </span>
        </div>

        {analysis.notes && (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-secondary">{analysis.notes}</p>
        )}

        {lowConfidence && (
          <p className="mt-3 rounded-xl bg-state-warning/10 px-3 py-2.5 text-[13px] leading-relaxed text-state-warning">
            This one was hard to read. Check the portion below, or use Fix results to tell us
            what it actually is.
          </p>
        )}

        <div className="mt-5 grid grid-cols-4 gap-2 text-center">
          <Metric label="Calories" value={totals.calories} accent />
          <Metric label="Protein" value={totals.protein_g} suffix="g" color={colors.macro.protein} />
          <Metric label="Carbs" value={totals.carbs_g} suffix="g" color={colors.macro.carbs} />
          <Metric label="Fat" value={totals.fat_g} suffix="g" color={colors.macro.fat} />
        </div>

        <div className="mt-3 flex justify-center gap-5 text-[11px] text-ink-tertiary">
          <span>Sugar {Math.round(totals.sugar_g)}g</span>
          <span>Fibre {Math.round(totals.fiber_g)}g</span>
          <span>Sodium {Math.round(totals.sodium_mg)}mg</span>
        </div>
      </GlassCard>

      <GlassCard index={1} className="flex items-center justify-between p-5">
        <div>
          <p className="font-medium">Servings</p>
          <p className="mt-0.5 text-[13px] text-ink-secondary">How much of this did you eat?</p>
        </div>

        <div className="flex items-center gap-3">
          <StepperButton
            onClick={() => setMultiplier((m) => Math.max(0.25, Math.round((m - 0.25) * 100) / 100))}
            disabled={multiplier <= 0.25}
            label="Decrease servings"
          >
            <Minus className="h-4 w-4" aria-hidden />
          </StepperButton>

          <span className="tnum w-14 text-center text-xl font-semibold">{multiplier}×</span>

          <StepperButton
            onClick={() => setMultiplier((m) => Math.min(10, Math.round((m + 0.25) * 100) / 100))}
            disabled={multiplier >= 10}
            label="Increase servings"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </StepperButton>
        </div>
      </GlassCard>

      {scaledIngredients.length > 0 && (
        <GlassCard index={2} className="p-5">
          <h2 className="text-sm font-medium uppercase tracking-wider text-ink-secondary">
            Ingredients
          </h2>

          <ul className="mt-3 flex flex-col divide-y divide-white/[0.06]">
            <AnimatePresence initial={false}>
              {scaledIngredients.map((ingredient, i) => (
                <motion.li
                  key={`${ingredient.name}-${i}`}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="group flex items-center gap-3 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{ingredient.name}</span>
                    <span className="text-[12px] text-ink-tertiary">
                      {Math.round(ingredient.grams)} g
                    </span>
                  </span>

                  <span className="tnum shrink-0 text-sm text-ink-secondary">
                    {Math.round(ingredient.calories)} kcal
                  </span>

                  <button
                    type="button"
                    onClick={() => setIngredients((list) => list.filter((_, index) => index !== i))}
                    aria-label={`Remove ${ingredient.name}`}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg opacity-0 transition-all hover:bg-state-danger/15 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-ink-tertiary" aria-hidden />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </GlassCard>
      )}

      <GlassCard index={3} className="p-5">
        <h2 className="text-sm font-medium uppercase tracking-wider text-ink-secondary">Meal</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {MEAL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setMealType(mealType === type ? null : type)}
              aria-pressed={mealType === type}
              className={`rounded-full border px-4 py-2 text-sm capitalize transition-colors ${
                mealType === type
                  ? 'border-accent-lime/60 bg-accent-lime/10'
                  : 'border-glass-border text-ink-secondary hover:bg-white/[0.06]'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[12px] text-ink-tertiary">
          Leave it unset and we&apos;ll guess from the time of day.
        </p>
      </GlassCard>

      <AnimatePresence>
        {showFix && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <GlassCard strong className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">What did we get wrong?</h2>
                <button
                  type="button"
                  onClick={() => setShowFix(false)}
                  aria-label="Close correction box"
                  className="grid h-7 w-7 place-items-center rounded-lg hover:bg-white/[0.08]"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <textarea
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="e.g. That's two servings, not one — and it's tofu, not chicken."
                className="mt-3 w-full resize-none rounded-xl border border-glass-border bg-white/[0.04] p-3 text-[15px] outline-none transition-colors focus:border-accent-lime/50"
              />

              <Button
                className="mt-3"
                fullWidth
                loading={fixing}
                disabled={correction.trim().length < 3}
                onClick={() => onFix(correction.trim())}
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                Re-analyse with my note
              </Button>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-2.5 pt-1">
        <Button size="lg" fullWidth loading={saving} onClick={handleSave}>
          <Check className="h-4 w-4" aria-hidden />
          Add to my day
        </Button>

        <div className="grid grid-cols-2 gap-2.5">
          {!showFix && (
            <Button variant="glass" onClick={() => setShowFix(true)}>
              <Sparkles className="h-4 w-4" aria-hidden />
              Fix results
            </Button>
          )}
          <Button variant="ghost" onClick={onDiscard} className={showFix ? 'col-span-2' : ''}>
            Discard
          </Button>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  suffix = '',
  color,
  accent = false,
}: {
  label: string;
  value: number;
  suffix?: string;
  color?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p
        className={`text-xl font-semibold ${accent ? 'text-accent-lime' : ''}`}
        style={color ? { color } : undefined}
      >
        <AnimatedNumber value={Math.round(value)} suffix={suffix} duration={0.6} />
      </p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wider text-ink-tertiary">{label}</p>
    </div>
  );
}

function StepperButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      className="grid h-10 w-10 place-items-center rounded-full border border-glass-border transition-colors hover:bg-white/[0.08] disabled:opacity-35"
    >
      {children}
    </motion.button>
  );
}

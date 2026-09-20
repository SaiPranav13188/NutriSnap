'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Camera, LineChart, Sparkles } from 'lucide-react';
import {
  COMMON_ALLERGENS,
  GAIN_RATES_KG_PER_WEEK,
  LOSS_RATES_KG_PER_WEEK,
  MAINTAIN_FOCUS_AREAS,
  REFERRAL_SOURCES,
  calculateTargets,
  projectGoalDate,
  stepsFor,
  validateStep,
  type OnboardingAnswers,
  type StepId,
} from '@nutrisnap/core';
import { Button } from '@/components/ui/Button';
import { OptionGrid } from '@/components/onboarding/OptionGrid';
import { MeasurePicker } from '@/components/onboarding/MeasurePicker';
import { CraftingLoader } from '@/components/onboarding/CraftingLoader';
import { PlanReveal } from '@/components/onboarding/PlanReveal';
import { readStoredAnswers, storeAnswers } from '@/lib/onboardingStorage';
import { cn } from '@/lib/cn';

const DEFAULTS: OnboardingAnswers = {
  height_cm: 170,
  current_weight_kg: 70,
  units: 'metric',
  allergies: [],
  rate_kg_per_week: 0.5,
};

export default function OnboardingPage() {
  const router = useRouter();
  const [answers, setAnswers] = useState<OnboardingAnswers>(DEFAULTS);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [showError, setShowError] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Resume a quiz the user abandoned on a previous visit.
  useEffect(() => {
    const stored = readStoredAnswers();
    if (stored) setAnswers({ ...DEFAULTS, ...stored });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) storeAnswers(answers);
  }, [answers, hydrated]);

  const steps = useMemo(() => stepsFor(answers), [answers]);
  const step = steps[Math.min(index, steps.length - 1)];
  const error = step ? validateStep(step.id, answers) : null;

  const set = <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setShowError(false);
  };

  const goNext = () => {
    if (!step) return;
    if (validateStep(step.id, answers) !== null) {
      setShowError(true);
      return;
    }
    setDirection(1);
    setShowError(false);
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const goBack = () => {
    setDirection(-1);
    setShowError(false);
    if (index === 0) router.push('/');
    else setIndex((i) => i - 1);
  };

  /**
   * The reveal shows the real computed plan, not a placeholder — the same
   * function the API will run when the account is created.
   */
  const previewTargets = useMemo(() => {
    const { gender, height_cm, current_weight_kg, date_of_birth, activity_level, goal } = answers;
    if (!gender || !height_cm || !current_weight_kg || !date_of_birth || !activity_level || !goal) {
      return null;
    }
    try {
      return calculateTargets({
        gender,
        heightCm: height_cm,
        weightKg: current_weight_kg,
        dateOfBirth: date_of_birth,
        activityLevel: activity_level,
        goal,
        rateKgPerWeek: answers.rate_kg_per_week,
        trainingFocus: answers.training_focus,
      });
    } catch {
      return null;
    }
  }, [answers]);

  if (!hydrated || !step) {
    return <main className="grid min-h-screen place-items-center" />;
  }

  const progress = (index / (steps.length - 1)) * 100;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-6 pb-10 pt-6">
      <header className="flex items-center gap-4">
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-glass-border transition-colors hover:bg-white/[0.06]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </button>

        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
          <motion.div
            className="h-full rounded-full bg-accent"
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 160, damping: 22 }}
          />
        </div>

        <span className="tnum w-12 shrink-0 text-right text-xs text-ink-tertiary">
          {index + 1}/{steps.length}
        </span>
      </header>

      <div className="flex flex-1 flex-col justify-center py-10">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step.id}
            custom={direction}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -40 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {step.id !== 'crafting' && (
              <div className="mb-8">
                <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight">
                  {step.title}
                </h1>
                {step.subtitle && (
                  <p className="mt-2.5 text-pretty leading-relaxed text-ink-secondary">
                    {step.subtitle}
                  </p>
                )}
              </div>
            )}

            <StepBody
              id={step.id}
              answers={answers}
              set={set}
              previewTargets={previewTargets}
              onCraftingDone={goNext}
              onFinish={() => router.push('/signin?mode=signup')}
            />

            {showError && error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 text-sm text-state-danger"
                role="alert"
              >
                {error}
              </motion.p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {step.id !== 'crafting' && (
        <footer className="flex flex-col gap-3">
          {step.id === 'reveal' ? (
            <Button size="lg" fullWidth onClick={() => router.push('/signin?mode=signup')}>
              Save my plan
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button size="lg" fullWidth onClick={goNext}>
              {step.optional ? 'Continue' : 'Next'}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          )}

          {step.optional && (
            <button
              type="button"
              onClick={goNext}
              className="text-sm text-ink-tertiary transition-colors hover:text-ink-secondary"
            >
              Skip this
            </button>
          )}
        </footer>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------

interface StepBodyProps {
  id: StepId;
  answers: OnboardingAnswers;
  set: <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) => void;
  previewTargets: ReturnType<typeof calculateTargets> | null;
  onCraftingDone: () => void;
  onFinish: () => void;
}

function StepBody({ id, answers, set, previewTargets, onCraftingDone }: StepBodyProps) {
  switch (id) {
    case 'gender':
      return (
        <OptionGrid
          value={answers.gender}
          onChange={(v) => set('gender', v)}
          options={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
            { value: 'other', label: 'Other', hint: 'We use a neutral metabolic estimate' },
          ]}
        />
      );

    case 'goal':
      return (
        <OptionGrid
          value={answers.goal}
          onChange={(v) => {
            set('goal', v);
            // Maintaining means the goal weight is simply the current weight.
            if (v === 'maintain') set('goal_weight_kg', answers.current_weight_kg);
          }}
          options={[
            { value: 'lose', label: 'Lose weight', emoji: '📉', hint: 'Run a calorie deficit' },
            { value: 'maintain', label: 'Maintain weight', emoji: '⚖️', hint: 'Hold steady, eat better' },
            { value: 'gain', label: 'Gain weight', emoji: '📈', hint: 'Build size and strength' },
          ]}
        />
      );

    case 'date_of_birth':
      return (
        <input
          type="date"
          value={answers.date_of_birth ?? ''}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => set('date_of_birth', e.target.value)}
          className="h-16 w-full rounded-2xl border border-glass-border bg-white/[0.04] px-5 text-center text-2xl outline-none transition-colors focus:border-accent-lime/50"
        />
      );

    case 'height':
      return (
        <MeasurePicker
          kind="height"
          value={answers.height_cm ?? 170}
          onChange={(v) => set('height_cm', v)}
          units={answers.units ?? 'metric'}
          onUnitsChange={(u) => set('units', u)}
        />
      );

    case 'weight':
      return (
        <MeasurePicker
          kind="weight"
          value={answers.current_weight_kg ?? 70}
          onChange={(v) => set('current_weight_kg', v)}
          units={answers.units ?? 'metric'}
          onUnitsChange={(u) => set('units', u)}
        />
      );

    case 'activity_level':
      return (
        <OptionGrid
          value={answers.activity_level}
          onChange={(v) => set('activity_level', v)}
          options={[
            { value: 'sedentary', label: 'Sedentary', hint: 'Little or no exercise, desk job' },
            { value: 'light', label: 'Lightly active', hint: '1–3 workouts per week' },
            { value: 'moderate', label: 'Moderately active', hint: '3–5 workouts per week' },
            { value: 'very_active', label: 'Very active', hint: '6–7 workouts per week' },
            { value: 'extreme', label: 'Extremely active', hint: 'Physical job or twice-daily training' },
          ]}
        />
      );

    case 'workouts_per_week':
      return (
        <OptionGrid
          columns={2}
          value={answers.workouts_per_week}
          onChange={(v) => set('workouts_per_week', v)}
          options={[
            { value: '0', label: '0' },
            { value: '1-3', label: '1–3' },
            { value: '4-6', label: '4–6' },
            { value: '7+', label: '7+' },
          ]}
        />
      );

    case 'goal_weight':
      return (
        <MeasurePicker
          kind="weight"
          value={answers.goal_weight_kg ?? answers.current_weight_kg ?? 70}
          onChange={(v) => set('goal_weight_kg', v)}
          units={answers.units ?? 'metric'}
          onUnitsChange={(u) => set('units', u)}
        />
      );

    case 'rate': {
      const losing = answers.goal === 'lose';
      const rates = losing ? LOSS_RATES_KG_PER_WEEK : GAIN_RATES_KG_PER_WEEK;
      const verb = losing ? 'loss' : 'gain';

      return (
        <OptionGrid
          value={answers.rate_kg_per_week ? String(answers.rate_kg_per_week) : undefined}
          onChange={(v) => set('rate_kg_per_week', Number(v))}
          options={rates.map((rate) => ({
            value: String(rate),
            label: `${rate} kg per week`,
            hint:
              rate <= 0.25
                ? `Gentle — easiest to sustain`
                : rate <= 0.5
                  ? `Steady — the usual recommendation`
                  : rate <= 0.75
                    ? `Brisk — needs consistency`
                    : `Aggressive ${verb} — hard to hold`,
          }))}
        />
      );
    }

    case 'target_date':
      return (
        <input
          type="date"
          value={answers.target_date ?? ''}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) => set('target_date', e.target.value || null)}
          className="h-16 w-full rounded-2xl border border-glass-border bg-white/[0.04] px-5 text-center text-2xl outline-none transition-colors focus:border-accent-lime/50"
        />
      );

    case 'focus_area':
      return (
        <OptionGrid
          value={answers.focus_area}
          onChange={(v) => set('focus_area', v)}
          options={MAINTAIN_FOCUS_AREAS.map((area) => ({ value: area, label: area }))}
        />
      );

    case 'training_focus':
      return (
        <OptionGrid
          value={answers.training_focus}
          onChange={(v) => set('training_focus', v)}
          options={[
            { value: 'strength', label: 'Strength training', hint: 'Lifting weights regularly' },
            { value: 'athlete', label: 'Athlete', hint: 'Sport-specific training' },
            { value: 'general_fitness', label: 'General fitness', hint: 'Staying active' },
            { value: 'none', label: 'Not training right now' },
          ]}
        />
      );

    case 'dietary_preference':
      return (
        <OptionGrid
          value={answers.dietary_preference}
          onChange={(v) => set('dietary_preference', v)}
          options={[
            { value: 'classic', label: 'Classic', emoji: '🍽️', hint: 'No restrictions' },
            { value: 'vegetarian', label: 'Vegetarian', emoji: '🥬' },
            { value: 'vegan', label: 'Vegan', emoji: '🌱' },
            { value: 'pescatarian', label: 'Pescatarian', emoji: '🐟' },
          ]}
        />
      );

    case 'allergies': {
      const selected = answers.allergies ?? [];
      const toggle = (item: string) =>
        set(
          'allergies',
          selected.includes(item) ? selected.filter((a) => a !== item) : [...selected, item],
        );

      return (
        <div className="flex flex-wrap gap-2">
          {COMMON_ALLERGENS.map((allergen) => {
            const active = selected.includes(allergen);
            return (
              <button
                key={allergen}
                type="button"
                onClick={() => toggle(allergen)}
                aria-pressed={active}
                className={cn(
                  'rounded-full border px-4 py-2.5 text-sm transition-colors',
                  active
                    ? 'border-accent-lime/60 bg-accent-lime/10 text-ink-primary'
                    : 'border-glass-border text-ink-secondary hover:bg-white/[0.06]',
                )}
              >
                {allergen}
              </button>
            );
          })}
        </div>
      );
    }

    case 'tried_other_apps':
      return (
        <OptionGrid
          columns={2}
          value={
            answers.tried_other_apps === undefined ? undefined : answers.tried_other_apps ? 'yes' : 'no'
          }
          onChange={(v) => set('tried_other_apps', v === 'yes')}
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No, this is my first' },
          ]}
        />
      );

    case 'referral_source':
      return (
        <OptionGrid
          columns={2}
          value={answers.referral_source}
          onChange={(v) => set('referral_source', v)}
          options={REFERRAL_SOURCES.map((source) => ({ value: source, label: source }))}
        />
      );

    case 'how_it_works':
      return (
        <div className="flex flex-col gap-3">
          {[
            { icon: Camera, title: 'Snap your meal', body: 'One photo, from any angle.' },
            {
              icon: Sparkles,
              title: 'We read the plate',
              body: 'Every ingredient, with calories and macros — and a confidence score.',
            },
            {
              icon: LineChart,
              title: 'Your rings fill up',
              body: 'Watch the day close out, and the weeks add up on your trend chart.',
            },
          ].map(({ icon: Icon, title, body }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12 }}
              className="glass flex items-start gap-4 rounded-2xl p-4"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft">
                <Icon className="h-5 w-5 text-accent-lime" aria-hidden />
              </span>
              <span>
                <span className="block font-medium">{title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-ink-secondary">{body}</span>
              </span>
            </motion.div>
          ))}
        </div>
      );

    case 'crafting':
      return <CraftingLoader onDone={onCraftingDone} />;

    case 'reveal':
      return previewTargets ? (
        <PlanReveal
          targets={previewTargets}
          goalWeightKg={answers.goal_weight_kg}
          projectedDate={
            answers.goal_weight_kg && answers.current_weight_kg && answers.rate_kg_per_week
              ? projectGoalDate({
                  currentWeightKg: answers.current_weight_kg,
                  goalWeightKg: answers.goal_weight_kg,
                  rateKgPerWeek: answers.rate_kg_per_week,
                })
              : null
          }
        />
      ) : (
        <p className="text-center text-ink-secondary">
          Something is missing from your answers — step back and fill in the gaps.
        </p>
      );

    default:
      return null;
  }
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, Scale, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { PROGRESS_RANGES, type ProgressRange } from '@nutrisnap/core';
import { api, ApiError, type ProgressResponse } from '@/lib/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { WeightChart } from '@/components/progress/WeightChart';
import { MacroChart } from '@/components/progress/MacroChart';
import { cn } from '@/lib/cn';

export default function ProgressPage() {
  const [range, setRange] = useState<ProgressRange>('90d');
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [logging, setLogging] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [showWeightForm, setShowWeightForm] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.getProgress(range));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load your progress.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleLogWeight(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(weightInput);
    if (!Number.isFinite(value) || value < 25 || value > 400) {
      setError('Enter a weight between 25 and 400 kg.');
      return;
    }

    setLogging(true);
    try {
      await api.logWeight(value);
      setWeightInput('');
      setShowWeightForm(false);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that weigh-in.');
    } finally {
      setLogging(false);
    }
  }

  if (loading) return <ProgressSkeleton />;

  const weight = data?.weight;
  const calories = data?.calories;
  const wow = calories?.week_over_week;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        <p className="mt-1 text-ink-secondary">The long view on where you&apos;re heading.</p>
      </header>

      {error && (
        <p className="rounded-2xl bg-state-danger/10 px-4 py-3 text-sm text-state-danger" role="alert">
          {error}
        </p>
      )}

      {/* Weight + streak cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 text-ink-secondary">
            <Scale className="h-4 w-4" aria-hidden />
            <span className="text-sm font-medium">Current weight</span>
          </div>

          <p className="mt-3 text-4xl font-semibold tracking-tight">
            {weight?.current_kg !== null && weight?.current_kg !== undefined ? (
              <>
                <AnimatedNumber value={weight.current_kg} decimals={1} />
                <span className="ml-1.5 text-lg text-ink-secondary">kg</span>
              </>
            ) : (
              <span className="text-lg text-ink-tertiary">Not logged yet</span>
            )}
          </p>

          {weight?.goal_kg !== null && weight?.goal_progress !== null && weight?.goal_progress !== undefined && (
            <div className="mt-4">
              <div className="flex justify-between text-[12px] text-ink-tertiary">
                <span>Goal {weight.goal_kg} kg</span>
                <span className="tnum">{Math.round(weight.goal_progress * 100)}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                <motion.div
                  className="h-full rounded-full bg-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${weight.goal_progress * 100}%` }}
                  transition={{ type: 'spring', stiffness: 60, damping: 16, delay: 0.2 }}
                />
              </div>
            </div>
          )}

          {showWeightForm ? (
            <form onSubmit={handleLogWeight} className="mt-4 flex gap-2">
              <input suppressHydrationWarning
                type="number"
                step="0.1"
                min={25}
                max={400}
                autoFocus
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder="kg"
                className="tnum h-11 min-w-0 flex-1 rounded-xl border border-glass-border bg-white/[0.04] px-3 text-center outline-none focus:border-accent-lime/50"
              />
              <Button type="submit" size="sm" loading={logging} className="h-11 shrink-0">
                Save
              </Button>
            </form>
          ) : (
            <Button variant="glass" size="sm" className="mt-4" onClick={() => setShowWeightForm(true)}>
              Log weight
            </Button>
          )}
        </GlassCard>

        <GlassCard index={1} className="p-5">
          <div className="flex items-center gap-2 text-ink-secondary">
            <Flame className="h-4 w-4" aria-hidden />
            <span className="text-sm font-medium">Logging streak</span>
          </div>

          <p className="mt-3 text-4xl font-semibold tracking-tight">
            <AnimatedNumber value={data?.streak.current_streak ?? 0} />
            <span className="ml-1.5 text-lg text-ink-secondary">
              {data?.streak.current_streak === 1 ? 'day' : 'days'}
            </span>
          </p>

          <p className="mt-2 text-[13px] text-ink-secondary">
            Longest run: {data?.streak.longest_streak ?? 0} days
          </p>

          <div className="mt-4 flex gap-1.5">
            {Array.from({ length: 7 }, (_, i) => {
              const filled = i < Math.min(data?.streak.current_streak ?? 0, 7);
              return (
                <motion.span
                  key={i}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1 + i * 0.05, type: 'spring', stiffness: 400, damping: 20 }}
                  className={cn(
                    'h-2 flex-1 rounded-full',
                    filled ? 'bg-accent' : 'bg-white/[0.08]',
                  )}
                />
              );
            })}
          </div>
        </GlassCard>
      </div>

      {/* Weight chart with the range filter */}
      <GlassCard index={2} className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Weight progress</h2>

          <div
            className="inline-flex rounded-full border border-glass-border p-0.5"
            role="group"
            aria-label="Chart range"
          >
            {PROGRESS_RANGES.map((option) => (
              <button suppressHydrationWarning
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                aria-pressed={range === option.value}
                className={cn(
                  'relative rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors',
                  range === option.value ? 'text-base-900' : 'text-ink-secondary hover:text-ink-primary',
                )}
              >
                {range === option.value && (
                  <motion.span
                    layoutId="range-pill"
                    className="absolute inset-0 rounded-full bg-accent"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <WeightChart
            series={weight?.series ?? []}
            trendLine={weight?.trend_line ?? []}
            goalKg={weight?.goal_kg ?? null}
          />
        </div>

        {weight?.message && (
          <p className="mt-4 rounded-xl bg-white/[0.04] px-4 py-3 text-[13px] leading-relaxed text-ink-secondary">
            {weight.message}
          </p>
        )}

        {weight?.plateau.plateaued && weight.plateau.message && (
          <p className="mt-2 rounded-xl bg-state-warning/10 px-4 py-3 text-[13px] leading-relaxed text-state-warning">
            {weight.plateau.message}
          </p>
        )}

        {weight?.projected_goal_date && (
          <p className="mt-2 text-center text-[12px] text-ink-tertiary">
            On this pace you&apos;d reach your goal around{' '}
            {new Date(weight.projected_goal_date).toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            })}
            .
          </p>
        )}
      </GlassCard>

      {/* Daily average calories */}
      <GlassCard index={3} className="p-5">
        <h2 className="font-semibold">Daily average calories</h2>

        <div className="mt-4 flex items-end gap-4">
          <p className="text-4xl font-semibold tracking-tight">
            <AnimatedNumber value={wow?.thisWeekAvg ?? 0} />
            <span className="ml-1.5 text-base text-ink-secondary">kcal</span>
          </p>

          {wow && wow.lastWeekAvg > 0 && (
            <span
              className={cn(
                'mb-1.5 flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium',
                wow.percentChange > 0
                  ? 'bg-state-warning/12 text-state-warning'
                  : wow.percentChange < 0
                    ? 'bg-state-success/12 text-state-success'
                    : 'bg-white/[0.06] text-ink-secondary',
              )}
            >
              {wow.percentChange > 0 ? (
                <TrendingUp className="h-3 w-3" aria-hidden />
              ) : wow.percentChange < 0 ? (
                <TrendingDown className="h-3 w-3" aria-hidden />
              ) : (
                <Minus className="h-3 w-3" aria-hidden />
              )}
              {Math.abs(wow.percentChange)}% vs last week
            </span>
          )}
        </div>

        <p className="mt-2 text-[13px] text-ink-secondary">
          {calories?.target
            ? `Your target is ${Math.round(calories.target)} kcal a day.`
            : 'Finish onboarding to set a target.'}
          {calories?.tdee && ` We estimate you burn about ${Math.round(calories.tdee)}.`}
        </p>
      </GlassCard>

      {/* Macro split over time */}
      <GlassCard index={4} className="p-5">
        <h2 className="font-semibold">Macro split</h2>
        <p className="mt-1 text-[13px] text-ink-secondary">Protein, carbs and fat over the last 30 days.</p>
        <div className="mt-4">
          <MacroChart data={calories?.macro_series ?? []} />
        </div>
      </GlassCard>
    </div>
  );
}

function ProgressSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading your progress">
      <div className="skeleton h-12 w-40" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="skeleton h-44 rounded-2xl" />
        <div className="skeleton h-44 rounded-2xl" />
      </div>
      <div className="skeleton h-80 rounded-2xl" />
      <div className="skeleton h-36 rounded-2xl" />
    </div>
  );
}

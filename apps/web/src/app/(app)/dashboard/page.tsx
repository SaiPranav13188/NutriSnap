'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Flame, Plus } from 'lucide-react';
import type { FoodLog } from '@nutrisnap/core';
import { EMPTY_TOTALS } from '@nutrisnap/core';
import { api, ApiError, type DayResponse, type DayTotals } from '@/lib/api';
import { readStoredAnswers, clearStoredAnswers } from '@/lib/onboardingStorage';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { CalorieRings } from '@/components/rings/CalorieRings';
import { WeekStrip } from '@/components/dashboard/WeekStrip';
import { MealCard } from '@/components/dashboard/MealCard';

const today = () => new Date().toISOString().slice(0, 10);

export default function DashboardPage() {
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<DayResponse | null>(null);
  const [week, setWeek] = useState<DayTotals[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [dayData, weekData, streakData] = await Promise.all([
        api.getDay(date),
        api.getWeek(7),
        api.getStreak(),
      ]);
      setDay(dayData);
      setWeek(weekData.days);
      setStreak(streakData.streak.current_streak);
      setNeedsOnboarding(dayData.targets === null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load your day.');
    } finally {
      setLoading(false);
    }
  }, [date]);

  /**
   * If the user completed the quiz before signing up, their answers are still
   * in local storage. Flush them now that an account exists.
   */
  useEffect(() => {
    const pending = readStoredAnswers();
    if (!pending) {
      void load();
      return;
    }

    api
      .completeOnboarding(pending as Record<string, unknown>)
      .then(() => clearStoredAnswers())
      .catch(() => {
        // Leave the answers in place — they can be retried on the next visit.
      })
      .finally(() => void load());
  }, [load]);

  async function handleDelete(id: string) {
    const previous = day;
    // Optimistic — the row disappears immediately and comes back on failure.
    setDay((current) =>
      current ? { ...current, logs: current.logs.filter((l) => l.id !== id) } : current,
    );
    try {
      await api.deleteLog(id);
      await load();
    } catch {
      setDay(previous);
      setError('Could not delete that meal.');
    }
  }

  async function handleToggleFavorite(log: FoodLog) {
    setDay((current) =>
      current
        ? {
            ...current,
            logs: current.logs.map((l) =>
              l.id === log.id ? { ...l, is_favorite: !l.is_favorite } : l,
            ),
          }
        : current,
    );
    try {
      await api.updateLog(log.id, { is_favorite: !log.is_favorite });
    } catch {
      void load();
    }
  }

  if (loading) return <DashboardSkeleton />;

  if (needsOnboarding) {
    return (
      <GlassCard className="p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Let&apos;s build your plan</h1>
        <p className="mt-2.5 text-ink-secondary">
          Answer a few questions and we&apos;ll work out your daily calorie and macro targets.
        </p>
        <Link href="/onboarding" className="mt-6 inline-block">
          <Button size="lg">Start the quiz</Button>
        </Link>
      </GlassCard>
    );
  }

  const totals = day?.totals ?? EMPTY_TOTALS;
  const targets = day?.targets;
  const isToday = date === today();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-secondary">
            {isToday
              ? 'Today'
              : new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Your day</h1>
        </div>

        <div className="glass flex items-center gap-2 rounded-full px-3.5 py-2">
          <Flame
            className={streak > 0 ? 'h-4 w-4 text-accent-lime' : 'h-4 w-4 text-ink-tertiary'}
            aria-hidden
          />
          <span className="tnum text-sm font-semibold">{streak}</span>
          <span className="sr-only">day logging streak</span>
        </div>
      </header>

      <GlassCard className="p-4">
        <WeekStrip
          days={week}
          targetCalories={targets?.calories ?? 2000}
          selectedDate={date}
          onSelect={setDate}
        />
      </GlassCard>

      {error && (
        <p className="rounded-2xl bg-state-danger/10 px-4 py-3 text-sm text-state-danger" role="alert">
          {error}
        </p>
      )}

      <GlassCard index={1} className="px-6 py-8">
        {targets ? (
          <CalorieRings totals={totals} targets={targets} />
        ) : (
          <p className="text-center text-ink-secondary">No targets set yet.</p>
        )}
      </GlassCard>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/scan">
          <Button fullWidth size="lg">
            <Camera className="h-4 w-4" aria-hidden />
            Scan food
          </Button>
        </Link>
        <Link href="/scan?mode=text">
          <Button fullWidth size="lg" variant="glass">
            <Plus className="h-4 w-4" aria-hidden />
            Describe it
          </Button>
        </Link>
      </div>

      <section className="flex flex-col gap-2.5">
        <h2 className="px-1 text-sm font-medium uppercase tracking-wider text-ink-secondary">
          {isToday ? 'Recently uploaded' : 'Logged this day'}
        </h2>

        {day && day.logs.length === 0 ? (
          <GlassCard index={2} className="p-8 text-center">
            <p className="text-ink-secondary">Nothing logged yet.</p>
            <p className="mt-1 text-sm text-ink-tertiary">
              Snap your next meal and it will show up here.
            </p>
          </GlassCard>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {day?.logs.map((log, i) => (
              <MealCard
                key={log.id}
                log={log}
                index={i}
                onDelete={handleDelete}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </AnimatePresence>
        )}
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading your day">
      <div className="skeleton h-12 w-48" />
      <div className="skeleton h-20 w-full rounded-2xl" />
      <div className="skeleton h-80 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-14 rounded-2xl" />
        <div className="skeleton h-14 rounded-2xl" />
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col gap-2.5"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-20 rounded-2xl" />
        ))}
      </motion.div>
    </div>
  );
}

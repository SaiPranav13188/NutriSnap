'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, LogOut, RefreshCw } from 'lucide-react';
import type { DailyTarget, Profile } from '@nutrisnap/core';
import { ACTIVITY_LABELS, formatHeight, formatWeight } from '@nutrisnap/core';
import { api, ApiError } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [targets, setTargets] = useState<DailyTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .getProfile()
      .then(({ profile: p, targets: t }) => {
        setProfile(p);
        setTargets(t);
      })
      .catch((caught) =>
        setError(caught instanceof ApiError ? caught.message : 'Could not load your profile.'),
      )
      .finally(() => setLoading(false));
  }, []);

  async function patch(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const { profile: p, targets: t } = await api.updateProfile(body);
      setProfile(p);
      setTargets(t);
      setNotice('Saved. Your targets have been recalculated.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that change.');
    } finally {
      setBusy(null);
    }
  }

  async function handleExport() {
    setBusy('export');
    setError(null);
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nutrisnap-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice('Your data has been downloaded.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not export your data.');
    } finally {
      setBusy(null);
    }
  }

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.push('/');
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="skeleton h-12 w-40" />
        <div className="skeleton h-64 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    );
  }

  const units = profile?.units ?? 'metric';

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-ink-secondary">Your plan, your data, your account.</p>
      </header>

      {error && (
        <p className="rounded-2xl bg-state-danger/10 px-4 py-3 text-sm text-state-danger" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-2xl bg-state-success/10 px-4 py-3 text-sm text-state-success" role="status">
          {notice}
        </p>
      )}

      <GlassCard className="p-5">
        <h2 className="font-semibold">Your plan</h2>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Row label="Daily calories" value={targets ? `${Math.round(targets.calories)} kcal` : '—'} />
          <Row label="Protein" value={targets ? `${Math.round(targets.protein_g)} g` : '—'} />
          <Row label="Carbs" value={targets ? `${Math.round(targets.carbs_g)} g` : '—'} />
          <Row label="Fat" value={targets ? `${Math.round(targets.fat_g)} g` : '—'} />
          <Row label="BMR" value={targets?.bmr ? `${Math.round(targets.bmr)} kcal` : '—'} />
          <Row label="Est. daily burn" value={targets?.tdee ? `${Math.round(targets.tdee)} kcal` : '—'} />
        </dl>

        <Button
          variant="glass"
          size="sm"
          className="mt-5"
          loading={busy === 'recalc'}
          onClick={async () => {
            setBusy('recalc');
            try {
              const { targets: t } = await api.recalculateTargets();
              setTargets(t);
              setNotice('Targets recalculated from your current stats.');
            } catch (caught) {
              setError(caught instanceof ApiError ? caught.message : 'Could not recalculate.');
            } finally {
              setBusy(null);
            }
          }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Recalculate
        </Button>
      </GlassCard>

      <GlassCard index={1} className="p-5">
        <h2 className="font-semibold">Your body</h2>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Row label="Height" value={profile?.height_cm ? formatHeight(profile.height_cm, units) : '—'} />
          <Row
            label="Weight"
            value={profile?.current_weight_kg ? formatWeight(profile.current_weight_kg, units) : '—'}
          />
          <Row
            label="Goal weight"
            value={profile?.goal_weight_kg ? formatWeight(profile.goal_weight_kg, units) : '—'}
          />
          <Row
            label="Activity"
            value={profile?.activity_level ? ACTIVITY_LABELS[profile.activity_level].title : '—'}
          />
        </dl>
      </GlassCard>

      <GlassCard index={2} className="p-5">
        <h2 className="font-semibold">Goal</h2>
        <p className="mt-1 text-[13px] text-ink-secondary">
          Changing this recalculates your calorie and macro targets straight away.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {(['lose', 'maintain', 'gain'] as const).map((goal) => (
            <button
              key={goal}
              type="button"
              disabled={busy !== null}
              onClick={() => patch({ goal }, 'goal')}
              aria-pressed={profile?.goal === goal}
              className={`rounded-full border px-4 py-2 text-sm capitalize transition-colors disabled:opacity-50 ${
                profile?.goal === goal
                  ? 'border-accent-lime/60 bg-accent-lime/10'
                  : 'border-glass-border text-ink-secondary hover:bg-white/[0.06]'
              }`}
            >
              {goal} weight
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard index={3} className="p-5">
        <h2 className="font-semibold">Units</h2>

        <div className="mt-4 flex gap-2">
          {(['metric', 'imperial'] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              disabled={busy !== null}
              onClick={() => patch({ units: unit }, 'units')}
              aria-pressed={units === unit}
              className={`rounded-full border px-4 py-2 text-sm capitalize transition-colors disabled:opacity-50 ${
                units === unit
                  ? 'border-accent-lime/60 bg-accent-lime/10'
                  : 'border-glass-border text-ink-secondary hover:bg-white/[0.06]'
              }`}
            >
              {unit}
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard index={4} className="p-5">
        <h2 className="font-semibold">Your data</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
          Everything NutriSnap holds about you — profile, targets, every meal and weigh-in — as
          one JSON file.
        </p>

        <Button variant="glass" size="sm" className="mt-4" loading={busy === 'export'} onClick={handleExport}>
          <Download className="h-4 w-4" aria-hidden />
          Export everything
        </Button>
      </GlassCard>

      <GlassCard index={5} className="p-5">
        <Button variant="danger" fullWidth onClick={handleSignOut}>
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </Button>
      </GlassCard>

      <p className="px-2 pb-4 text-center text-[12px] leading-relaxed text-ink-tertiary">
        NutriSnap provides general wellness guidance, not medical advice. Calorie estimates from
        photos are approximate. Talk to a qualified professional before making significant
        dietary changes, particularly if you have a medical condition.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] uppercase tracking-wider text-ink-tertiary">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

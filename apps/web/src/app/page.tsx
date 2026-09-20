import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Camera, LineChart, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

const FEATURES = [
  {
    icon: Camera,
    title: 'Snap a photo',
    body: 'Point your camera at the plate. NutriSnap identifies the dish and every ingredient on it.',
  },
  {
    icon: Sparkles,
    title: 'Macros, automatically',
    body: 'Calories, protein, carbs, fat, sugar and fibre — estimated, with a confidence score you can correct.',
  },
  {
    icon: LineChart,
    title: 'Watch it move',
    body: 'Weight and calorie trends over 90 days, a month, six months, a year, or all of it.',
  },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Someone already signed in has no use for the pitch.
  if (user) redirect('/dashboard');

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">
          Nutri<span className="text-accent-gradient">Snap</span>
        </span>
        <Link
          href="/signin"
          className="text-sm text-ink-secondary transition-colors hover:text-ink-primary"
        >
          Sign in
        </Link>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-20 text-center">
        <p className="mb-5 rounded-full border border-glass-border px-4 py-1.5 text-xs uppercase tracking-[0.18em] text-ink-secondary">
          AI calorie tracking
        </p>

        <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Stop weighing your food.
          <br />
          <span className="text-accent-gradient">Just photograph it.</span>
        </h1>

        <p className="mt-7 max-w-xl text-pretty text-lg leading-relaxed text-ink-secondary">
          Answer a few questions, get a calorie and macro target built from your own body and
          goal, then log meals with your camera instead of a database search.
        </p>

        <div className="mt-11 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/onboarding"
            className="inline-flex h-14 items-center justify-center rounded-2xl bg-accent px-9 font-semibold text-base-900 transition-shadow hover:shadow-glow"
          >
            Build my plan
          </Link>
          <Link
            href="/signin"
            className="glass-strong inline-flex h-14 items-center justify-center rounded-2xl px-9 font-medium transition-colors hover:bg-white/[0.11]"
          >
            I already have an account
          </Link>
        </div>

        <p className="mt-5 text-xs text-ink-tertiary">
          No card required. The quiz takes about a minute.
        </p>
      </section>

      <section className="grid gap-4 pb-16 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="glass rounded-2xl p-6 shadow-glass">
            <Icon className="h-6 w-6 text-accent-lime" aria-hidden />
            <h2 className="mt-4 font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-glass-border pt-6 text-center text-xs leading-relaxed text-ink-tertiary">
        NutriSnap gives general wellness guidance, not medical advice. Photo-based calorie
        estimates are approximate — check portions that matter with a professional.
      </footer>
    </main>
  );
}

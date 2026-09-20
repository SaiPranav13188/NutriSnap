'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { AlertCircle, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { readStoredAnswers, clearStoredAnswers } from '@/lib/onboardingStorage';
import { api } from '@/lib/api';

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/dashboard';

  const [mode, setMode] = useState<'signin' | 'signup'>(
    params.get('mode') === 'signup' ? 'signup' : 'signin',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * The quiz runs before signup, so its answers are sitting in local storage.
   * The moment we have a session, push them to the API and clear them.
   */
  async function savePendingOnboarding() {
    const answers = readStoredAnswers();
    if (!answers) return;
    try {
      await api.completeOnboarding(answers as Record<string, unknown>);
      clearStoredAnswers();
    } catch {
      // Keep the answers so /dashboard can retry rather than losing the quiz.
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const supabase = createClient();

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;

        // With email confirmation on, there is no session yet.
        if (!data.session) {
          setNotice('Check your inbox to confirm your email, then sign in.');
          setMode('signin');
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }

      await savePendingOnboarding();
      router.push(next);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (oauthError) setError(oauthError.message);
  }

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center text-lg font-semibold tracking-tight">
          Nutri<span className="text-accent-gradient">Snap</span>
        </Link>

        <GlassCard className="p-7">
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-2 text-sm text-ink-secondary">
            {mode === 'signup'
              ? 'One account keeps your plan in sync on web and phone.'
              : 'Sign in to pick up where you left off.'}
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <Button variant="glass" fullWidth onClick={() => handleOAuth('google')} type="button">
              Continue with Google
            </Button>
            <Button variant="glass" fullWidth onClick={() => handleOAuth('apple')} type="button">
              Continue with Apple
            </Button>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-ink-tertiary">
            <span className="h-px flex-1 bg-glass-border" />
            or
            <span className="h-px flex-1 bg-glass-border" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-secondary">
                Email
              </span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 rounded-2xl border border-glass-border bg-white/[0.04] px-4 text-[15px] outline-none transition-colors focus:border-accent-lime/50"
                placeholder="you@example.com"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-secondary">
                Password
              </span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-2xl border border-glass-border bg-white/[0.04] px-4 text-[15px] outline-none transition-colors focus:border-accent-lime/50"
                placeholder="At least 6 characters"
              />
            </label>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 rounded-xl bg-state-danger/10 px-3 py-2.5 text-sm text-state-danger"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {error}
              </motion.p>
            )}

            {notice && (
              <p className="flex items-start gap-2 rounded-xl bg-accent-cyan/10 px-3 py-2.5 text-sm text-accent-cyan">
                <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {notice}
              </p>
            )}

            <Button type="submit" loading={loading} fullWidth className="mt-2">
              {mode === 'signup' ? 'Create account' : 'Sign in'}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signup' ? 'signin' : 'signup');
              setError(null);
              setNotice(null);
            }}
            className="mt-5 w-full text-center text-sm text-ink-secondary transition-colors hover:text-ink-primary"
          >
            {mode === 'signup'
              ? 'Already have an account? Sign in'
              : "Don't have an account? Create one"}
          </button>
        </GlassCard>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center" />}>
      <SignInForm />
    </Suspense>
  );
}

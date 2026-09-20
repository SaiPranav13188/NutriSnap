'use client';

import type { OnboardingAnswers } from '@nutrisnap/core';

/**
 * The quiz deliberately runs before sign-up (plan section 1.4 — it is what
 * makes people finish it), so the answers live in local storage until an
 * account exists to attach them to.
 */
const KEY = 'nutrisnap.onboarding.v1';

export function readStoredAnswers(): OnboardingAnswers | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OnboardingAnswers) : null;
  } catch {
    return null;
  }
}

export function storeAnswers(answers: OnboardingAnswers): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(answers));
  } catch {
    // Private browsing or a full quota — the quiz still works, it just will
    // not survive a refresh.
  }
}

export function clearStoredAnswers(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing we can do, and nothing depends on it succeeding.
  }
}

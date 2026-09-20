import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

/**
 * Browser-based social sign-in for iOS and Android.
 *
 * Why not the native Google SDK: it is a native module, which means leaving
 * Expo Go behind for a custom dev build, plus per-platform OAuth clients and
 * an Android SHA-1 fingerprint. This flow needs none of that — it reuses the
 * same single Web OAuth client the website uses, and runs inside Expo Go.
 *
 * The shape of it:
 *   1. Ask Supabase for the provider's authorize URL, but do not let it
 *      navigate (`skipBrowserRedirect`) — on native we drive the browser.
 *   2. Open that URL in a system auth session (SFSafariViewController on iOS,
 *      Custom Tabs on Android), which shares the OS cookie jar, so an already
 *      signed-in Google account needs no password.
 *   3. The provider redirects to our deep link with a PKCE `code`.
 *   4. Exchange that code for a real session.
 *
 * The app's `scheme` in app.json ("nutrisnap") is what makes step 3 land back
 * in the app rather than a dead browser tab.
 */

export type OAuthProvider = 'google' | 'apple';

/** Which providers to offer, e.g. EXPO_PUBLIC_OAUTH_PROVIDERS="google". */
const rawProviders: string = process.env.EXPO_PUBLIC_OAUTH_PROVIDERS ?? '';

export const ENABLED_PROVIDERS: OAuthProvider[] = rawProviders
  .split(',')
  .map((p: string) => p.trim().toLowerCase())
  .filter((p: string): p is OAuthProvider => p === 'google' || p === 'apple');

export class OAuthCancelled extends Error {
  constructor() {
    super('Sign-in was cancelled.');
    this.name = 'OAuthCancelled';
  }
}

export async function signInWithProvider(provider: OAuthProvider): Promise<void> {
  // e.g. "nutrisnap://auth-callback" in a build, or an exp:// URL in Expo Go.
  // Linking.createURL handles both, which is why we do not hardcode it.
  const redirectTo = Linking.createURL('auth-callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error) throw error;
  if (!data?.url) throw new Error('Could not start sign-in. Try again.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new OAuthCancelled();
  }
  if (result.type !== 'success') {
    throw new Error('Sign-in did not complete.');
  }

  const { queryParams } = Linking.parse(result.url);

  // The provider can decline before we ever see a code.
  const providerError = queryParams?.error_description ?? queryParams?.error;
  if (typeof providerError === 'string') {
    throw new Error(providerError);
  }

  const code = queryParams?.code;
  if (typeof code !== 'string') {
    throw new Error('Sign-in did not return a valid code.');
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

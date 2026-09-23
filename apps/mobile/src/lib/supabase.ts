import 'react-native-url-polyfill/auto';
// Installs `crypto.subtle`, which PKCE needs and Hermes does not have.
// Must come before `createClient`.
import './webCrypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy apps/mobile/.env.example to apps/mobile/.env and fill it in, then restart Expo.',
  );
}

/**
 * The dashboard also shows a REST endpoint (".../rest/v1"). Copying that one
 * instead of the project URL makes the client build paths like
 * "/rest/v1/auth/v1/authorize", which hit PostgREST rather than the auth
 * service and fail with a misleading "No API key found in request".
 */
const projectUrl = (() => {
  const parsed = new URL(url);
  const path = parsed.pathname.replace(/\/+$/, '');
  if (path !== '') {
    throw new Error(
      `EXPO_PUBLIC_SUPABASE_URL must have no path, but it ends in "${path}". ` +
        `Use "${parsed.origin}" instead.`,
    );
  }
  return parsed.origin;
})();

/**
 * The session is persisted in AsyncStorage so the user stays signed in
 * between app launches. `detectSessionInUrl` is web-only and must be off in
 * React Native.
 */
export const supabase = createClient(projectUrl, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Web-only: on native there is no URL bar for Supabase to read a session
    // from. The OAuth code is handed back through the deep link instead.
    detectSessionInUrl: false,
    // PKCE is what makes browser-based OAuth safe on a device that cannot
    // keep a client secret. The provider returns a short-lived `code` that
    // only this app can exchange for a session.
    flowType: 'pkce',
  },
});

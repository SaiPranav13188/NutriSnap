import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import { api } from '../src/lib/api';
import { clearStoredAnswers, readStoredAnswers } from '../src/lib/session';
import {
  ENABLED_PROVIDERS,
  OAuthCancelled,
  signInWithProvider,
  type OAuthProvider,
} from '../src/lib/oauth';
import { Button, Card, ErrorNote, Screen } from '../src/components/ui';
import { useColors } from '../src/lib/theme';

export default function SignIn() {
  const c = useColors();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'signin' | 'signup'>(
    params.mode === 'signup' ? 'signup' : 'signin',
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null);
  const [loading, setLoading] = useState(false);

  /** Flush the pre-signup quiz answers now that an account exists. */
  async function savePendingOnboarding() {
    const answers = await readStoredAnswers();
    if (!answers) return;
    try {
      await api.completeOnboarding(answers as Record<string, unknown>);
      await clearStoredAnswers();
    } catch {
      // Keep them for the dashboard to retry rather than losing the quiz.
    }
  }

  async function handleOAuth(provider: OAuthProvider) {
    setError(null);
    setNotice(null);
    setOauthBusy(provider);
    try {
      await signInWithProvider(provider);
      await savePendingOnboarding();
      router.replace('/(tabs)');
    } catch (caught) {
      // Backing out of the browser sheet is a normal thing to do, not an error
      // worth shouting about.
      if (caught instanceof OAuthCancelled) return;
      setError(caught instanceof Error ? caught.message : 'Could not sign in with that provider.');
    } finally {
      setOauthBusy(null);
    }
  }

  async function submit() {
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;

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
      router.replace('/(tabs)');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.glass.border,
    backgroundColor: c.glass.DEFAULT,
    color: c.text.primary,
    paddingHorizontal: 16,
    fontSize: 16,
  } as const;

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            <Card style={{ padding: 24, gap: 16 }}>
              <View>
                <Text style={{ color: c.text.primary, fontSize: 26, fontWeight: '700' }}>
                  {mode === 'signup' ? 'Create your account' : 'Welcome back'}
                </Text>
                <Text style={{ color: c.text.secondary, fontSize: 15, marginTop: 8, lineHeight: 21 }}>
                  {mode === 'signup'
                    ? 'One account keeps your plan in sync on web and phone.'
                    : 'Sign in to pick up where you left off.'}
                </Text>
              </View>

              {ENABLED_PROVIDERS.length > 0 && (
                <>
                  <View style={{ gap: 10 }}>
                    {ENABLED_PROVIDERS.includes('google') && (
                      <Button
                        variant="glass"
                        loading={oauthBusy === 'google'}
                        disabled={oauthBusy !== null || loading}
                        onPress={() => handleOAuth('google')}
                      >
                        Continue with Google
                      </Button>
                    )}
                    {ENABLED_PROVIDERS.includes('apple') && (
                      <Button
                        variant="glass"
                        loading={oauthBusy === 'apple'}
                        disabled={oauthBusy !== null || loading}
                        onPress={() => handleOAuth('apple')}
                      >
                        Continue with Apple
                      </Button>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: c.glass.border }} />
                    <Text style={{ color: c.text.tertiary, fontSize: 12, letterSpacing: 1 }}>OR</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: c.glass.border }} />
                  </View>
                </>
              )}

              <View style={{ gap: 10 }}>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={c.text.tertiary}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  style={inputStyle}
                  accessibilityLabel="Email"
                />

                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password (at least 6 characters)"
                  placeholderTextColor={c.text.tertiary}
                  secureTextEntry
                  autoCapitalize="none"
                  style={inputStyle}
                  accessibilityLabel="Password"
                />
              </View>

              {error && <ErrorNote message={error} />}

              {notice && (
                <Text style={{ color: c.accent.cyan, fontSize: 14, lineHeight: 20 }}>
                  {notice}
                </Text>
              )}

              <Button
                onPress={submit}
                loading={loading}
                disabled={email.length < 3 || password.length < 6}
              >
                {mode === 'signup' ? 'Create account' : 'Sign in'}
              </Button>

              <Pressable
                onPress={() => {
                  setMode(mode === 'signup' ? 'signin' : 'signup');
                  setError(null);
                  setNotice(null);
                }}
                accessibilityRole="button"
              >
                <Text style={{ color: c.text.secondary, fontSize: 14, textAlign: 'center' }}>
                  {mode === 'signup'
                    ? 'Already have an account? Sign in'
                    : "Don't have an account? Create one"}
                </Text>
              </Pressable>
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Screen>
  );
}

import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { User } from '@supabase/supabase-js';
import { api, ApiError } from '../src/lib/api';
import { supabase } from '../src/lib/supabase';
import { Button, Card, ErrorNote, Screen, ScreenHeader } from '../src/components/ui';
import { useColors } from '../src/lib/theme';
import { useSession } from '../src/lib/session';

/**
 * The sign-in itself, and the end of it.
 *
 * Deletion is here and not on the Profile hub on purpose: it belongs beside
 * the other account-level actions, and it should take a deliberate walk to
 * reach rather than sit one tap from the screen people open to change their
 * units.
 */

/** Supabase's own floor. Saying so up front beats a round trip to be told. */
const MIN_PASSWORD = 6;

/** How a provider id reads to a person. */
const PROVIDER_LABELS: Record<string, string> = {
  email: 'Email and password',
  google: 'Google',
  apple: 'Apple',
};

export default function Account() {
  const c = useColors();
  const { session } = useSession();

  /**
   * Fetched fresh rather than read off the cached session.
   *
   * `new_email` and `email_confirmed_at` change on the server when a
   * confirmation link is followed, and the session in memory does not hear
   * about it — so a change confirmed on a laptop would still show as pending
   * here until the app was restarted.
   */
  const [user, setUser] = useState<User | null>(session?.user ?? null);

  useFocusEffect(
    useCallback(() => {
      void supabase.auth.getUser().then(({ data }) => {
        if (data.user) setUser(data.user);
      });
    }, []),
  );

  const email = user?.email ?? session?.user.email ?? '';
  const pendingEmail = user?.new_email ?? null;
  const verified = Boolean(user?.email_confirmed_at);
  const providers = (user?.identities ?? []).map((identity) => identity.provider);

  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  async function changeEmail() {
    setBusy('email');
    setError(null);
    setNotice(null);

    const { error: caught } = await supabase.auth.updateUser({ email: newEmail.trim() });

    if (caught) {
      setError(caught.message);
    } else {
      setNewEmail('');
      // Supabase sends a confirmation link to both addresses; the change is
      // not live until that is followed, and saying "saved" here would be a
      // lie the user finds out about at the next sign-in.
      setNotice('Check both inboxes — the change takes effect once you confirm the link.');
      // Re-read so the pending banner appears straight away rather than on
      // the next visit to this screen.
      const { data } = await supabase.auth.getUser();
      if (data.user) setUser(data.user);
    }
    setBusy(null);
  }

  /**
   * Send the confirmation link again.
   *
   * The link expires, and it lands in an inbox the user may not have had to
   * hand at the time. Without this the only way out of a half-finished change
   * is to request a different address entirely.
   */
  async function resendConfirmation() {
    setBusy('resend');
    setError(null);
    setNotice(null);

    const { error: caught } = await supabase.auth.resend(
      pendingEmail
        ? { type: 'email_change', email: pendingEmail }
        : { type: 'signup', email },
    );

    if (caught) setError(caught.message);
    else setNotice('Sent. Check your inbox, and your spam folder.');
    setBusy(null);
  }

  /**
   * End every other session but this one.
   *
   * Scoped to `others` rather than `global` deliberately: signing yourself out
   * of the screen you are standing on is a surprise, and Profile already has
   * a plain sign-out for when that is what you meant.
   */
  async function signOutOthers() {
    setBusy('others');
    setError(null);
    setNotice(null);

    const { error: caught } = await supabase.auth.signOut({ scope: 'others' });

    if (caught) setError(caught.message);
    else setNotice('Signed out everywhere except this phone.');
    setBusy(null);
  }

  async function changePassword() {
    setBusy('password');
    setError(null);
    setNotice(null);

    const { error: caught } = await supabase.auth.updateUser({ password });

    if (caught) {
      setError(caught.message);
    } else {
      setPassword('');
      setNotice('Password updated.');
    }
    setBusy(null);
  }

  async function deleteAccount() {
    setBusy('delete');
    setError(null);

    try {
      await api.deleteAccount(confirmText.trim());
      // The row is gone; the local session is still holding a token for a
      // user that no longer exists, so it goes too.
      await supabase.auth.signOut();
      router.replace('/signin');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not delete your account.');
      setBusy(null);
    }
  }

  const inputStyle = {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.glass.border,
    backgroundColor: c.glass.DEFAULT,
    color: c.text.primary,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  } as const;

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScreenHeader title="Account" />

        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {error && <ErrorNote message={error} />}
          {notice && (
            <View style={{ backgroundColor: `${c.state.success}1A`, borderRadius: 18, padding: 14 }}>
              <Text style={{ color: c.state.success, fontSize: 14, lineHeight: 20 }}>{notice}</Text>
            </View>
          )}

          <Card style={{ padding: 18, gap: 10 }}>
            <Text style={{ color: c.text.tertiary, fontSize: 12, letterSpacing: 0.8 }}>
              SIGNED IN AS
            </Text>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              {email || '—'}
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Badge
                label={verified ? 'Verified' : 'Not verified'}
                tone={verified ? c.state.success : c.state.warning}
              />
              {providers.map((provider) => (
                <Badge
                  key={provider}
                  label={PROVIDER_LABELS[provider] ?? provider}
                  tone={c.text.secondary}
                />
              ))}
            </View>

            {user?.last_sign_in_at && (
              <Text style={{ color: c.text.tertiary, fontSize: 12 }}>
                Last signed in{' '}
                {new Date(user.last_sign_in_at).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
            )}

            {!verified && (
              <Button
                variant="glass"
                loading={busy === 'resend'}
                onPress={() => void resendConfirmation()}
              >
                Resend verification email
              </Button>
            )}
          </Card>

          {/* A change in flight is a state the user can otherwise only learn
              about by trying again and being told the address is taken. */}
          {pendingEmail && (
            <Card style={{ padding: 18, gap: 10, borderColor: `${c.state.warning}55` }}>
              <Text style={{ color: c.state.warning, fontSize: 15, fontWeight: '700' }}>
                Change pending
              </Text>
              <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
                Waiting on confirmation for{' '}
                <Text style={{ color: c.text.primary, fontWeight: '700' }}>{pendingEmail}</Text>.
                Until both links are followed you stay signed in with {email}.
              </Text>
              <Button
                variant="glass"
                loading={busy === 'resend'}
                onPress={() => void resendConfirmation()}
              >
                Resend the link
              </Button>
              <Text style={{ color: c.text.tertiary, fontSize: 12, lineHeight: 18 }}>
                Requesting a different address below replaces this one. There is no way to cancel
                a pending change outright — leaving it unconfirmed lets it expire.
              </Text>
            </Card>
          )}

          <Card style={{ padding: 18, gap: 12 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Change email
            </Text>
            <TextInput
              value={newEmail}
              onChangeText={setNewEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="new@example.com"
              placeholderTextColor={c.text.tertiary}
              style={inputStyle}
            />
            <Button
              variant="glass"
              loading={busy === 'email'}
              disabled={!newEmail.includes('@') || newEmail.trim() === email}
              onPress={() => void changeEmail()}
            >
              Send confirmation
            </Button>
          </Card>

          <Card style={{ padding: 18, gap: 12 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Change password
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              secureTextEntry
              textContentType="newPassword"
              placeholder={`At least ${MIN_PASSWORD} characters`}
              placeholderTextColor={c.text.tertiary}
              style={inputStyle}
            />
            <Button
              variant="glass"
              loading={busy === 'password'}
              disabled={password.length < MIN_PASSWORD}
              onPress={() => void changePassword()}
            >
              Update password
            </Button>
            <Text style={{ color: c.text.tertiary, fontSize: 12, lineHeight: 18 }}>
              {providers.includes('email')
                ? 'This replaces your current password. You stay signed in on this phone.'
                : `You signed in with ${providers
                    .map((p) => PROVIDER_LABELS[p] ?? p)
                    .join(' and ')}. Setting a password adds a second way in rather than replacing that one.`}
            </Text>
          </Card>

          <Card style={{ padding: 18, gap: 12 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
              Other devices
            </Text>
            <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
              Ends every other session signed in as you — a shared laptop, an old phone, anything
              you no longer have. This phone stays signed in.
            </Text>
            <Button
              variant="glass"
              loading={busy === 'others'}
              onPress={() => void signOutOthers()}
            >
              Sign out everywhere else
            </Button>
          </Card>

          <Card style={{ padding: 18, gap: 12, borderColor: `${c.state.danger}55` }}>
            <Text style={{ color: c.state.danger, fontSize: 16, fontWeight: '700' }}>
              Delete account
            </Text>
            <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
              This removes your profile, every meal and weigh-in, your photos and your sign-in.
              It happens immediately and it cannot be undone — there is no grace period and no
              copy kept.
            </Text>
            <Text style={{ color: c.text.tertiary, fontSize: 12, lineHeight: 18 }}>
              Export your data first if you want to keep any of it. Preferences → Your data.
            </Text>
            <Button
              variant="danger"
              onPress={() => {
                setConfirmText('');
                setError(null);
                setConfirmOpen(true);
              }}
            >
              Delete my account
            </Button>
          </Card>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={confirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <Card style={{ padding: 22, gap: 14, backgroundColor: c.base['800'] }}>
            <Text style={{ color: c.text.primary, fontSize: 19, fontWeight: '700' }}>
              Delete everything?
            </Text>
            <Text style={{ color: c.text.secondary, fontSize: 14, lineHeight: 20 }}>
              Type <Text style={{ color: c.text.primary, fontWeight: '700' }}>{email}</Text> to
              confirm.
            </Text>

            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder={email}
              placeholderTextColor={c.text.tertiary}
              style={inputStyle}
            />

            {error && <ErrorNote message={error} />}

            <Button
              variant="danger"
              loading={busy === 'delete'}
              // Compared here as well as on the server so the button cannot be
              // pressed hopefully; the server checks it again because a client
              // is not where a rule like this can live.
              disabled={confirmText.trim().toLowerCase() !== email.toLowerCase()}
              onPress={() => void deleteAccount()}
            >
              Permanently delete
            </Button>
            <Pressable
              onPress={() => setConfirmOpen(false)}
              accessibilityRole="button"
              style={{ alignItems: 'center', paddingVertical: 8 }}
            >
              <Text style={{ color: c.text.secondary, fontSize: 15, fontWeight: '600' }}>
                Keep my account
              </Text>
            </Pressable>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

/** A small stated fact — verification, or a linked sign-in method. */
function Badge({ label, tone }: { label: string; tone: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: `${tone}1A`,
      }}
    >
      <Text style={{ color: tone, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

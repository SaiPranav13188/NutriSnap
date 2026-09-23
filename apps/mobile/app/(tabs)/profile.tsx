import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ageInYears,
  consistency,
  type Consistency,
  type DailyTarget,
  type Profile as ProfileRow,
} from '@nutrisnap/core';
import { api, ApiError } from '../../src/lib/api';
import { supabase } from '../../src/lib/supabase';
import { Button, Card, ErrorNote, Screen } from '../../src/components/ui';
import { SettingsGroup, SettingsRow } from '../../src/components/SettingsRow';
import { Avatar } from '../../src/components/Avatar';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { useColors } from '../../src/lib/theme';
import { useSession } from '../../src/lib/session';

/**
 * The account screen, as a hub.
 *
 * This was one long scroll called Settings with every control on it — plan,
 * body stats, goal, units, export and reminders, all expanded at once. That
 * works while there are four things on it and stops working at ten, because
 * everything is equally loud and nothing can be found twice.
 *
 * So the controls moved into screens of their own and this became the index
 * of them. Nothing was dropped; every card that used to live here now lives
 * one tap away, grouped by the question it answers.
 */
export default function Profile() {
  const c = useColors();
  const { session } = useSession();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [targets, setTargets] = useState<DailyTarget | null>(null);
  const [streak, setStreak] = useState(0);
  const [logging, setLogging] = useState<Consistency | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reloaded on focus so a weight edited on Personal details is reflected in
  // the header the moment the user comes back.
  useFocusEffect(
    useCallback(() => {
      api
        .getProfile()
        .then(({ profile: p, targets: t }) => {
          setProfile(p);
          setTargets(t);
          setError(null);
        })
        .catch((caught) =>
          setError(caught instanceof ApiError ? caught.message : 'Could not load your profile.'),
        )
        .finally(() => setLoading(false));

      // The consistency card decorates the screen rather than constituting
      // it, so it is allowed to fail without taking the profile down.
      void Promise.allSettled([api.getStreak(), api.getWeek(30)]).then(([s, week]) => {
        if (s.status === 'fulfilled') setStreak(s.value.streak.current_streak);
        if (week.status === 'fulfilled') setLogging(consistency(week.value.days, 30));
      });
    }, []),
  );

  const name =
    profile?.full_name ??
    (session?.user.user_metadata?.full_name as string | undefined) ??
    session?.user.email ??
    null;

  const age = profile?.date_of_birth ? ageInYears(new Date(profile.date_of_birth)) : null;

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.accent.lime} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: 40 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ color: c.text.primary, fontSize: 30, fontWeight: '700' }}>Profile</Text>
            <ThemeToggle />
          </View>

          {error && <ErrorNote message={error} />}

          <Card style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar name={name} size={56} />
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: c.text.primary, fontSize: 19, fontWeight: '700' }}
                numberOfLines={1}
              >
                {name ?? 'Your account'}
              </Text>
              <Text style={{ color: c.text.tertiary, fontSize: 14, marginTop: 2 }}>
                {age !== null ? `${age} years old` : 'Finish the quiz to set up your plan'}
              </Text>
            </View>
          </Card>

          {/* Streak answers "did you log yesterday"; completeness answers the
              question the adaptive engine actually acts on. */}
          {logging && (
            <Card style={{ padding: 18, gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 22 }}>
                <Figure label="Day streak" value={`${streak}`} icon="🔥" />
                <Figure
                  label={`Of last ${logging.windowDays}`}
                  value={`${logging.daysLogged}`}
                  icon="📓"
                />
                <Figure
                  label="Complete"
                  value={`${Math.round(logging.completeness * 100)}%`}
                  icon={logging.enoughToAdapt ? '✅' : '⏳'}
                />
              </View>

              <Text style={{ color: c.text.secondary, fontSize: 13, lineHeight: 19 }}>
                {logging.summary}
              </Text>
            </Card>
          )}

          <SettingsGroup title="Account">
            <SettingsRow
              icon="🪪"
              label="Personal details"
              onPress={() => router.push('/personal-details')}
              accessibilityHint="Weight, height, date of birth, gender and step goal"
            />
            <SettingsRow
              icon="🥗"
              label="Diet & allergies"
              onPress={() => router.push('/diet')}
              accessibilityHint="What suggestions and menu scans must avoid"
            />
            <SettingsRow
              icon="⚙️"
              label="Preferences"
              onPress={() => router.push('/preferences')}
              accessibilityHint="Units, water goal, reminders and your data"
            />
            <SettingsRow
              icon="🔐"
              label="Sign-in & account"
              onPress={() => router.push('/account')}
              accessibilityHint="Change your email or password, or delete your account"
              last
            />
          </SettingsGroup>

          <SettingsGroup title="Goals & Tracking">
            <SettingsRow
              icon="🎯"
              label="Edit Nutrition Goals"
              value={targets ? `${Math.round(targets.calories)} kcal` : undefined}
              onPress={() => router.push('/nutrition-goals')}
            />
            <SettingsRow
              icon="📈"
              label="Why your target is what it is"
              onPress={() => router.push('/target-history')}
              accessibilityHint="What your own data says your target should be, and every time it has moved"
            />
            <SettingsRow
              icon="⭐"
              label="Favourites"
              onPress={() => router.push('/favourites')}
              accessibilityHint="The meals pinned to your home screen"
            />
            <SettingsRow
              icon="⭕"
              label="Ring Colors Explained"
              onPress={() => router.push('/ring-colors')}
              accessibilityHint="What the colours on the home calendar mean"
            />
            <SettingsRow
              icon="🔄"
              label="Retake the quiz"
              onPress={() => router.push('/onboarding')}
              accessibilityHint="Answer the setup questions again and rebuild your plan"
              last
            />
          </SettingsGroup>

          <Button
            variant="danger"
            onPress={async () => {
              await supabase.auth.signOut();
              router.replace('/signin');
            }}
          >
            Sign out
          </Button>

          <Text
            style={{
              color: c.text.tertiary,
              fontSize: 12,
              lineHeight: 18,
              textAlign: 'center',
              paddingHorizontal: 8,
            }}
          >
            NutriSnap provides general wellness guidance, not medical advice. Calorie estimates
            from photos are approximate. Talk to a qualified professional before making
            significant dietary changes, particularly if you have a medical condition.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

/** One number on the consistency card. */
function Figure({ label, value, icon }: { label: string; value: string; icon: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 15 }}>{icon}</Text>
        <Text style={{ color: c.text.primary, fontSize: 21, fontWeight: '800' }}>{value}</Text>
      </View>
      <Text style={{ color: c.text.tertiary, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

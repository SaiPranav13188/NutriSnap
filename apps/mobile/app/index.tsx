import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@nutrisnap/ui';
import { useSession } from '../src/lib/session';

/**
 * Splash / router gate. Signed-in users go straight to their dashboard;
 * everyone else starts the quiz, which is what the plan wants — the quiz
 * comes before the account.
 */
export default function Index() {
  const { session, loading } = useSession();

  useEffect(() => {
    if (loading) return;
    router.replace(session ? '/(tabs)' : '/onboarding');
  }, [session, loading]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.base['900'],
        gap: 28,
      }}
    >
      <LinearGradient
        colors={[colors.accent.lime, colors.accent.cyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: 76, height: 76, borderRadius: 26 }}
      />
      <Text style={{ color: colors.text.primary, fontSize: 26, fontWeight: '700' }}>NutriSnap</Text>
      <ActivityIndicator color={colors.accent.lime} />
    </View>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInRight, FadeOut } from 'react-native-reanimated';
import {
  CRAFTING_STEPS,
  COMMON_ALLERGENS,
  GAIN_RATES_KG_PER_WEEK,
  LOSS_RATES_KG_PER_WEEK,
  MAINTAIN_FOCUS_AREAS,
  REFERRAL_SOURCES,
  calculateTargets,
  cmToFeetInches,
  kgToLb,
  stepsFor,
  validateStep,
  type OnboardingAnswers,
  type StepId,
} from '@nutrisnap/core';
import { colors, macroGradients } from '@nutrisnap/ui';
import { AnimatedNumber, Button, Card, Screen } from '../src/components/ui';
import { ProgressRing } from '../src/components/ProgressRing';
import { storeAnswers, readStoredAnswers } from '../src/lib/session';

const DEFAULTS: OnboardingAnswers = {
  height_cm: 170,
  current_weight_kg: 70,
  units: 'metric',
  allergies: [],
  rate_kg_per_week: 0.5,
};

export default function Onboarding() {
  const [answers, setAnswers] = useState<OnboardingAnswers>(DEFAULTS);
  const [index, setIndex] = useState(0);
  const [showError, setShowError] = useState(false);
  const [crafted, setCrafted] = useState(0);

  useEffect(() => {
    void readStoredAnswers().then((stored) => {
      if (stored) setAnswers({ ...DEFAULTS, ...stored });
    });
  }, []);

  useEffect(() => {
    void storeAnswers(answers);
  }, [answers]);

  const steps = useMemo(() => stepsFor(answers), [answers]);
  const step = steps[Math.min(index, steps.length - 1)];
  const error = step ? validateStep(step.id, answers) : null;

  const set = <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) => {
    void Haptics.selectionAsync();
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setShowError(false);
  };

  const goNext = () => {
    if (!step) return;
    if (validateStep(step.id, answers) !== null) {
      setShowError(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setShowError(false);
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const goBack = () => {
    setShowError(false);
    if (index > 0) setIndex((i) => i - 1);
  };

  // Tick the "Crafting your plan" checklist, then advance automatically.
  useEffect(() => {
    if (step?.id !== 'crafting') {
      setCrafted(0);
      return;
    }

    if (crafted >= CRAFTING_STEPS.length) {
      const done = setTimeout(goNext, 420);
      return () => clearTimeout(done);
    }

    const tick = setTimeout(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCrafted((n) => n + 1);
    }, 700);
    return () => clearTimeout(tick);
    // goNext is stable enough here; re-running on every render would restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, crafted]);

  const previewTargets = useMemo(() => {
    const { gender, height_cm, current_weight_kg, date_of_birth, activity_level, goal } = answers;
    if (!gender || !height_cm || !current_weight_kg || !date_of_birth || !activity_level || !goal) {
      return null;
    }
    try {
      return calculateTargets({
        gender,
        heightCm: height_cm,
        weightKg: current_weight_kg,
        dateOfBirth: date_of_birth,
        activityLevel: activity_level,
        goal,
        rateKgPerWeek: answers.rate_kg_per_week,
        trainingFocus: answers.training_focus,
      });
    } catch {
      return null;
    }
  }, [answers]);

  if (!step) return <Screen />;

  const progress = (index / (steps.length - 1)) * 100;

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 8 }}>
          <Pressable
            onPress={goBack}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: index === 0 ? 0.35 : 1,
            }}
          >
            <Text style={{ color: colors.text.primary, fontSize: 18, lineHeight: 20 }}>‹</Text>
          </Pressable>

          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <View
              style={{
                width: `${progress}%`,
                height: '100%',
                borderRadius: 3,
                backgroundColor: colors.accent.lime,
              }}
            />
          </View>

          <Text style={{ color: colors.text.tertiary, fontSize: 12, width: 44, textAlign: 'right' }}>
            {index + 1}/{steps.length}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, gap: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View key={step.id} entering={FadeInRight.duration(280)} exiting={FadeOut.duration(140)}>
            {step.id !== 'crafting' && (
              <View style={{ marginBottom: 26 }}>
                <Text style={{ color: colors.text.primary, fontSize: 28, fontWeight: '700', lineHeight: 34 }}>
                  {step.title}
                </Text>
                {step.subtitle && (
                  <Text style={{ color: colors.text.secondary, fontSize: 15, lineHeight: 22, marginTop: 10 }}>
                    {step.subtitle}
                  </Text>
                )}
              </View>
            )}

            <StepBody
              id={step.id}
              answers={answers}
              set={set}
              crafted={crafted}
              previewTargets={previewTargets}
            />

            {showError && error && (
              <Animated.Text
                entering={FadeIn}
                style={{ color: colors.state.danger, fontSize: 14, marginTop: 16 }}
                accessibilityLiveRegion="polite"
              >
                {error}
              </Animated.Text>
            )}
          </Animated.View>
        </ScrollView>

        {step.id !== 'crafting' && (
          <View style={{ padding: 20, gap: 12 }}>
            <Button onPress={step.id === 'reveal' ? () => router.push('/signin?mode=signup') : goNext}>
              {step.id === 'reveal' ? 'Save my plan' : step.optional ? 'Continue' : 'Next'}
            </Button>

            {step.optional && (
              <Pressable onPress={goNext} accessibilityRole="button">
                <Text style={{ color: colors.text.tertiary, fontSize: 14, textAlign: 'center' }}>
                  Skip this
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </SafeAreaView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

interface StepBodyProps {
  id: StepId;
  answers: OnboardingAnswers;
  set: <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) => void;
  crafted: number;
  previewTargets: ReturnType<typeof calculateTargets> | null;
}

function StepBody({ id, answers, set, crafted, previewTargets }: StepBodyProps) {
  switch (id) {
    case 'gender':
      return (
        <Options
          value={answers.gender}
          onChange={(v) => set('gender', v as OnboardingAnswers['gender'])}
          items={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
            { value: 'other', label: 'Other', hint: 'We use a neutral metabolic estimate' },
          ]}
        />
      );

    case 'goal':
      return (
        <Options
          value={answers.goal}
          onChange={(v) => {
            set('goal', v as OnboardingAnswers['goal']);
            if (v === 'maintain') set('goal_weight_kg', answers.current_weight_kg);
          }}
          items={[
            { value: 'lose', label: 'Lose weight', hint: 'Run a calorie deficit' },
            { value: 'maintain', label: 'Maintain weight', hint: 'Hold steady, eat better' },
            { value: 'gain', label: 'Gain weight', hint: 'Build size and strength' },
          ]}
        />
      );

    case 'date_of_birth':
      return (
        <TextInput
          value={answers.date_of_birth ?? ''}
          onChangeText={(text) => set('date_of_birth', text)}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.text.tertiary}
          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
          maxLength={10}
          style={{
            height: 64,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
            backgroundColor: 'rgba(255,255,255,0.04)',
            color: colors.text.primary,
            fontSize: 22,
            textAlign: 'center',
          }}
        />
      );

    case 'height':
      return (
        <Measure
          kind="height"
          value={answers.height_cm ?? 170}
          onChange={(v) => set('height_cm', v)}
          units={answers.units ?? 'metric'}
          onUnits={(u) => set('units', u)}
        />
      );

    case 'weight':
      return (
        <Measure
          kind="weight"
          value={answers.current_weight_kg ?? 70}
          onChange={(v) => set('current_weight_kg', v)}
          units={answers.units ?? 'metric'}
          onUnits={(u) => set('units', u)}
        />
      );

    case 'goal_weight':
      return (
        <Measure
          kind="weight"
          value={answers.goal_weight_kg ?? answers.current_weight_kg ?? 70}
          onChange={(v) => set('goal_weight_kg', v)}
          units={answers.units ?? 'metric'}
          onUnits={(u) => set('units', u)}
        />
      );

    case 'activity_level':
      return (
        <Options
          value={answers.activity_level}
          onChange={(v) => set('activity_level', v as OnboardingAnswers['activity_level'])}
          items={[
            { value: 'sedentary', label: 'Sedentary', hint: 'Little or no exercise, desk job' },
            { value: 'light', label: 'Lightly active', hint: '1–3 workouts per week' },
            { value: 'moderate', label: 'Moderately active', hint: '3–5 workouts per week' },
            { value: 'very_active', label: 'Very active', hint: '6–7 workouts per week' },
            { value: 'extreme', label: 'Extremely active', hint: 'Physical job or twice-daily training' },
          ]}
        />
      );

    case 'workouts_per_week':
      return (
        <Options
          value={answers.workouts_per_week}
          onChange={(v) => set('workouts_per_week', v as OnboardingAnswers['workouts_per_week'])}
          items={[
            { value: '0', label: '0' },
            { value: '1-3', label: '1–3' },
            { value: '4-6', label: '4–6' },
            { value: '7+', label: '7+' },
          ]}
        />
      );

    case 'rate': {
      const rates = answers.goal === 'lose' ? LOSS_RATES_KG_PER_WEEK : GAIN_RATES_KG_PER_WEEK;
      return (
        <Options
          value={answers.rate_kg_per_week ? String(answers.rate_kg_per_week) : undefined}
          onChange={(v) => set('rate_kg_per_week', Number(v))}
          items={rates.map((rate) => ({
            value: String(rate),
            label: `${rate} kg per week`,
            hint:
              rate <= 0.25
                ? 'Gentle — easiest to sustain'
                : rate <= 0.5
                  ? 'Steady — the usual recommendation'
                  : rate <= 0.75
                    ? 'Brisk — needs consistency'
                    : 'Aggressive — hard to hold',
          }))}
        />
      );
    }

    case 'target_date':
      return (
        <TextInput
          value={answers.target_date ?? ''}
          onChangeText={(text) => set('target_date', text || null)}
          placeholder="YYYY-MM-DD (optional)"
          placeholderTextColor={colors.text.tertiary}
          maxLength={10}
          style={{
            height: 64,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
            backgroundColor: 'rgba(255,255,255,0.04)',
            color: colors.text.primary,
            fontSize: 20,
            textAlign: 'center',
          }}
        />
      );

    case 'focus_area':
      return (
        <Options
          value={answers.focus_area}
          onChange={(v) => set('focus_area', v)}
          items={MAINTAIN_FOCUS_AREAS.map((a) => ({ value: a, label: a }))}
        />
      );

    case 'training_focus':
      return (
        <Options
          value={answers.training_focus}
          onChange={(v) => set('training_focus', v as OnboardingAnswers['training_focus'])}
          items={[
            { value: 'strength', label: 'Strength training', hint: 'Lifting weights regularly' },
            { value: 'athlete', label: 'Athlete', hint: 'Sport-specific training' },
            { value: 'general_fitness', label: 'General fitness', hint: 'Staying active' },
            { value: 'none', label: 'Not training right now' },
          ]}
        />
      );

    case 'dietary_preference':
      return (
        <Options
          value={answers.dietary_preference}
          onChange={(v) => set('dietary_preference', v as OnboardingAnswers['dietary_preference'])}
          items={[
            { value: 'classic', label: 'Classic', hint: 'No restrictions' },
            { value: 'vegetarian', label: 'Vegetarian' },
            { value: 'vegan', label: 'Vegan' },
            { value: 'pescatarian', label: 'Pescatarian' },
          ]}
        />
      );

    case 'allergies': {
      const selected = answers.allergies ?? [];
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {COMMON_ALLERGENS.map((allergen) => {
            const active = selected.includes(allergen);
            return (
              <Pressable
                key={allergen}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() =>
                  set(
                    'allergies',
                    active ? selected.filter((a) => a !== allergen) : [...selected, allergen],
                  )
                }
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 11,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? 'rgba(198,255,61,0.6)' : 'rgba(255,255,255,0.12)',
                  backgroundColor: active ? 'rgba(198,255,61,0.10)' : 'transparent',
                }}
              >
                <Text style={{ color: active ? colors.text.primary : colors.text.secondary, fontSize: 14 }}>
                  {allergen}
                </Text>
              </Pressable>
            );
          })}
        </View>
      );
    }

    case 'tried_other_apps':
      return (
        <Options
          value={
            answers.tried_other_apps === undefined ? undefined : answers.tried_other_apps ? 'yes' : 'no'
          }
          onChange={(v) => set('tried_other_apps', v === 'yes')}
          items={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No, this is my first' },
          ]}
        />
      );

    case 'referral_source':
      return (
        <Options
          value={answers.referral_source}
          onChange={(v) => set('referral_source', v)}
          items={REFERRAL_SOURCES.map((s) => ({ value: s, label: s }))}
        />
      );

    case 'how_it_works':
      return (
        <View style={{ gap: 12 }}>
          {[
            { title: 'Snap your meal', body: 'One photo, from any angle.' },
            { title: 'We read the plate', body: 'Every ingredient, with calories and macros.' },
            { title: 'Your rings fill up', body: 'Watch the day close out and the weeks add up.' },
          ].map((item, i) => (
            <Animated.View key={item.title} entering={FadeInRight.delay(i * 120)}>
              <Card style={{ padding: 18 }}>
                <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600' }}>
                  {item.title}
                </Text>
                <Text style={{ color: colors.text.secondary, fontSize: 14, marginTop: 4, lineHeight: 20 }}>
                  {item.body}
                </Text>
              </Card>
            </Animated.View>
          ))}
        </View>
      );

    case 'crafting':
      return (
        <View style={{ alignItems: 'center', gap: 32, paddingVertical: 40 }}>
          <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: '700' }}>
            Crafting your plan…
          </Text>

          <View style={{ gap: 14, width: '100%', maxWidth: 280 }}>
            {CRAFTING_STEPS.map((label, i) => {
              const done = i < crafted;
              return (
                <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: done ? colors.accent.lime : 'rgba(255,255,255,0.2)',
                      backgroundColor: done ? colors.accent.lime : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {done && (
                      <Text style={{ color: colors.base['900'], fontSize: 13, fontWeight: '900' }}>✓</Text>
                    )}
                  </View>
                  <Text
                    style={{
                      color: done ? colors.text.primary : colors.text.tertiary,
                      fontSize: 15,
                    }}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      );

    case 'reveal':
      if (!previewTargets) {
        return (
          <Text style={{ color: colors.text.secondary, textAlign: 'center' }}>
            Something is missing from your answers — step back and fill in the gaps.
          </Text>
        );
      }

      return (
        <View style={{ alignItems: 'center', gap: 28 }}>
          <ProgressRing
            ratio={1}
            size={220}
            strokeWidth={16}
            from={colors.accent.lime}
            to={colors.accent.cyan}
            gradientId="revealRing"
          >
            <View style={{ alignItems: 'center' }}>
              <AnimatedNumber
                value={previewTargets.calories}
                duration={1400}
                style={{ color: colors.text.primary, fontSize: 52, fontWeight: '700' }}
              />
              <Text
                style={{
                  color: colors.text.secondary,
                  fontSize: 12,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  marginTop: 4,
                }}
              >
                calories
              </Text>
            </View>
          </ProgressRing>

          <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
            {(
              [
                { key: 'protein', label: 'Protein', value: previewTargets.protein_g },
                { key: 'carbs', label: 'Carbs', value: previewTargets.carbs_g },
                { key: 'fat', label: 'Fat', value: previewTargets.fat_g },
              ] as const
            ).map((macro) => (
              <Card key={macro.key} style={{ flex: 1, padding: 14, alignItems: 'center' }}>
                <AnimatedNumber
                  value={macro.value}
                  suffix="g"
                  duration={1200}
                  style={{ color: macroGradients[macro.key].from, fontSize: 21, fontWeight: '700' }}
                />
                <Text style={{ color: colors.text.secondary, fontSize: 11, marginTop: 4, textTransform: 'uppercase' }}>
                  {macro.label}
                </Text>
              </Card>
            ))}
          </View>

          <Card style={{ padding: 16 }}>
            <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 20 }}>
              Built from your BMR of {Math.round(previewTargets.bmr)} kcal and an estimated daily
              burn of {Math.round(previewTargets.tdee)} kcal.
              {previewTargets.floorApplied &&
                ' We raised your target to the safe minimum — the pace you picked would have taken it lower than is healthy.'}
            </Text>
          </Card>
        </View>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------

function Options({
  items,
  value,
  onChange,
}: {
  items: ReadonlyArray<{ value: string; label: string; hint?: string }>;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ gap: 10 }}>
      {items.map((item, i) => {
        const selected = value === item.value;
        return (
          <Animated.View key={item.value} entering={FadeInRight.delay(i * 45).duration(260)}>
            <Pressable
              onPress={() => onChange(item.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 16,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: selected ? 'rgba(198,255,61,0.6)' : 'rgba(255,255,255,0.10)',
                backgroundColor: selected ? 'rgba(198,255,61,0.09)' : 'rgba(255,255,255,0.035)',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '500' }}>
                  {item.label}
                </Text>
                {item.hint && (
                  <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 2 }}>
                    {item.hint}
                  </Text>
                )}
              </View>

              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 1,
                  borderColor: selected ? colors.accent.lime : 'rgba(255,255,255,0.25)',
                  backgroundColor: selected ? colors.accent.lime : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {selected && (
                  <Text style={{ color: colors.base['900'], fontSize: 12, fontWeight: '900' }}>✓</Text>
                )}
              </View>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * Stepper-based measure picker. React Native has no range input, so this uses
 * large ± controls, which are easier to hit accurately on a phone than a
 * slider anyway.
 */
function Measure({
  kind,
  value,
  onChange,
  units,
  onUnits,
}: {
  kind: 'height' | 'weight';
  value: number;
  onChange: (metric: number) => void;
  units: 'metric' | 'imperial';
  onUnits: (u: 'metric' | 'imperial') => void;
}) {
  const imperial = units === 'imperial';
  const stepMetric = kind === 'height' ? 1 : 0.5;

  const display = () => {
    if (kind === 'height') {
      if (!imperial) return { main: String(Math.round(value)), sub: 'cm' };
      const { feet, inches } = cmToFeetInches(value);
      return { main: `${feet}′ ${inches}″`, sub: '' };
    }
    return imperial
      ? { main: kgToLb(value).toFixed(1), sub: 'lb' }
      : { main: value.toFixed(1), sub: 'kg' };
  };

  const { main, sub } = display();
  const bounds = kind === 'height' ? { min: 120, max: 220 } : { min: 35, max: 200 };

  const nudge = (direction: 1 | -1) => {
    const next = Math.min(bounds.max, Math.max(bounds.min, value + direction * stepMetric));
    onChange(Number(next.toFixed(2)));
  };

  return (
    <View style={{ alignItems: 'center', gap: 28 }}>
      <View
        style={{
          flexDirection: 'row',
          borderRadius: 999,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.12)',
          padding: 4,
        }}
      >
        {(['metric', 'imperial'] as const).map((unit) => (
          <Pressable
            key={unit}
            onPress={() => onUnits(unit)}
            accessibilityRole="button"
            accessibilityState={{ selected: units === unit }}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 7,
              borderRadius: 999,
              backgroundColor: units === unit ? colors.accent.lime : 'transparent',
            }}
          >
            <Text
              style={{
                color: units === unit ? colors.base['900'] : colors.text.secondary,
                fontSize: 14,
                fontWeight: '600',
                textTransform: 'capitalize',
              }}
            >
              {unit}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 26 }}>
        <Stepper label={`Decrease ${kind}`} onPress={() => nudge(-1)}>
          −
        </Stepper>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', minWidth: 150, justifyContent: 'center' }}>
          <Text style={{ color: colors.text.primary, fontSize: 52, fontWeight: '700' }}>{main}</Text>
          {sub ? (
            <Text style={{ color: colors.text.secondary, fontSize: 19, marginLeft: 6, marginBottom: 8 }}>
              {sub}
            </Text>
          ) : null}
        </View>

        <Stepper label={`Increase ${kind}`} onPress={() => nudge(1)}>
          +
        </Stepper>
      </View>
    </View>
  );
}

function Stepper({
  children,
  onPress,
  label,
}: {
  children: React.ReactNode;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 52,
        height: 52,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.text.primary, fontSize: 26, lineHeight: 30 }}>{children}</Text>
    </Pressable>
  );
}

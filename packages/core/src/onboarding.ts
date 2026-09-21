/**
 * The onboarding quiz, defined once. Plan section 1.
 *
 * Web and mobile render this list rather than each hard-coding their own step
 * order, so the two flows can never fall out of sync. The branch by goal
 * (lose / maintain / gain) is computed from the answers so far.
 */

import { DEFAULT_RATE_KG_PER_WEEK } from './constants.js';
import { ageInYears } from './calendar.js';
import type {
  ActivityLevel,
  DietaryPreference,
  Gender,
  Goal,
  TrainingFocus,
  Units,
  WorkoutsPerWeek,
} from './types.js';

export interface OnboardingAnswers {
  gender?: Gender;
  goal?: Goal;
  date_of_birth?: string;
  height_cm?: number;
  current_weight_kg?: number;
  activity_level?: ActivityLevel;
  workouts_per_week?: WorkoutsPerWeek;
  referral_source?: string;
  tried_other_apps?: boolean;
  dietary_preference?: DietaryPreference;
  allergies?: string[];
  units?: Units;

  // Goal-specific
  goal_weight_kg?: number;
  rate_kg_per_week?: number;
  target_date?: string | null;
  focus_area?: string;
  training_focus?: TrainingFocus;
}

export type StepId =
  | 'gender'
  | 'goal'
  | 'date_of_birth'
  | 'height'
  | 'weight'
  | 'activity_level'
  | 'workouts_per_week'
  | 'goal_weight'
  | 'rate'
  | 'target_date'
  | 'focus_area'
  | 'training_focus'
  | 'dietary_preference'
  | 'allergies'
  | 'referral_source'
  | 'tried_other_apps'
  | 'how_it_works'
  | 'crafting'
  | 'reveal';

export interface StepDefinition {
  id: StepId;
  title: string;
  subtitle?: string;
  /** Optional steps can be skipped without blocking the flow. */
  optional?: boolean;
  /** Informational screens carry no answer. */
  informational?: boolean;
}

const UNIVERSAL_STEPS: StepDefinition[] = [
  { id: 'gender', title: 'Which best describes you?', subtitle: 'This changes how we estimate your metabolism.' },
  { id: 'goal', title: "What's your goal?", subtitle: 'You can change this any time.' },
  { id: 'date_of_birth', title: 'When were you born?', subtitle: 'Age affects how many calories you burn at rest.' },
  { id: 'height', title: 'How tall are you?' },
  { id: 'weight', title: 'What do you weigh right now?', subtitle: 'Be honest — it only moves from here.' },
  { id: 'activity_level', title: 'How active are you day to day?', subtitle: 'Outside of deliberate workouts.' },
  { id: 'workouts_per_week', title: 'How many workouts per week?' },
];

const CLOSING_STEPS: StepDefinition[] = [
  { id: 'dietary_preference', title: 'Any dietary preference?', subtitle: 'We use this for food suggestions.', optional: true },
  { id: 'allergies', title: 'Anything you avoid?', subtitle: 'Allergies or foods you never eat.', optional: true },
  { id: 'tried_other_apps', title: 'Tried a calorie app before?', optional: true },
  { id: 'referral_source', title: 'Where did you hear about us?', optional: true },
  { id: 'how_it_works', title: 'Here’s how NutriSnap works', subtitle: 'Snap a photo. We do the rest.', informational: true },
  { id: 'crafting', title: 'Crafting your plan…', informational: true },
  { id: 'reveal', title: 'Your daily plan is ready', informational: true },
];

const BRANCH_STEPS: Record<Goal, StepDefinition[]> = {
  lose: [
    { id: 'goal_weight', title: "What's your goal weight?", subtitle: 'It should be below your current weight.' },
    { id: 'rate', title: 'How fast do you want to lose?', subtitle: 'Steadier is easier to stick to.' },
    { id: 'target_date', title: 'Working toward a date?', subtitle: 'An event, a trip — optional.', optional: true },
  ],
  maintain: [
    { id: 'goal_weight', title: 'Confirm your maintenance weight', subtitle: "We'll hold you here." },
    { id: 'focus_area', title: "What matters most to you?" },
  ],
  gain: [
    { id: 'goal_weight', title: "What's your goal weight?", subtitle: 'It should be above your current weight.' },
    { id: 'rate', title: 'How fast do you want to gain?', subtitle: 'Slower means less fat gained along the way.' },
    { id: 'training_focus', title: 'How are you training?', subtitle: 'Lifters need more protein.' },
  ],
};

export const MAINTAIN_FOCUS_AREAS = [
  'General health',
  'Improve energy',
  'Build better habits',
  'Track macros precisely',
] as const;

export const REFERRAL_SOURCES = ['App Store', 'TikTok', 'Instagram', 'YouTube', 'A friend', 'Other'] as const;

export const COMMON_ALLERGENS = [
  'Gluten',
  'Dairy',
  'Peanuts',
  'Tree nuts',
  'Shellfish',
  'Eggs',
  'Soy',
  'Sesame',
] as const;

/** The full ordered step list for the answers given so far. */
export function stepsFor(answers: OnboardingAnswers): StepDefinition[] {
  const branch = answers.goal ? BRANCH_STEPS[answers.goal] : [];
  return [...UNIVERSAL_STEPS, ...branch, ...CLOSING_STEPS];
}

/**
 * Whether the user may advance past a step. Returns an error message when not,
 * which the UI shows inline under the control.
 */
export function validateStep(id: StepId, answers: OnboardingAnswers): string | null {
  switch (id) {
    case 'gender':
      return answers.gender ? null : 'Pick one to continue.';
    case 'goal':
      return answers.goal ? null : 'Pick a goal to continue.';
    case 'date_of_birth': {
      if (!answers.date_of_birth) return 'Enter your date of birth.';
      const dob = new Date(answers.date_of_birth);
      if (Number.isNaN(dob.getTime())) return "That date doesn't look right.";
      const age = ageInYears(dob);
      if (age < 0 || age > 120) return "That date doesn't look right.";
      if (age < 13) return 'NutriSnap is for ages 13 and up.';
      return null;
    }
    case 'height':
      return answers.height_cm && answers.height_cm >= 80 && answers.height_cm <= 260
        ? null
        : 'Enter a height between 80 and 260 cm.';
    case 'weight':
      return answers.current_weight_kg &&
        answers.current_weight_kg >= 25 &&
        answers.current_weight_kg <= 400
        ? null
        : 'Enter a weight between 25 and 400 kg.';
    case 'activity_level':
      return answers.activity_level ? null : 'Pick your activity level.';
    case 'workouts_per_week':
      return answers.workouts_per_week ? null : 'Pick an option.';
    case 'goal_weight': {
      const { goal_weight_kg: target, current_weight_kg: current, goal } = answers;
      if (!target) return 'Set a goal weight.';
      if (goal === 'lose' && current && target >= current) {
        return 'Your goal weight should be below your current weight.';
      }
      if (goal === 'gain' && current && target <= current) {
        return 'Your goal weight should be above your current weight.';
      }
      return null;
    }
    case 'rate':
      return answers.rate_kg_per_week && answers.rate_kg_per_week > 0 ? null : 'Pick a pace.';
    case 'focus_area':
      return answers.focus_area ? null : 'Pick what matters most.';
    case 'training_focus':
      return answers.training_focus ? null : 'Pick one.';
    default:
      return null; // optional and informational steps never block
  }
}

/** Every required step answered? Drives the "can we compute targets yet" check. */
export function isOnboardingComplete(answers: OnboardingAnswers): boolean {
  return stepsFor(answers)
    .filter((s) => !s.optional && !s.informational)
    .every((s) => validateStep(s.id, answers) === null);
}

/** 0..1 progress for the bar at the top of the quiz. */
export function onboardingProgress(answers: OnboardingAnswers, currentIndex: number): number {
  const total = stepsFor(answers).length;
  return total > 0 ? Math.min(1, Math.max(0, currentIndex / (total - 1))) : 0;
}

/** Normalise raw answers into the column shape `profiles` expects. */
export function answersToProfilePatch(answers: OnboardingAnswers): Record<string, unknown> {
  const goal = answers.goal;
  return {
    gender: answers.gender ?? null,
    goal: goal ?? null,
    date_of_birth: answers.date_of_birth ?? null,
    height_cm: answers.height_cm ?? null,
    current_weight_kg: answers.current_weight_kg ?? null,
    goal_weight_kg:
      goal === 'maintain'
        ? (answers.current_weight_kg ?? null)
        : (answers.goal_weight_kg ?? null),
    rate_kg_per_week:
      goal === 'maintain' ? 0 : (answers.rate_kg_per_week ?? DEFAULT_RATE_KG_PER_WEEK),
    target_date: answers.target_date ?? null,
    activity_level: answers.activity_level ?? null,
    workouts_per_week: answers.workouts_per_week ?? null,
    training_focus: answers.training_focus ?? null,
    focus_area: answers.focus_area ?? null,
    dietary_preference: answers.dietary_preference ?? null,
    allergies: answers.allergies ?? [],
    units: answers.units ?? 'metric',
    referral_source: answers.referral_source ?? null,
    tried_other_apps: answers.tried_other_apps ?? null,
    onboarding_completed: true,
  };
}

/** Checklist shown by the "Crafting your plan…" loader. */
export const CRAFTING_STEPS = [
  'Calculating your BMR',
  'Applying your activity level',
  'Setting your macro split',
  'Personalizing your plan',
] as const;

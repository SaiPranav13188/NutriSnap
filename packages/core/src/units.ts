/**
 * Unit conversion + display formatting. The database always stores metric
 * (kg, cm); `units` on the profile only controls how values are shown and how
 * the onboarding sliders are labelled.
 */

const KG_PER_LB = 0.45359237;
const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;

export const lbToKg = (lb: number): number => lb * KG_PER_LB;
export const kgToLb = (kg: number): number => kg / KG_PER_LB;

export const inchesToCm = (inches: number): number => inches * CM_PER_INCH;
export const cmToInches = (cm: number): number => cm / CM_PER_INCH;

export function feetInchesToCm(feet: number, inches: number): number {
  return inchesToCm(feet * INCHES_PER_FOOT + inches);
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cmToInches(cm));
  return {
    feet: Math.floor(totalInches / INCHES_PER_FOOT),
    inches: totalInches % INCHES_PER_FOOT,
  };
}

export function formatWeight(kg: number, units: 'metric' | 'imperial'): string {
  return units === 'metric' ? `${kg.toFixed(1)} kg` : `${kgToLb(kg).toFixed(1)} lb`;
}

export function formatHeight(cm: number, units: 'metric' | 'imperial'): string {
  if (units === 'metric') return `${Math.round(cm)} cm`;
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet}′ ${inches}″`;
}

/** 1250 -> "1,250". Used everywhere a calorie number is displayed. */
export function formatNumber(value: number, fractionDigits = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatGrams(grams: number): string {
  return `${Math.round(grams)}g`;
}

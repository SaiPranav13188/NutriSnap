'use client';

import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg } from '@nutrisnap/core';
import { cn } from '@/lib/cn';

type Kind = 'height' | 'weight';

interface MeasurePickerProps {
  kind: Kind;
  /** Always metric — cm for height, kg for weight. Imperial is display only. */
  value: number;
  onChange: (metricValue: number) => void;
  units: 'metric' | 'imperial';
  onUnitsChange: (units: 'metric' | 'imperial') => void;
}

const RANGES = {
  height: { min: 120, max: 220, step: 1 },
  weight: { min: 35, max: 200, step: 0.5 },
} as const;

/**
 * Slider picker with a metric/imperial toggle, as the plan specifies for
 * height and weight. The stored value never leaves metric — switching units
 * changes the label and the step, not the underlying number.
 */
export function MeasurePicker({
  kind,
  value,
  onChange,
  units,
  onUnitsChange,
}: MeasurePickerProps) {
  const range = RANGES[kind];
  const isImperial = units === 'imperial';

  const display = (): { main: string; sub: string } => {
    if (kind === 'height') {
      const { feet, inches } = cmToFeetInches(value);
      return isImperial
        ? { main: `${feet}′ ${inches}″`, sub: `${Math.round(value)} cm` }
        : { main: `${Math.round(value)}`, sub: 'cm' };
    }
    return isImperial
      ? { main: kgToLb(value).toFixed(1), sub: 'lb' }
      : { main: value.toFixed(1), sub: 'kg' };
  };

  const { main, sub } = display();
  const percent = ((value - range.min) / (range.max - range.min)) * 100;

  // Sliding in imperial should move in whole pounds / inches, not fractions
  // of a kilogram, or the control feels wrong under the hand.
  const sliderProps = isImperial
    ? kind === 'height'
      ? {
          min: Math.round(range.min / 2.54),
          max: Math.round(range.max / 2.54),
          step: 1,
          value: Math.round(value / 2.54),
          onChange: (raw: number) => onChange(feetInchesToCm(0, raw)),
        }
      : {
          min: Math.round(kgToLb(range.min)),
          max: Math.round(kgToLb(range.max)),
          step: 1,
          value: Math.round(kgToLb(value)),
          onChange: (raw: number) => onChange(Number(lbToKg(raw).toFixed(2))),
        }
    : {
        min: range.min,
        max: range.max,
        step: range.step,
        value,
        onChange: (raw: number) => onChange(raw),
      };

  return (
    <div className="flex flex-col items-center gap-7">
      <div className="inline-flex rounded-full border border-glass-border p-1">
        {(['metric', 'imperial'] as const).map((unit) => (
          <button suppressHydrationWarning
            key={unit}
            type="button"
            onClick={() => onUnitsChange(unit)}
            className={cn(
              'rounded-full px-5 py-1.5 text-sm font-medium capitalize transition-colors',
              units === unit ? 'bg-accent text-base-900' : 'text-ink-secondary hover:text-ink-primary',
            )}
          >
            {unit}
          </button>
        ))}
      </div>

      <div className="text-center">
        <span className="tnum text-6xl font-semibold leading-none tracking-tight">{main}</span>
        <span className="ml-2 text-xl text-ink-secondary">{sub}</span>
      </div>

      <div className="w-full px-1">
        <input suppressHydrationWarning
          type="range"
          min={sliderProps.min}
          max={sliderProps.max}
          step={sliderProps.step}
          value={sliderProps.value}
          onChange={(e) => sliderProps.onChange(Number(e.target.value))}
          aria-label={kind === 'height' ? 'Height' : 'Weight'}
          className="h-2 w-full cursor-pointer appearance-none rounded-full outline-none
            [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:active:scale-110
            [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:border-0
            [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white"
          style={{
            background: `linear-gradient(to right, #C6FF3D 0%, #3DE8FF ${percent}%, rgba(255,255,255,0.09) ${percent}%, rgba(255,255,255,0.09) 100%)`,
          }}
        />
      </div>
    </div>
  );
}

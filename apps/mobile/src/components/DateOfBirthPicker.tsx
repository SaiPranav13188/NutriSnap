import { useEffect, useMemo } from 'react';
import {
  MONTH_NAMES,
  birthYearRange,
  buildDateKey,
  daysInMonth,
  defaultBirthDateKey,
  splitDateKey,
} from '@nutrisnap/core';
import { WheelColumn, WheelGroup, type WheelItem } from './WheelPicker';

/**
 * Month / day / year wheels for the birth-date step.
 *
 * It replaces a YYYY-MM-DD text field, which asked the user to know the format
 * and let them type 31 February. Wheels can only produce dates that exist: the
 * day column is rebuilt from the chosen month and year, so February offers 28
 * rows, or 29 in a leap year.
 */

interface DateOfBirthPickerProps {
  /** YYYY-MM-DD, or undefined before the user has reached this step. */
  value: string | undefined;
  onChange: (value: string) => void;
}

export function DateOfBirthPicker({ value, onChange }: DateOfBirthPickerProps) {
  const fallback = useMemo(() => defaultBirthDateKey(), []);
  const parts = splitDateKey(value ?? '') ?? splitDateKey(fallback)!;

  // A wheel always shows a selection, so an unanswered step would look
  // answered while storing nothing. Commit what is on screen instead.
  useEffect(() => {
    if (!splitDateKey(value ?? '')) onChange(fallback);
  }, [value, fallback, onChange]);

  const years = useMemo(() => {
    const { min, max } = birthYearRange();
    const items: WheelItem[] = [];
    for (let year = min; year <= max; year++) {
      items.push({ value: String(year), label: String(year) });
    }
    return items;
  }, []);

  const months = useMemo<WheelItem[]>(
    () => MONTH_NAMES.map((name, i) => ({ value: String(i + 1), label: name })),
    [],
  );

  const days = useMemo<WheelItem[]>(() => {
    const count = daysInMonth(parts.year, parts.month);
    return Array.from({ length: count }, (_, i) => ({
      value: String(i + 1),
      label: String(i + 1).padStart(2, '0'),
    }));
  }, [parts.year, parts.month]);

  // buildDateKey clamps, so moving to a shorter month pulls 31 back to 28
  // rather than producing a date that does not exist.
  const update = (next: Partial<typeof parts>) => onChange(buildDateKey({ ...parts, ...next }));

  return (
    <WheelGroup>
      <WheelColumn
        flex={1.4}
        items={months}
        value={String(parts.month)}
        onChange={(v) => update({ month: Number(v) })}
        accessibilityLabel="Birth month"
      />
      <WheelColumn
        items={days}
        value={String(parts.day)}
        onChange={(v) => update({ day: Number(v) })}
        accessibilityLabel="Day of birth month"
      />
      <WheelColumn
        items={years}
        value={String(parts.year)}
        onChange={(v) => update({ year: Number(v) })}
        accessibilityLabel="Birth year"
      />
    </WheelGroup>
  );
}

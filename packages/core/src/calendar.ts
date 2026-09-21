/**
 * The scrolling date strip on the dashboard.
 *
 * Shared so web and mobile show the same range and agree on what "today"
 * means. Dates are plain YYYY-MM-DD strings, which is what the API takes and
 * what avoids timezone drift when a Date is serialised.
 */

export interface StripDay {
  /** YYYY-MM-DD */
  date: string;
  /** Single letter for the weekday header, Sunday-first. */
  weekdayLetter: string;
  dayOfMonth: number;
  isToday: boolean;
  /** Future days cannot be logged against. */
  isFuture: boolean;
  /** First day of its month — used to render a month divider. */
  isMonthStart: boolean;
  monthLabel: string;
}

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Local YYYY-MM-DD. Deliberately not toISOString, which shifts to UTC. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

/** Parse a YYYY-MM-DD key as a local date, avoiding UTC interpretation. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * Build the strip: `daysBack` days of history up to today, plus `daysForward`
 * days ahead so the strip does not end abruptly at the right edge.
 *
 * Returned oldest → newest, so the natural scroll position is the far right.
 */
export function buildDateStrip(options: {
  daysBack?: number;
  daysForward?: number;
  now?: Date;
} = {}): StripDay[] {
  const { daysBack = 90, daysForward = 3, now = new Date() } = options;
  const today = todayKey(now);
  const days: StripDay[] = [];

  for (let offset = -daysBack; offset <= daysForward; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const key = toDateKey(d);

    days.push({
      date: key,
      weekdayLetter: WEEKDAY_LETTERS[d.getDay()] ?? '',
      dayOfMonth: d.getDate(),
      isToday: key === today,
      isFuture: key > today,
      isMonthStart: d.getDate() === 1,
      monthLabel: MONTHS[d.getMonth()] ?? '',
    });
  }

  return days;
}

/** Index of a date within a strip, or the last entry if it is not present. */
export function indexOfDate(strip: StripDay[], date: string): number {
  const found = strip.findIndex((d) => d.date === date);
  return found >= 0 ? found : strip.length - 1;
}

/** "Today", "Yesterday", or a written date — the dashboard heading. */
export function describeDate(key: string, now: Date = new Date()): string {
  const today = todayKey(now);
  if (key === today) return 'Today';

  const yesterday = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (key === yesterday) return 'Yesterday';

  const d = fromDateKey(key);
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

// ---------------------------------------------------------------------------
// Date-of-birth wheels
//
// The onboarding quiz picks a birth date on three spinning columns rather than
// in a text field, so it needs month names, a correct day count per month and
// a way to reassemble the three numbers into the YYYY-MM-DD string the API
// stores. The clamping matters: spin from 31 March to February and the day
// column shortens underneath the selection.
// ---------------------------------------------------------------------------

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface DateParts {
  year: number;
  /** 1-indexed, so it lines up with the YYYY-MM-DD string. */
  month: number;
  day: number;
}

/** Length of a month, leap years included. Month is 1-indexed. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Split YYYY-MM-DD, or null if it is not a real calendar date. */
export function splitDateKey(key: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return { year, month, day };
}

/** Reassemble parts into YYYY-MM-DD, clamping the day into the month. */
export function buildDateKey({ year, month, day }: DateParts): string {
  const safeMonth = Math.min(12, Math.max(1, Math.round(month)));
  const safeDay = Math.min(daysInMonth(year, safeMonth), Math.max(1, Math.round(day)));
  return `${year}-${String(safeMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

/**
 * Selectable birth years — the 13-to-120 age window `validateStep` accepts.
 * Offering years the next screen would reject is worse than not offering them.
 */
export function birthYearRange(now: Date = new Date()): { min: number; max: number } {
  const year = now.getFullYear();
  return { min: year - 120, max: year - 13 };
}

/**
 * Where the wheels start when the user has not answered yet.
 *
 * A wheel always displays something, so the quiz commits this on mount to keep
 * the visible selection and the stored answer in step.
 */
export function defaultBirthDateKey(now: Date = new Date()): string {
  return buildDateKey({ year: now.getFullYear() - 25, month: 1, day: 1 });
}

/**
 * Whole years lived, counted on the calendar.
 *
 * Dividing elapsed milliseconds by 365.25 days looks equivalent and is not:
 * it puts someone born exactly thirteen years ago today at 12.999 years old,
 * which is enough to fail an `age >= 13` gate on their own birthday.
 */
export function ageInYears(dob: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthdayThisYear =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}

/** Helpers for the minutes-from-midnight representation used everywhere. */

export const MINUTES_PER_DAY = 24 * 60;

const pad = (value: number) => String(value).padStart(2, '0');

/** 13 * 60 -> "13:00" */
export function minutesToLabel(minutes: number): string {
  const safe = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
}

/** 13 * 60 -> "1:00 PM" */
export function minutesToLabel12h(minutes: number): string {
  const safe = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours24 = Math.floor(safe / 60);
  const suffix = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${pad(safe % 60)} ${suffix}`;
}

/** Parses "13:00", "1:5", "0900" — returns null when it is not a valid time. */
export function labelToMinutes(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const match = /^(\d{1,2})[:.\s]?(\d{1,2})?$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

// --------------------------------------------------------------- weekdays
// A day set is a 7-bit mask, so bitwise operators are the point here rather
// than a lint slip.
/* eslint-disable no-bitwise */

/**
 * Day bits: bit 0 is Sunday through bit 6 is Saturday, matching JavaScript's
 * `Date.getDay()` and Android's `Calendar.DAY_OF_WEEK - 1`.
 */
export const ALL_DAYS = 0b111_1111;
export const WEEKDAYS = 0b011_1110; // Mon–Fri
export const WEEKEND = 0b100_0001; // Sat + Sun

export const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function runsOn(daysMask: number, dayIndex: number): boolean {
  return ((daysMask >> dayIndex) & 1) === 1;
}

export function toggleDay(daysMask: number, dayIndex: number): number {
  return (daysMask ^ (1 << dayIndex)) & ALL_DAYS;
}

export function dayCount(daysMask: number): number {
  let count = 0;
  for (let day = 0; day < 7; day++) {
    if (runsOn(daysMask, day)) {
      count++;
    }
  }
  return count;
}

/** "Every day", "Weekdays", "Mon, Wed, Fri" — short enough for a slot row. */
export function daysLabel(daysMask: number): string {
  const mask = daysMask & ALL_DAYS;
  if (mask === ALL_DAYS) {
    return 'Every day';
  }
  if (mask === WEEKDAYS) {
    return 'Weekdays';
  }
  if (mask === WEEKEND) {
    return 'Weekends';
  }
  if (mask === 0) {
    return 'No days';
  }
  const names: string[] = [];
  for (let day = 0; day < 7; day++) {
    if (runsOn(mask, day)) {
      names.push(DAY_NAMES[day]);
    }
  }
  return names.join(', ');
}

/** True when `minutes` falls in the slot, wrapping past midnight if needed. */
export function isActiveAt(
  startMinutes: number,
  endMinutes: number,
  minutes: number,
): boolean {
  return startMinutes <= endMinutes
    ? minutes >= startMinutes && minutes < endMinutes
    : minutes >= startMinutes || minutes < endMinutes;
}

/**
 * Day-aware variant. A slot belongs to the day it starts on, so the
 * after-midnight half of an overnight slot is tested against the day before.
 */
export function isActiveOn(
  startMinutes: number,
  endMinutes: number,
  daysMask: number,
  minutes: number,
  dayIndex: number,
): boolean {
  const previousDay = (dayIndex + 6) % 7;
  if (startMinutes <= endMinutes) {
    return (
      runsOn(daysMask, dayIndex) &&
      minutes >= startMinutes &&
      minutes < endMinutes
    );
  }
  return (
    (runsOn(daysMask, dayIndex) && minutes >= startMinutes) ||
    (runsOn(daysMask, previousDay) && minutes < endMinutes)
  );
}

export function today(): number {
  return new Date().getDay();
}

export function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function formatClock(timestamp: number | null): string {
  if (!timestamp) {
    return '—';
  }
  const date = new Date(timestamp);
  const time = minutesToLabel12h(date.getHours() * 60 + date.getMinutes());

  // Compare calendar days, not elapsed hours, so "tomorrow" still reads
  // correctly for a boundary that is only a few hours away across midnight.
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const daysAway = Math.round(
    (startOfDay(date) - startOfDay(new Date())) / 86_400_000,
  );

  if (daysAway <= 0) {
    return `today at ${time}`;
  }
  if (daysAway === 1) {
    return `tomorrow at ${time}`;
  }
  // Day schedules can push the next change up to a week out.
  return `${DAY_NAMES[date.getDay()]} at ${time}`;
}

// ------------------------------------------------------- next occurrence

/**
 * When this slot next starts, as a timestamp, or null if its day set is
 * empty. Walks the coming week rather than assuming today or tomorrow,
 * because a weekend-only slot seen on Monday is five days out.
 */
export function nextStartAt(
  startMinutes: number,
  daysMask: number,
  from: Date = new Date(),
): number | null {
  if ((daysMask & ALL_DAYS) === 0) {
    return null;
  }
  const midnight = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
  ).getTime();

  // Eight days, so a slot that runs only today is still found a week out
  // once today's occurrence has passed.
  for (let offset = 0; offset <= 7; offset++) {
    const dayIndex = (from.getDay() + offset) % 7;
    if (!runsOn(daysMask, dayIndex)) {
      continue;
    }
    const candidate = midnight + offset * 86_400_000 + startMinutes * 60_000;
    if (candidate > from.getTime()) {
      return candidate;
    }
  }
  return null;
}

/**
 * A rounded, human gap: "in 4 minutes", "in 2 hours 5 minutes", "in 3 days".
 * Seconds are never shown — nobody needs that precision here, and it would
 * be stale the moment it is read.
 */
export function formatGap(fromNow: number): string {
  const minutes = Math.round(fromNow / 60_000);
  if (minutes < 1) {
    return 'in under a minute';
  }
  if (minutes < 60) {
    return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) {
    const hourPart = `${hours} hour${hours === 1 ? '' : 's'}`;
    return rest === 0
      ? `in ${hourPart}`
      : `in ${hourPart} ${rest} minute${rest === 1 ? '' : 's'}`;
  }
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

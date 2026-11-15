import {
  ALL_DAYS,
  WEEKDAYS,
  WEEKEND,
  dayCount,
  daysLabel,
  formatGap,
  isActiveAt,
  isActiveOn,
  labelToMinutes,
  minutesToLabel,
  minutesToLabel12h,
  nextStartAt,
  runsOn,
  toggleDay,
} from '../src/time';

describe('labelToMinutes', () => {
  it('parses common time shapes', () => {
    expect(labelToMinutes('13:00')).toBe(13 * 60);
    expect(labelToMinutes('1:05')).toBe(65);
    expect(labelToMinutes('9')).toBe(9 * 60);
    expect(labelToMinutes(' 23:59 ')).toBe(23 * 60 + 59);
  });

  it('rejects out-of-range and malformed input', () => {
    expect(labelToMinutes('24:00')).toBeNull();
    expect(labelToMinutes('12:60')).toBeNull();
    expect(labelToMinutes('abc')).toBeNull();
    expect(labelToMinutes('')).toBeNull();
  });
});

describe('formatting', () => {
  it('renders 24-hour and 12-hour labels', () => {
    expect(minutesToLabel(13 * 60)).toBe('13:00');
    expect(minutesToLabel12h(13 * 60)).toBe('1:00 PM');
    expect(minutesToLabel12h(0)).toBe('12:00 AM');
    expect(minutesToLabel12h(12 * 60)).toBe('12:00 PM');
  });
});

describe('isActiveAt', () => {
  const start = 13 * 60;
  const end = 15 * 60;

  it('includes the start minute and excludes the end minute', () => {
    expect(isActiveAt(start, end, start)).toBe(true);
    expect(isActiveAt(start, end, end - 1)).toBe(true);
    expect(isActiveAt(start, end, end)).toBe(false);
    expect(isActiveAt(start, end, start - 1)).toBe(false);
  });

  it('wraps past midnight', () => {
    const night = {start: 22 * 60, end: 6 * 60};
    expect(isActiveAt(night.start, night.end, 23 * 60)).toBe(true);
    expect(isActiveAt(night.start, night.end, 2 * 60)).toBe(true);
    expect(isActiveAt(night.start, night.end, 12 * 60)).toBe(false);
  });

  it('leaves adjacent slots non-overlapping', () => {
    // 13:00-15:00 and 15:00-18:00 must never both be active.
    const atBoundary = 15 * 60;
    expect(isActiveAt(13 * 60, 15 * 60, atBoundary)).toBe(false);
    expect(isActiveAt(15 * 60, 18 * 60, atBoundary)).toBe(true);
  });
});

describe('day masks', () => {
  const MON = 1;
  const SAT = 6;
  const SUN = 0;

  it('reads and toggles individual days', () => {
    expect(runsOn(ALL_DAYS, MON)).toBe(true);
    expect(runsOn(WEEKDAYS, SAT)).toBe(false);
    expect(runsOn(WEEKEND, SUN)).toBe(true);

    const onlyMonday = toggleDay(0, MON);
    expect(runsOn(onlyMonday, MON)).toBe(true);
    expect(dayCount(onlyMonday)).toBe(1);
    expect(dayCount(toggleDay(onlyMonday, MON))).toBe(0);
  });

  it('names the common presets', () => {
    expect(daysLabel(ALL_DAYS)).toBe('Every day');
    expect(daysLabel(WEEKDAYS)).toBe('Weekdays');
    expect(daysLabel(WEEKEND)).toBe('Weekends');
    expect(daysLabel(0)).toBe('No days');
    expect(daysLabel(toggleDay(toggleDay(0, MON), SAT))).toBe('Mon, Sat');
  });
});

describe('isActiveOn', () => {
  const MON = 1;
  const TUE = 2;
  const SAT = 6;

  it('only fires on the days the slot runs', () => {
    const mondayOnly = 1 << MON;
    expect(isActiveOn(13 * 60, 15 * 60, mondayOnly, 14 * 60, MON)).toBe(true);
    expect(isActiveOn(13 * 60, 15 * 60, mondayOnly, 14 * 60, TUE)).toBe(false);
    expect(isActiveOn(13 * 60, 15 * 60, ALL_DAYS, 14 * 60, SAT)).toBe(true);
  });

  it('carries an overnight slot into the next morning', () => {
    const mondayOnly = 1 << MON;
    // Monday 22:00 -> Tuesday 06:00
    expect(isActiveOn(22 * 60, 6 * 60, mondayOnly, 23 * 60, MON)).toBe(true);
    expect(isActiveOn(22 * 60, 6 * 60, mondayOnly, 2 * 60, TUE)).toBe(true);
    // Monday morning is NOT covered: that would belong to a Sunday slot.
    expect(isActiveOn(22 * 60, 6 * 60, mondayOnly, 2 * 60, MON)).toBe(false);
    // And the slot is over once the end time passes.
    expect(isActiveOn(22 * 60, 6 * 60, mondayOnly, 7 * 60, TUE)).toBe(false);
  });
});

describe('formatGap', () => {
  it('rounds to units a person would say out loud', () => {
    expect(formatGap(20 * 1000)).toBe('in under a minute');
    expect(formatGap(60 * 1000)).toBe('in 1 minute');
    expect(formatGap(4 * 60 * 1000)).toBe('in 4 minutes');
    expect(formatGap(60 * 60 * 1000)).toBe('in 1 hour');
    expect(formatGap((2 * 60 + 5) * 60 * 1000)).toBe('in 2 hours 5 minutes');
    expect(formatGap(3 * 24 * 60 * 60 * 1000)).toBe('in 3 days');
  });
});

describe('nextStartAt', () => {
  // A Wednesday, 10:00.
  const wednesday = new Date(2026, 10, 18, 10, 0, 0, 0);
  const WED = 3;
  const SAT = 6;

  it('finds later today when the slot still starts today', () => {
    const at = nextStartAt(13 * 60, ALL_DAYS, wednesday);
    expect(new Date(at!).getDate()).toBe(18);
    expect(new Date(at!).getHours()).toBe(13);
  });

  it('rolls to tomorrow once today has passed', () => {
    const at = nextStartAt(9 * 60, ALL_DAYS, wednesday);
    expect(new Date(at!).getDate()).toBe(19);
  });

  it('skips days the slot does not run on', () => {
    const saturdayOnly = 1 << SAT;
    const at = nextStartAt(9 * 60, saturdayOnly, wednesday);
    // Wednesday the 18th to Saturday the 21st.
    expect(new Date(at!).getDate()).toBe(21);
  });

  it('comes back a week later for a passed, single-day slot', () => {
    const wednesdayOnly = 1 << WED;
    const at = nextStartAt(9 * 60, wednesdayOnly, wednesday);
    expect(new Date(at!).getDate()).toBe(25);
  });

  it('has no answer when no day is selected', () => {
    expect(nextStartAt(9 * 60, 0, wednesday)).toBeNull();
  });
});

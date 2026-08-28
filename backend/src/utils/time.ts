/**
 * Timezone-aware calendar-day helpers.
 *
 * "Today", the weekly bars, the daily recap and the owner's per-outlet report
 * all bucket sales by *calendar day*. Doing that in the server's own local time
 * is wrong the moment the server runs in UTC (it does, in the prod container):
 * an Indonesian shop's sales between 00:00 and 07:00 WIB would land on the
 * previous day. These helpers bucket by a real IANA timezone instead — per
 * outlet where we have one, falling back to WIB.
 *
 * Indonesia observes no DST and all three zones are fixed offsets, so the
 * offset never shifts within a day; the offset is still recomputed at each
 * candidate boundary so the math stays correct if a DST zone is ever stored.
 */

/** Western Indonesia Time (UTC+7) — the fallback when an outlet has no `timezone`. */
export const DEFAULT_TIMEZONE = "Asia/Jakarta";

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
}

/** The wall-clock reading in `timeZone` at the instant `at`. */
function wallClockInTz(at: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24, // some engines emit "24" for midnight under h23
    minute: get("minute"),
    second: get("second"),
  };
}

/** `timeZone`'s offset from UTC at instant `at`, in milliseconds (WIB → +7h). */
export function tzOffsetMs(at: Date, timeZone: string): number {
  const w = wallClockInTz(at, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  // `asUtc` is the wall clock read as if it were UTC; the gap to the real
  // instant (floored to the second, since formatToParts has no ms) is the offset.
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** `"YYYY-MM-DD"` for the calendar day of instant `at` in `timeZone`. */
export function localDateKey(at: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Hour-of-day (0-23) for instant `at` in `timeZone` — for hour-of-day bucketing. */
export function hourInTz(at: Date, timeZone: string = DEFAULT_TIMEZONE): number {
  return wallClockInTz(at, timeZone).hour;
}

/** The UTC instant of local midnight starting the day `dateKey` (`"YYYY-MM-DD"`) in `timeZone`. */
function localMidnightUtc(dateKey: string, timeZone: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const naiveUtc = Date.UTC(y, m - 1, d);
  // First approximation using the offset at the naive instant, then one
  // refinement using the offset at the candidate midnight itself (handles the
  // rare case where the offset differs across the boundary, e.g. a DST zone).
  let guess = new Date(naiveUtc - tzOffsetMs(new Date(naiveUtc), timeZone));
  guess = new Date(naiveUtc - tzOffsetMs(guess, timeZone));
  return guess;
}

/** Add `n` days to a `"YYYY-MM-DD"` key, staying in `"YYYY-MM-DD"`. */
function addDaysToKey(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** `[start, end)` UTC instants spanning the local calendar day `dateKey` in `timeZone`. */
export function dayBoundsForKey(dateKey: string, timeZone: string = DEFAULT_TIMEZONE): { start: Date; end: Date } {
  return {
    start: localMidnightUtc(dateKey, timeZone),
    end: localMidnightUtc(addDaysToKey(dateKey, 1), timeZone),
  };
}

/** `[start, end)` UTC instants spanning the local calendar day that contains instant `at`. */
export function dayBoundsInTz(at: Date, timeZone: string = DEFAULT_TIMEZONE): { start: Date; end: Date } {
  return dayBoundsForKey(localDateKey(at, timeZone), timeZone);
}

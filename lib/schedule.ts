/**
 * Timezone maths for the campaign scheduler.
 *
 * Everything is stored as an absolute UTC epoch (seconds); the row's IANA
 * `timezone` is kept only so a recurring send can be re-anchored to the same
 * *wall-clock* time on its next occurrence. Adding a fixed 86,400 seconds would
 * silently shift a 9am send to 8am or 10am across a DST boundary, so recurrence
 * goes back through the local calendar instead.
 */

export type RepeatEvery = "daily" | "weekly" | "monthly";

export const REPEAT_OPTIONS: RepeatEvery[] = ["daily", "weekly", "monthly"];

export function isRepeatEvery(v: unknown): v is RepeatEvery {
  return typeof v === "string" && (REPEAT_OPTIONS as string[]).includes(v);
}

/**
 * Minimum whole days between occurrences of each cadence (28 for monthly — the
 * shortest possible month). A recurring send re-targets its whole list from
 * scratch every occurrence (see queueRepeat in api/scheduler/run), so pairing
 * it with "exclude anyone emailed in the last N days" where N is >= this
 * interval means the previous run's recipients are still inside the exclusion
 * window on the next one — the entire audience gets excluded and the send
 * fails with "No eligible contacts to send to". Caught at schedule time in
 * POST /api/scheduler rather than discovered a month later when it silently
 * fails.
 */
export const REPEAT_INTERVAL_DAYS: Record<RepeatEvery, number> = {
  daily: 1,
  weekly: 7,
  monthly: 28,
};

/** The wall-clock fields an instant maps to inside a given IANA zone. */
interface ZonedParts {
  year: number; month: number; day: number; hour: number; minute: number; second: number;
}

function partsInZone(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0; // some engines emit "24" for midnight
  return {
    year: get("year"), month: get("month"), day: get("day"),
    hour, minute: get("minute"), second: get("second"),
  };
}

/**
 * Convert a wall-clock local time ("2026-07-30T14:30") in an IANA timezone to a
 * UTC epoch (seconds). Uses Intl to measure the zone's offset at that instant —
 * accurate except within the ~1h DST-transition window, which is acceptable here.
 */
export function zonedWallTimeToUtcEpoch(localDateTime: string, timeZone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(localDateTime);
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m.map(Number) as unknown as number[];
  const utcGuess = Date.UTC(y, mo - 1, d, hh, mm);
  const p = partsInZone(new Date(utcGuess), timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offset = asUTC - utcGuess; // ms the zone is ahead of UTC at that instant
  return Math.floor((utcGuess - offset) / 1000);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Advance an epoch by one repeat interval, holding the local wall-clock time
 * steady in `timeZone`. Month arithmetic clamps to the end of shorter months, so
 * a send on the 31st recurs on the 30th/28th rather than skipping into the next
 * month. Returns null if the zone is unusable.
 */
export function advanceInZone(epochSeconds: number, timeZone: string, every: RepeatEvery): number | null {
  let p: ZonedParts;
  try {
    p = partsInZone(new Date(epochSeconds * 1000), timeZone);
  } catch {
    return null;
  }

  let { year, month, day } = p;

  if (every === "daily" || every === "weekly") {
    // Walk the civil calendar via a UTC proxy date — no zone involved, so this
    // is pure day arithmetic and immune to DST.
    const proxy = new Date(Date.UTC(year, month - 1, day));
    proxy.setUTCDate(proxy.getUTCDate() + (every === "daily" ? 1 : 7));
    year = proxy.getUTCFullYear();
    month = proxy.getUTCMonth() + 1;
    day = proxy.getUTCDate();
  } else {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > lastDay) day = lastDay;
  }

  const local = `${year}-${pad(month)}-${pad(day)}T${pad(p.hour)}:${pad(p.minute)}`;
  return zonedWallTimeToUtcEpoch(local, timeZone);
}

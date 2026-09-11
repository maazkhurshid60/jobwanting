// Correct date-range handling for "from X to Y" queries.
//
// The classic bug: timestamps carry a time-of-day, but a picked date like
// "2026-06-25" means midnight at the START of the 25th. Using
// `col BETWEEN from AND to` (inclusive/inclusive) therefore DROPS everything that
// happened during the last day. The fix is a HALF-OPEN interval:
//
//     col >= startOf(from)  AND  col < startOf(to + 1 day)
//
// which includes the entire end day regardless of time-of-day, and is DST-safe
// because we add the day on the calendar before converting to an instant.

const DEFAULT_TZ = "America/New_York";

// Offset (ms) between the given tz and UTC at a specific instant.
function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - utcMs;
}

// Unix ms for local midnight of `YYYY-MM-DD` in the given timezone.
function zonedDayStartMs(dateStr: string, tz: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0);
  // The offset at ~this date; good enough across the DST boundary for day starts.
  return utcMidnight - tzOffsetMs(utcMidnight, tz);
}

function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isValidDateStr(s: string | null | undefined): s is string {
  return !!s && DATE_RE.test(s);
}

export interface UnixRange {
  start: number;        // inclusive, unix seconds
  endExclusive: number; // exclusive, unix seconds (midnight AFTER the `to` day)
}

/**
 * Convert an inclusive calendar-day range (from..to, both YYYY-MM-DD, interpreted
 * in `tz`) into a half-open unix-second interval [start, endExclusive).
 * The `to` day is fully included. If `to` < `from` they are swapped.
 */
export function dayRangeToUnix(from: string, to: string, tz: string = DEFAULT_TZ): UnixRange {
  let lo = from, hi = to;
  if (hi < lo) [lo, hi] = [hi, lo];
  const start = Math.floor(zonedDayStartMs(lo, tz) / 1000);
  const endExclusive = Math.floor(zonedDayStartMs(addDaysStr(hi, 1), tz) / 1000);
  return { start, endExclusive };
}

/** Human label for a range, e.g. "Jun 1 – Jun 25, 2026". */
export function rangeLabel(from: string, to: string): string {
  const fmt = (s: string) =>
    new Date(s + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  return `${fmt(from)} – ${fmt(to)}`;
}

/**
 * Calendar-day arithmetic in a given IANA time zone (functions run in UTC). Used for
 * "the same day" in the attendance trigger and "days that have ended" in the Missed check.
 */

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * The wall-clock date and time of an instant in a time zone.
 * @param {Date} date The instant.
 * @param {string} timeZone IANA zone, e.g. Asia/Jerusalem.
 * @return {ZonedParts} Year, month (1–12), day, hour (0–23), minute.
 */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || "0");
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/**
 * The zone's UTC offset at an instant, in minutes (e.g. +180 for Israel summer time).
 * @param {Date} date The instant.
 * @param {string} timeZone IANA zone.
 * @return {number} Offset in minutes east of UTC.
 */
function offsetMinutes(date: Date, timeZone: string): number {
  const label = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(date).find((p) => p.type === "timeZoneName")?.value || "GMT+00:00";
  // eslint-disable-next-line -- fixed-width \d{2} quantifiers, no backtracking risk (same as getStartOfDayUtc).
  const match = label.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || "0"));
}

/**
 * The instant of local midnight that starts the zone's calendar day containing `date`.
 * Corrected once for the offset at midnight itself, so DST change days are right.
 * @param {Date} date Any instant in that day.
 * @param {string} timeZone IANA zone.
 * @return {Date} Start of that local day.
 */
export function startOfZonedDay(date: Date, timeZone: string): Date {
  const { year, month, day } = zonedParts(date, timeZone);
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  const first = midnightAsUtc - offsetMinutes(date, timeZone) * 60_000;
  return new Date(midnightAsUtc - offsetMinutes(new Date(first), timeZone) * 60_000);
}

/**
 * The start of the local day after the one containing `date`.
 * @param {Date} date Any instant in the day.
 * @param {string} timeZone IANA zone.
 * @return {Date} Start of the next local day.
 */
export function startOfNextZonedDay(date: Date, timeZone: string): Date {
  // 30 h after midnight is always inside the next day, even on a 25-hour DST day.
  return startOfZonedDay(new Date(startOfZonedDay(date, timeZone).getTime() + 30 * 3_600_000), timeZone);
}

/**
 * "yyyy-mm-dd" of the local day, e.g. for once-per-day guard documents.
 * @param {Date} date The instant.
 * @param {string} timeZone IANA zone.
 * @return {string} The local date.
 */
export function zonedDateKey(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * "HH:mm" of the local time.
 * @param {Date} date The instant.
 * @param {string} timeZone IANA zone.
 * @return {string} The local time.
 */
export function zonedHHmm(date: Date, timeZone: string): string {
  const { hour, minute } = zonedParts(date, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

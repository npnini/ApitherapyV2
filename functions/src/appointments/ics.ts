/**
 * Hand-built iCalendar (RFC 5545) invitations for appointments. No package: the
 * format needed here is small. Times are UTC; text is escaped; lines are folded
 * at 75 octets without splitting a UTF-8 character (Hebrew is multi-byte).
 */

export type IcsMethod = "REQUEST" | "CANCEL";

export interface IcsEvent {
  /** Stable across every update of the same appointment for the same recipient. */
  uid: string;
  /** 0 for the first invitation, +1 on every later change. */
  sequence: number;
  method: IcsMethod;
  start: Date;
  end: Date;
  summary: string;
  description: string;
  location?: string;
  organizerEmail: string;
  organizerName: string;
  attendeeEmail: string;
  attendeeName: string;
}

/**
 * Formats a date as an iCalendar UTC date-time, e.g. 20261004T070000Z.
 * @param {Date} date The instant to format.
 * @return {string} The UTC date-time.
 */
function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Escapes a TEXT value: backslash, semicolon, comma and newlines.
 * @param {string} text Raw text.
 * @return {string} Escaped text.
 */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * A CN parameter value: double-quoted, with characters that cannot appear in a
 * quoted parameter (double quote, control characters) removed.
 * @param {string} name Display name.
 * @return {string} Quoted parameter value.
 */
function quoteParam(name: string): string {
  return `"${name.replace(/["\r\n\t]/g, "").trim()}"`;
}

/**
 * Folds one content line at 75 octets (RFC 5545 §3.1), never inside a UTF-8 character.
 * @param {string} line An unfolded content line.
 * @return {string} The folded line, joined with CRLF + space.
 */
function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char, "utf8");
    // Continuation lines start with a space, which counts toward their 75 octets.
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/**
 * Builds a complete VCALENDAR with one VEVENT.
 * @param {IcsEvent} event The invitation to build.
 * @return {string} The .ics file content (CRLF line endings).
 */
export function buildIcs(event: IcsEvent): string {
  const isCancel = event.method === "CANCEL";
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Apitherapy//Appointments//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${event.method}`,
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(event.start)}`,
    `DTEND:${toIcsUtc(event.end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    `ORGANIZER;CN=${quoteParam(event.organizerName)}:mailto:${event.organizerEmail}`,
    // RSVP=FALSE: the app does not process Accept/Decline replies (spec §12).
    `ATTENDEE;CN=${quoteParam(event.attendeeName)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${event.attendeeEmail}`,
    `STATUS:${isCancel ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

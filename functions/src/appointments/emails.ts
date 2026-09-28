/**
 * Email texts for appointment invitations (spec §12), one per recipient, in the
 * recipient's language (Hebrew or English). No medical information. Every value
 * put into HTML is escaped. Dates are dd/mm/yyyy in every language.
 */

export type InviteKind = "booked" | "moved" | "cancelled";
export type Lang = "he" | "en";

/**
 * Maps a stored language code to a supported email language.
 * @param {unknown} code Language code, e.g. "he".
 * @return {Lang} "he" for Hebrew, otherwise "en".
 */
export function toLang(code: unknown): Lang {
  return code === "he" ? "he" : "en";
}

/**
 * Escapes a value for HTML text and attributes.
 * @param {string} value Raw value.
 * @return {string} HTML-safe value.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface When {
  /** e.g. "Sunday 04/10/2026" / "יום ראשון 04/10/2026". */
  day: string;
  /** "10:00–10:30". */
  time: string;
}

/**
 * Formats an appointment's day and time in the caretaker's time zone.
 * @param {Date} start Start instant.
 * @param {Date} end End instant.
 * @param {string} timeZone IANA zone, e.g. Asia/Jerusalem.
 * @param {Lang} lang Recipient language (weekday name only).
 * @return {When} Day and time strings.
 */
export function formatWhen(start: Date, end: Date, timeZone: string, lang: Lang): When {
  const part = (parts: Intl.DateTimeFormatPart[], type: string) => parts.find((p) => p.type === type)?.value || "";
  const dateParts = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(start);
  const weekday = new Intl.DateTimeFormat(lang === "he" ? "he-IL" : "en-GB", { timeZone, weekday: "long" }).format(start);
  const hhmm = (d: Date) => {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
    return `${part(p, "hour")}:${part(p, "minute")}`;
  };
  return {
    day: `${weekday} ${part(dateParts, "day")}/${part(dateParts, "month")}/${part(dateParts, "year")}`,
    time: `${hhmm(start)}–${hhmm(end)}`,
  };
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
  /** Calendar entry title (ICS SUMMARY). */
  summary: string;
  /** Calendar entry notes (ICS DESCRIPTION). */
  description: string;
}

/**
 * Wraps lines into a minimal, direction-aware HTML email.
 * @param {Lang} lang Recipient language (sets dir="rtl" for Hebrew).
 * @param {string} heading First line, shown bold.
 * @param {string[]} lines Body lines (already escaped HTML).
 * @return {string} HTML document.
 */
function wrapHtml(lang: Lang, heading: string, lines: string[]): string {
  const dir = lang === "he" ? "rtl" : "ltr";
  const body = lines.map((l) => `<p style="margin:0 0 10px">${l}</p>`).join("");
  return `<!DOCTYPE html><html lang="${lang}" dir="${dir}"><body dir="${dir}" ` +
    "style=\"font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111827;line-height:1.5\">" +
    `<p style="margin:0 0 14px;font-size:17px;font-weight:bold">${heading}</p>${body}</body></html>`;
}

const CARETAKER_TEXT = {
  en: {
    booked: "New appointment",
    moved: "Appointment moved",
    cancelled: "Appointment cancelled",
    when: "When",
    openPatient: "Open the patient in the app",
    changeNote: "To change this appointment, please use the app. Changes made in your calendar are not seen by the app.",
  },
  he: {
    booked: "פגישה חדשה",
    moved: "הפגישה הועברה",
    cancelled: "הפגישה בוטלה",
    when: "מתי",
    openPatient: "פתיחת המטופל באפליקציה",
    changeNote: "לשינוי הפגישה יש להשתמש באפליקציה. שינויים שנעשים ביומן שלך אינם מתעדכנים באפליקציה.",
  },
};

const PATIENT_TEXT = {
  en: {
    title: (app: string, caretaker: string) => `${app} treatment with ${caretaker}`,
    booked: "Your appointment is booked",
    moved: "Your appointment was moved",
    cancelled: "Your appointment was cancelled",
    when: "When",
    where: "Where",
    phone: "Phone",
    changeNote: (caretaker: string) => `To cancel or reschedule, please contact ${caretaker}. Changes made in your calendar do not change the appointment.`,
  },
  he: {
    title: (app: string, caretaker: string) => `טיפול ${app} אצל ${caretaker}`,
    booked: "התור שלך נקבע",
    moved: "התור שלך הועבר",
    cancelled: "התור שלך בוטל",
    when: "מתי",
    where: "איפה",
    phone: "טלפון",
    changeNote: (caretaker: string) => `לביטול או לשינוי התור יש לפנות אל ${caretaker}. שינויים שנעשים ביומן שלך אינם משנים את התור.`,
  },
};

/**
 * Picks the kind's heading from a text set without dynamic property access.
 * @param {{booked: string, moved: string, cancelled: string}} t Text set.
 * @param {InviteKind} kind booked / moved / cancelled.
 * @return {string} The heading.
 */
function kindHeading(t: { booked: string; moved: string; cancelled: string }, kind: InviteKind): string {
  if (kind === "moved") return t.moved;
  if (kind === "cancelled") return t.cancelled;
  return t.booked;
}

/**
 * The caretaker's invitation email (spec §12: "<App> – <patient at chosen level>").
 * @param {object} p Content inputs.
 * @return {EmailContent} Subject, bodies and calendar title/notes.
 */
export function caretakerEmail(p: {
  lang: Lang; kind: InviteKind; appName: string; patientLabel: string; when: When; patientLink: string;
}): EmailContent {
  const t = p.lang === "he" ? CARETAKER_TEXT.he : CARETAKER_TEXT.en;
  const heading = kindHeading(t, p.kind);
  const summary = p.patientLabel ? `${p.appName} – ${p.patientLabel}` : p.appName;
  const whenText = `${p.when.day} ${p.when.time}`;
  const description = `${t.openPatient}: ${p.patientLink}\n\n${t.changeNote}`;
  return {
    subject: `${heading}: ${summary}, ${whenText}`,
    summary,
    description,
    text: `${heading}\n${summary}\n${t.when}: ${whenText}\n\n${description}\n`,
    html: wrapHtml(p.lang, escapeHtml(`${heading}: ${summary}`), [
      `<strong>${escapeHtml(t.when)}:</strong> ${escapeHtml(whenText)}`,
      `<a href="${escapeHtml(p.patientLink)}">${escapeHtml(t.openPatient)}</a>`,
      escapeHtml(t.changeNote),
    ]),
  };
}

/**
 * The patient's invitation email (spec §12: "<App> treatment with <caretaker>").
 * @param {object} p Content inputs.
 * @return {EmailContent} Subject, bodies and calendar title/notes.
 */
export function patientEmail(p: {
  lang: Lang; kind: InviteKind; appName: string; caretakerName: string; caretakerPhone: string; address: string; when: When;
}): EmailContent {
  const t = p.lang === "he" ? PATIENT_TEXT.he : PATIENT_TEXT.en;
  const heading = kindHeading(t, p.kind);
  const summary = t.title(p.appName, p.caretakerName);
  const whenText = `${p.when.day} ${p.when.time}`;
  const detailLines = [
    `${t.when}: ${whenText}`,
    ...(p.address ? [`${t.where}: ${p.address}`] : []),
    ...(p.caretakerPhone ? [`${t.phone}: ${p.caretakerPhone}`] : []),
  ];
  const note = t.changeNote(p.caretakerName);
  return {
    subject: `${heading}: ${summary}, ${whenText}`,
    summary,
    description: `${detailLines.join("\n")}\n\n${note}`,
    text: `${heading}\n${summary}\n${detailLines.join("\n")}\n\n${note}\n`,
    html: wrapHtml(p.lang, escapeHtml(`${heading}: ${summary}`), [
      ...detailLines.map((l) => escapeHtml(l)),
      escapeHtml(note),
    ]),
  };
}

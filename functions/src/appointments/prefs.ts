/**
 * Small server-side copy of the client's appointment defaults and prefs helpers
 * (src/config/appointmentDefaults.ts, src/utils/appointments/prefs.ts). Only the
 * fields the functions need. Keep the defaults in step with the client.
 */

export type PatientNameLevel = "initials" | "first" | "full";

export interface ServerAppointmentSettings {
  appNameInInvites: string;
  patientNameLevel: PatientNameLevel;
}

export interface ServerAppointmentPrefs {
  sendInvitesToMe: boolean;
  inviteEmail: string;
  patientNameLevel: PatientNameLevel;
  timezone: string;
}

export const DEFAULT_TIMEZONE = "Asia/Jerusalem";
const DEFAULT_APP_NAME = "Apitherapy";
const DEFAULT_NAME_LEVEL: PatientNameLevel = "first";

/**
 * Type guard for a stored patient name level.
 * @param {unknown} value A stored value.
 * @return {boolean} True for 'initials', 'first' or 'full'.
 */
function isNameLevel(value: unknown): value is PatientNameLevel {
  return value === "initials" || value === "first" || value === "full";
}

/**
 * App-wide appointment settings with built-in defaults.
 * @param {Record<string, unknown>} appConfig cfg_app_config/main data.
 * @return {ServerAppointmentSettings} Effective settings.
 */
export function getAppointmentSettings(appConfig: Record<string, unknown>): ServerAppointmentSettings {
  const stored = (appConfig.appointmentSettings || {}) as Record<string, unknown>;
  const appName = typeof stored.appNameInInvites === "string" ? stored.appNameInInvites.trim() : "";
  return {
    appNameInInvites: appName || DEFAULT_APP_NAME,
    patientNameLevel: isNameLevel(stored.patientNameLevel) ? stored.patientNameLevel : DEFAULT_NAME_LEVEL,
  };
}

/**
 * A caretaker's prefs; each missing field falls back to the app defaults.
 * @param {Record<string, unknown>} user users/{uid} data.
 * @param {Record<string, unknown>} appConfig cfg_app_config/main data.
 * @return {ServerAppointmentPrefs} Effective prefs.
 */
export function getEffectiveAppointmentPrefs(user: Record<string, unknown>, appConfig: Record<string, unknown>): ServerAppointmentPrefs {
  const settings = getAppointmentSettings(appConfig);
  const p = (user.appointmentPrefs || {}) as Record<string, unknown>;
  return {
    sendInvitesToMe: typeof p.sendInvitesToMe === "boolean" ? p.sendInvitesToMe : true,
    inviteEmail: typeof p.inviteEmail === "string" ? p.inviteEmail.trim() : String(user.email || "").trim(),
    patientNameLevel: isNameLevel(p.patientNameLevel) ? p.patientNameLevel : settings.patientNameLevel,
    timezone: typeof p.timezone === "string" && p.timezone ? p.timezone : DEFAULT_TIMEZONE,
  };
}

/**
 * The patient's name at the chosen level of detail (spec principle 7).
 * @param {string} fullName The patient's full name.
 * @param {PatientNameLevel} level Initials, first name or full name.
 * @return {string} The name to show in the caretaker's invitation.
 */
export function patientNameAtLevel(fullName: string, level: PatientNameLevel): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (level === "full") return words.join(" ");
  if (level === "first") return words[0];
  return words.map((w) => `${w.charAt(0).toUpperCase()}.`).join("");
}

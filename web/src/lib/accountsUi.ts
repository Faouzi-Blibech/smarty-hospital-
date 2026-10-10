// Pure helpers for the accounts screens: error → message key, code and password checks, dates.
import type { Lang } from "@/i18n/config";
import type { Key } from "@/i18n/messages";
import { ApiError } from "./api";
import { translate } from "@/i18n/messages";
import { now, tunisDate, tunisDay, tunisTime } from "./time";

export const MIN_PASSWORD = 10;
/** The backend hashes at most 72 UTF-8 bytes. */
export const MAX_PASSWORD_BYTES = 72;

export interface ErrorInfo {
  key: Key;
  /** The server's reason (English); only shown as secondary text for weak passwords. */
  detail: string | null;
}
export type ErrorCtx = "login" | "password" | "form";

const BY_CODE: Partial<Record<string, Key>> = {
  account_pending: "auth.errPending",
  account_disabled: "auth.errDisabled",
  account_rejected: "auth.errRejected",
  account_locked: "auth.errLocked",
  rate_limited: "auth.errRateLimited",
  weak_password: "auth.errWeak",
  invalid_code: "auth.errInvalidCode",
  already_enrolled: "auth.errAlreadyEnrolled",
};

/** Maps any thrown value to a localized message key. Non-ApiError (fetch failed) = server unreachable. */
export function describeError(err: unknown, ctx: ErrorCtx = "form"): ErrorInfo {
  if (!(err instanceof ApiError)) return { key: "shared.loginUnreachable", detail: null };
  if (err.code === "bad_credentials") return { key: ctx === "password" ? "auth.errBadCurrent" : "shared.loginWrong", detail: null };
  const key = BY_CODE[err.code] ?? (err.status === 429 ? "auth.errRateLimited" : "auth.errGeneric");
  return { key, detail: err.code === "weak_password" && err.message ? err.message : null };
}

/** "k7m2q 9xr4t" or "k7m2q9xr4t" → "K7M2Q-9XR4T". Anything that isn't 10 letters/digits is returned uppercased and stripped, for the server to reject. */
export function normalizeCode(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 10 ? `${s.slice(0, 5)}-${s.slice(5)}` : s;
}

export type PasswordProblem = "short" | "long" | "personal" | "mismatch";

/**
 * Client-side mirror of the backend policy: at least 10 characters, at most 72 UTF-8 bytes, not equal to the
 * email, its local part or the name (ignoring spaces and case). The common-password list is backend-only.
 */
export function passwordProblem(pw: string, confirm: string, email = "", name = ""): PasswordProblem | null {
  if ([...pw].length < MIN_PASSWORD) return "short";
  if (new TextEncoder().encode(pw).length > MAX_PASSWORD_BYTES) return "long";
  const p = pw.toLowerCase();
  const e = email.trim().toLowerCase();
  const n = name.replace(/\s+/g, "").toLowerCase();
  const forbidden = [e, e.split("@")[0], n].filter((x) => x.length > 0);
  if (forbidden.includes(p)) return "personal";
  if (pw !== confirm) return "mismatch";
  return null;
}

export const PASSWORD_ERROR_KEYS: Record<PasswordProblem, Key> = {
  short: "auth.errPasswordShort",
  long: "auth.errPasswordLong",
  personal: "auth.errPasswordPersonal",
  mismatch: "auth.errPasswordMismatch",
};

/** Loose email shape check; the server stays the authority. */
export function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** "Mon 5 Oct 09:10" in the hospital's time zone (Tunis); "Today 09:10" when the date is today. */
export function fmtWhen(iso: string, lang: Lang): string {
  const today = tunisDate(iso) === tunisDate(now().toISOString());
  return `${today ? translate(lang, "common.today") : tunisDay(iso, lang)} ${tunisTime(iso)}`;
}

import type { Lang } from "./config";

/**
 * One namespace of messages. `en` is the source; `fr` and `ar` must carry exactly
 * the same keys (a missing or extra key fails the type check).
 */
export function messages<const T extends Record<string, string>>(m: {
  en: T;
  fr: { [K in keyof T]: string };
  ar: { [K in keyof T]: string };
}): Record<Lang, T> {
  return m as Record<Lang, T>;
}

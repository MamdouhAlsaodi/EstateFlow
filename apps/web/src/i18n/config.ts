/**
 * EF-630 — single locale/direction switch for the Arabic-first web app.
 *
 * The app ships Arabic (`ar`) as the default and only routed locale today;
 * `app/en` pages remain explicitly deferred. This module is still the ONE
 * place that decides language and text direction, so any future locale
 * (e.g. `en`) flips direction with a single code path:
 *
 *   route segment  ->  middleware (`src/middleware.ts`) sets the
 *   `x-estateflow-locale` request header  ->  root layout derives
 *   `lang`/`dir` via `htmlAttributes(locale)`  ->  translators and formatters
 *   read the same locale value.
 */

export const LOCALE_REQUEST_HEADER = "x-estateflow-locale";

export const LOCALES = ["ar", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ar";

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

/** RTL for Arabic, LTR for everything else — the single direction switch. */
export function directionFor(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** `<html>` attributes derived from one locale value. */
export function htmlAttributes(locale: Locale): {
  lang: Locale;
  dir: "rtl" | "ltr";
} {
  return { lang: locale, dir: directionFor(locale) };
}

/** Locale used by Intl formatters (kept identical to the UI locale). */
export function intlLocale(locale: Locale): string {
  return locale;
}

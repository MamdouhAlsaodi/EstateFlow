/**
 * EF-630 — locale-aware formatters replacing ad-hoc date/number/currency
 * formatting. Arabic (`ar`) is the default locale; every formatter accepts an
 * explicit `Locale` so future `en` pages get correct output from day one.
 *
 * Conventions shared with the API contract:
 * - Timestamps arrive as UTC `YYYY-MM-DDTHH:mm:ss.sssZ` strings.
 * - Money arrives as minor-unit strings (bigint-safe), never floats.
 */

import { DEFAULT_LOCALE, intlLocale, type Locale } from "./config";

const DATE_TIME_FORMATS = {
  date: {
    year: "numeric",
    month: "long",
    day: "numeric",
  },
  dateTime: {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  shortDate: {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  },
  time: {
    hour: "2-digit",
    minute: "2-digit",
  },
} as const;

export type DateFormatKind = keyof typeof DATE_TIME_FORMATS;

function parseUtc(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new TypeError(`invalid date value: ${String(value)}`);
  return date;
}

export function formatDate(
  value: Date | string,
  locale: Locale = DEFAULT_LOCALE,
  kind: DateFormatKind = "date",
): string {
  return new Intl.DateTimeFormat(
    intlLocale(locale),
    DATE_TIME_FORMATS[kind],
  ).format(parseUtc(value));
}

export function formatDateTime(
  value: Date | string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return formatDate(value, locale, "dateTime");
}

export function formatTime(
  value: Date | string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return formatDate(value, locale, "time");
}

export function formatNumber(
  value: number,
  locale: Locale = DEFAULT_LOCALE,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(intlLocale(locale), options).format(value);
}

function parseMinor(minorUnits: string | number): number {
  const minor =
    typeof minorUnits === "string" ? Number(minorUnits) : minorUnits;
  if (!Number.isSafeInteger(minor))
    throw new TypeError(`invalid minor-unit amount: ${String(minorUnits)}`);
  return minor;
}

/**
 * Formats a minor-unit amount (string per the bigint-safe API contract) as
 * locale currency text, e.g. `150000` SAR minor units -> `1,500.00 ر.س.` in
 * `ar`. Fractional or malformed amounts are rejected, never truncated.
 */
export function formatMoney(
  minorUnits: string | number,
  currency: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(parseMinor(minorUnits) / 100);
}

/** Signed minor-unit amount (cancellations may be negative). */
export function formatSignedMoney(
  minorUnits: string | number,
  currency: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    signDisplay: "exceptZero",
  }).format(parseMinor(minorUnits) / 100);
}

export function formatPercent(
  ratio: number,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(ratio);
}

/**
 * Locale-aware human file size (EF-601 media). Units themselves come from
 * the translation catalog so they are localized, not hardcoded.
 */
export function formatFileSize(
  byteSize: number,
  units: Readonly<{ bytes: string; kb: string; mb: string }>,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (!Number.isSafeInteger(byteSize) || byteSize < 0)
    throw new TypeError(`invalid byte size: ${String(byteSize)}`);
  if (byteSize < 1024)
    return `${formatNumber(byteSize, locale)} ${units.bytes}`;
  if (byteSize < 1024 * 1024)
    return `${formatNumber(byteSize / 1024, locale, {
      maximumFractionDigits: 1,
    })} ${units.kb}`;
  return `${formatNumber(byteSize / (1024 * 1024), locale, {
    maximumFractionDigits: 1,
  })} ${units.mb}`;
}

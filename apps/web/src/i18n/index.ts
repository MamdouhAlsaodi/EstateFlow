/**
 * EF-630 — i18n public surface: locale/direction config, typed catalog,
 * translators (client hook + server helper), and locale-aware formatters.
 */

export {
  DEFAULT_LOCALE,
  directionFor,
  htmlAttributes,
  intlLocale,
  isLocale,
  LOCALES,
  LOCALE_REQUEST_HEADER,
  type Locale,
} from "./config";
export {
  arMessages,
  createTranslator,
  enMessages,
  interpolate,
  labelFromKey,
  type MessageKey,
  type Translator,
  type TranslationVars,
  translate,
} from "./catalog";
export { LocaleProvider, useLocale, useT } from "./react";
// NOTE: `getServerT`/`getRequestLocale` stay in `./server` (next/headers is
// server-only) and must never be re-exported from this client-safe barrel.
export {
  formatDate,
  formatDateTime,
  formatFileSize,
  formatMoney,
  formatNumber,
  formatPercent,
  formatSignedMoney,
  formatTime,
  type DateFormatKind,
} from "./format";

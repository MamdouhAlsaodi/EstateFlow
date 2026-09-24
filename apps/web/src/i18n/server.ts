/**
 * EF-630 — server-side translator. Server components resolve the locale from
 * the `x-estateflow-locale` request header that `src/middleware.ts` derives
 * from the URL locale segment; the value falls back to the default locale.
 */

import { headers } from "next/headers";
import { createTranslator, type Translator } from "./catalog";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_REQUEST_HEADER,
  type Locale,
} from "./config";

export async function getRequestLocale(): Promise<Locale> {
  const headerValue = (await headers()).get(LOCALE_REQUEST_HEADER);
  return isLocale(headerValue) ? headerValue : DEFAULT_LOCALE;
}

export async function getServerT(): Promise<Translator> {
  return createTranslator(await getRequestLocale());
}

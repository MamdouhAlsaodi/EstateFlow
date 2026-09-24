import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALE_REQUEST_HEADER } from "./i18n/config";

/**
 * EF-630 — the single locale switch. The first URL segment decides the
 * request locale (`/ar/...` -> `ar`), forwarded to layouts and server
 * components through `x-estateflow-locale`. Future `en` pages light up
 * LTR/English without touching any feature component.
 */

const SUPPORTED = new Set(["ar", "en"]);

export function localeFromPathname(pathname: string): string {
  const segment = pathname.split("/")[1];
  return SUPPORTED.has(segment) ? segment : DEFAULT_LOCALE;
}

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(
    LOCALE_REQUEST_HEADER,
    localeFromPathname(request.nextUrl.pathname),
  );
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

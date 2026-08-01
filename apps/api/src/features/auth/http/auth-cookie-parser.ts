import { parseOpaqueCredential } from "../infrastructure/node-crypto-credential-issuer.js";
import type { OpaqueCredential } from "../domain/session-credentials.js";

const ACCESS_COOKIE_NAME = "__Host-estateflow_access";
const REFRESH_COOKIE_NAME = "__Host-estateflow_session";
const CSRF_COOKIE_NAME = "estateflow_csrf";

export class InvalidAuthCookieError extends Error {
  constructor() {
    super("Invalid authentication cookie");
  }
}

export type ParsedAuthCookies = {
  access?: OpaqueCredential;
  refresh?: OpaqueCredential;
  csrf?: string;
};

export function parseAuthCookies(rawCookieHeader: string | undefined): ParsedAuthCookies {
  if (rawCookieHeader === undefined) return {};
  rejectControlCharacters(rawCookieHeader);

  const cookies: ParsedAuthCookies = {};
  for (const rawCookie of rawCookieHeader.split(";")) {
    parseCookieSegment(rawCookie, cookies);
  }
  return cookies;
}

function parseCookieSegment(rawCookie: string, cookies: ParsedAuthCookies): void {
  if (!rawCookie.trim()) return;
  const separator = rawCookie.indexOf("=");
  const name = rawCookie.slice(0, Math.max(separator, 0)).trim();
  if (!isAuthCookieName(name)) return;

  const cookieValue = decodeCookieComponent(
    separator < 0 ? "" : rawCookie.slice(separator + 1).trim(),
  );
  if (name === ACCESS_COOKIE_NAME) setAccessCookie(cookies, cookieValue);
  else if (name === REFRESH_COOKIE_NAME) setRefreshCookie(cookies, cookieValue);
  else setCsrfCookie(cookies, cookieValue);
}

function isAuthCookieName(name: string): boolean {
  return name === ACCESS_COOKIE_NAME || name === REFRESH_COOKIE_NAME || name === CSRF_COOKIE_NAME;
}

function decodeCookieComponent(rawValue: string): string {
  try {
    const decodedValue = decodeURIComponent(rawValue);
    rejectControlCharacters(decodedValue);
    return decodedValue;
  } catch (error) {
    if (error instanceof URIError) throw new InvalidAuthCookieError();
    throw error;
  }
}

function rejectControlCharacters(cookieComponent: string): void {
  if ([...cookieComponent].some(isControlCharacter)) {
    throw new InvalidAuthCookieError();
  }
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
}

function setAccessCookie(cookies: ParsedAuthCookies, cookieValue: string): void {
  if (cookies.access) throw new InvalidAuthCookieError();
  cookies.access = parseCredential(cookieValue);
}

function setRefreshCookie(cookies: ParsedAuthCookies, cookieValue: string): void {
  if (cookies.refresh) throw new InvalidAuthCookieError();
  cookies.refresh = parseCredential(cookieValue);
}

function setCsrfCookie(cookies: ParsedAuthCookies, cookieValue: string): void {
  if (cookies.csrf !== undefined || !isCanonicalCsrfToken(cookieValue)) {
    throw new InvalidAuthCookieError();
  }
  cookies.csrf = cookieValue;
}

export function isCanonicalCsrfToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token) && Buffer.from(token, "base64url").toString("base64url") === token;
}

function parseCredential(cookieValue: string): OpaqueCredential {
  try {
    return parseOpaqueCredential(cookieValue);
  } catch (error) {
    if (error instanceof Error && error.message === "Malformed opaque credential") {
      throw new InvalidAuthCookieError();
    }
    throw error;
  }
}

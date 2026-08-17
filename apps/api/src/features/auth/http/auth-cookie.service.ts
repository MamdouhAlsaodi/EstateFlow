import { Injectable } from "@nestjs/common";
import type { Response } from "express";
import { isCanonicalCsrfToken } from "./auth-cookie-parser.js";
import { parseOpaqueCredential } from "../infrastructure/node-crypto-credential-issuer.js";

const ACCESS_COOKIE_NAME = "__Host-estateflow_access";
const REFRESH_COOKIE_NAME = "__Host-estateflow_session";
const CSRF_COOKIE_NAME = "estateflow_csrf";
const ACCESS_MAX_AGE_SECONDS = 900;
const REFRESH_MAX_AGE_SECONDS = 604_800;
const EXPIRED_AT = "Thu, 01 Jan 1970 00:00:00 GMT";

type CookieResponse = Pick<Response, "append">;

export type SessionCookieInput = {
  accessCredential: string;
  refreshCredential: string;
  csrfToken: string;
  remainingRefreshLifetimeSeconds: number;
};

@Injectable()
export class AuthCookieService {
  setSessionCookies(
    response: CookieResponse,
    cookies: SessionCookieInput,
  ): void {
    validateSessionCookies(cookies);
    response.append("Set-Cookie", accessCookie(cookies.accessCredential));
    response.append("Set-Cookie", refreshCookie(cookies.refreshCredential));
    response.append(
      "Set-Cookie",
      csrfCookie(cookies.csrfToken, cookies.remainingRefreshLifetimeSeconds),
    );
  }

  clearSessionCookies(response: CookieResponse): void {
    response.append("Set-Cookie", expiredAccessCookie());
    response.append("Set-Cookie", expiredRefreshCookie());
    response.append("Set-Cookie", expiredCsrfCookie());
  }
}

function validateSessionCookies(cookies: SessionCookieInput): void {
  try {
    parseOpaqueCredential(cookies.accessCredential);
    parseOpaqueCredential(cookies.refreshCredential);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Malformed opaque credential"
    ) {
      throw new Error("Invalid session cookie", { cause: error });
    }
    throw error;
  }
  if (
    !isCanonicalCsrfToken(cookies.csrfToken) ||
    !isValidRefreshLifetime(cookies.remainingRefreshLifetimeSeconds)
  ) {
    throw new Error("Invalid session cookie");
  }
}

function isValidRefreshLifetime(lifetimeSeconds: number): boolean {
  return (
    Number.isSafeInteger(lifetimeSeconds) &&
    lifetimeSeconds >= 1 &&
    lifetimeSeconds <= REFRESH_MAX_AGE_SECONDS
  );
}

function accessCookie(credential: string): string {
  return `${ACCESS_COOKIE_NAME}=${credential}; Max-Age=${ACCESS_MAX_AGE_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function refreshCookie(credential: string): string {
  return `${REFRESH_COOKIE_NAME}=${credential}; Max-Age=${REFRESH_MAX_AGE_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function csrfCookie(
  token: string,
  remainingRefreshLifetimeSeconds: number,
): string {
  const maxAge = Math.min(
    REFRESH_MAX_AGE_SECONDS,
    remainingRefreshLifetimeSeconds,
  );
  return `${CSRF_COOKIE_NAME}=${token}; Max-Age=${maxAge}; Path=/; Secure; SameSite=Lax`;
}

function expiredAccessCookie(): string {
  return `${ACCESS_COOKIE_NAME}=; Max-Age=0; Expires=${EXPIRED_AT}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function expiredRefreshCookie(): string {
  return `${REFRESH_COOKIE_NAME}=; Max-Age=0; Expires=${EXPIRED_AT}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function expiredCsrfCookie(): string {
  return `${CSRF_COOKIE_NAME}=; Max-Age=0; Expires=${EXPIRED_AT}; Path=/; Secure; SameSite=Lax`;
}

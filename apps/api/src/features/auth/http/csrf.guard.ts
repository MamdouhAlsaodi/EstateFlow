import { timingSafeEqual } from "node:crypto";
import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { SESSION_CREDENTIAL_ISSUER } from "../auth.tokens.js";
import type { SessionCredentialIssuer } from "../domain/session-credentials.js";
import {
  InvalidAuthCookieError,
  parseAuthCookies,
} from "./auth-cookie-parser.js";
import "./auth-request.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    @Inject(SESSION_CREDENTIAL_ISSUER)
    private readonly credentialIssuer: SessionCredentialIssuer,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!UNSAFE_METHODS.has(request.method)) return true;

    const csrfHeader = request.headers["x-csrf-token"];
    const csrfCookie = readCsrfCookie(request.headers.cookie);
    if (
      !request.auth ||
      !isSingleToken(csrfHeader) ||
      !csrfCookie ||
      !tokensMatch(csrfHeader, csrfCookie)
    ) {
      throw new ForbiddenException();
    }
    if (!this.credentialIssuer.matches(csrfHeader, request.auth.csrfHash)) {
      throw new ForbiddenException();
    }
    return true;
  }
}

function readCsrfCookie(
  rawCookieHeader: string | undefined,
): string | undefined {
  try {
    return parseAuthCookies(rawCookieHeader).csrf;
  } catch (error) {
    if (error instanceof InvalidAuthCookieError) throw new ForbiddenException();
    throw error;
  }
}

function isSingleToken(token: string | string[] | undefined): token is string {
  return typeof token === "string" && token.length > 0 && !token.includes(",");
}

function tokensMatch(headerToken: string, cookieToken: string): boolean {
  const header = Buffer.from(headerToken, "utf8");
  const cookie = Buffer.from(cookieToken, "utf8");
  return header.length === cookie.length && timingSafeEqual(header, cookie);
}

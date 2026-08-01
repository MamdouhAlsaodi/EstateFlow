import { timingSafeEqual } from "node:crypto";
import { ForbiddenException, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import {
  InvalidAuthCookieError,
  parseAuthCookies,
} from "./auth-cookie-parser.js";
import "./auth-request.js";

@Injectable()
export class RefreshCsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const credentials = this.readCredentials(request);
    request.refreshAuth = credentials;
    return true;
  }

  private readCredentials(request: Request): {
    refreshCredential: string;
    csrfToken: string;
  } {
    try {
      const cookies = parseAuthCookies(request.headers.cookie);
      const csrfHeader = request.headers["x-csrf-token"];
      if (
        !cookies.refresh ||
        !cookies.csrf ||
        !isSingleToken(csrfHeader) ||
        !tokensMatch(csrfHeader, cookies.csrf)
      ) {
        throw new ForbiddenException();
      }
      return {
        refreshCredential: cookies.refresh.serialized,
        csrfToken: cookies.csrf,
      };
    } catch (error) {
      if (error instanceof InvalidAuthCookieError)
        throw new ForbiddenException();
      throw error;
    }
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

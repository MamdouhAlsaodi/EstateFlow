import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { AuthenticateAccess } from "../application/authenticate-access.js";
import { InvalidSessionError } from "../domain/auth-errors.js";
import {
  InvalidAuthCookieError,
  parseAuthCookies,
} from "./auth-cookie-parser.js";
import "./auth-request.js";

@Injectable()
export class BrowserSessionGuard implements CanActivate {
  constructor(
    @Inject(AuthenticateAccess)
    private readonly authenticateAccess: AuthenticateAccess,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    let accessCredential: string;
    try {
      accessCredential = this.readAccessCredential(request.headers.cookie);
    } catch (error) {
      if (error instanceof InvalidAuthCookieError) return this.deny();
      throw error;
    }
    try {
      request.auth = await this.authenticateAccess.execute(accessCredential);
      return true;
    } catch (error) {
      if (error instanceof InvalidSessionError) return this.deny();
      throw error;
    }
  }

  private deny(): never {
    throw new UnauthorizedException();
  }

  private readAccessCredential(rawCookieHeader: string | undefined): string {
    const access = parseAuthCookies(rawCookieHeader).access;
    if (!access) throw new InvalidAuthCookieError();
    return access.serialized;
  }
}

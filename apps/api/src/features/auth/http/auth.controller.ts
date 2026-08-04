import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { Clock } from "../application/clock.js";
import { GetSession } from "../application/get-session.js";
import { Login } from "../application/login.js";
import { Logout } from "../application/logout.js";
import { RefreshSession } from "../application/refresh-session.js";
import { RegisterUser } from "../application/register-user.js";
import { RequestPasswordRecovery } from "../application/request-password-recovery.js";
import { ResetPassword } from "../application/reset-password.js";
import {
  AuthRateLimitExceededError,
  GenericAuthenticationError,
  InvalidPasswordResetError,
  InvalidRefreshError,
  InvalidRegistrationInputError,
} from "../domain/auth-errors.js";
import { AUTH_CLOCK, SESSION_CREDENTIAL_ISSUER } from "../auth.tokens.js";
import { AuthCookieService } from "./auth-cookie.service.js";
import {
  InvalidAuthCookieError,
  parseAuthCookies,
} from "./auth-cookie-parser.js";
import type { SessionCredentialIssuer } from "../domain/session-credentials.js";
import {
  AuthCredentialsDto,
  PasswordRecoveryDto,
  PasswordResetDto,
} from "./auth.dto.js";
import { AuthRequestContextFactory } from "./auth-request-context.factory.js";
import {
  type AuthenticatedRequest,
  type RefreshAuthenticatedRequest,
} from "./auth-request.js";
import { BrowserSessionGuard } from "./browser-session.guard.js";
import { CsrfGuard } from "./csrf.guard.js";
import { RequireCanonicalOriginGuard } from "./origin.guard.js";
import { RefreshCsrfGuard } from "./refresh-csrf.guard.js";

const MAXIMUM_REFRESH_LIFETIME_SECONDS = 604_800;

@Controller("auth")
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUser,
    private readonly loginUser: Login,
    private readonly refreshSession: RefreshSession,
    private readonly logoutUser: Logout,
    private readonly getSession: GetSession,
    private readonly cookies: AuthCookieService,
    @Inject(SESSION_CREDENTIAL_ISSUER)
    private readonly credentialIssuer: SessionCredentialIssuer,
    @Inject(AUTH_CLOCK) private readonly clock: Clock,
    private readonly requestPasswordRecovery: RequestPasswordRecovery,
    private readonly resetPassword: ResetPassword,
    private readonly requestContextFactory: AuthRequestContextFactory,
  ) {}

  @Post("register")
  @HttpCode(202)
  @UseGuards(RequireCanonicalOriginGuard)
  async register(
    @Body() credentials: AuthCredentialsDto,
    @Req() request: Request,
  ): Promise<{ status: "accepted" }> {
    try {
      return await this.registerUser.execute(
        credentials,
        this.requestContextFactory.create(request),
      );
    } catch (error) {
      if (error instanceof InvalidRegistrationInputError)
        throw new BadRequestException();
      if (error instanceof AuthRateLimitExceededError)
        throw rateLimitedResponse();
      throw error;
    }
  }

  @Post("login")
  @HttpCode(204)
  @UseGuards(RequireCanonicalOriginGuard)
  async login(
    @Body() credentials: AuthCredentialsDto,
    @Res({ passthrough: true }) response: Response,
    @Req() request: Request,
  ): Promise<void> {
    try {
      const session = await this.loginUser.execute(
        credentials,
        this.requestContextFactory.create(request),
      );
      this.setSessionCookies(response, session);
    } catch (error) {
      if (error instanceof GenericAuthenticationError)
        throw new UnauthorizedException();
      if (error instanceof AuthRateLimitExceededError)
        throw rateLimitedResponse();
      throw error;
    }
  }

  @Post("password-recovery")
  @HttpCode(202)
  @UseGuards(RequireCanonicalOriginGuard)
  async passwordRecovery(
    @Body() requestBody: PasswordRecoveryDto,
    @Req() request: Request,
  ): Promise<{ status: "accepted" }> {
    try {
      return await this.requestPasswordRecovery.execute(
        requestBody,
        this.requestContextFactory.create(request),
      );
    } catch (error) {
      if (error instanceof AuthRateLimitExceededError)
        throw rateLimitedResponse();
      throw error;
    }
  }

  @Post("password-reset")
  @HttpCode(204)
  @UseGuards(RequireCanonicalOriginGuard)
  async passwordReset(
    @Body() requestBody: PasswordResetDto,
    @Req() request: Request,
  ): Promise<void> {
    try {
      await this.resetPassword.execute(
        requestBody,
        this.requestContextFactory.create(request),
      );
    } catch (error) {
      if (error instanceof InvalidPasswordResetError)
        throw new BadRequestException();
      if (error instanceof AuthRateLimitExceededError)
        throw rateLimitedResponse();
      throw error;
    }
  }

  @Post("refresh")
  @HttpCode(204)
  @UseGuards(RequireCanonicalOriginGuard, RefreshCsrfGuard)
  async refresh(
    @Req() request: RefreshAuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    try {
      const session = await this.refreshSession.execute(
        request.refreshAuth,
        this.requestContextFactory.create(request),
      );
      this.setSessionCookies(response, session);
    } catch (error) {
      if (error instanceof InvalidRefreshError) {
        this.cookies.clearSessionCookies(response);
        throw new UnauthorizedException();
      }
      if (error instanceof AuthRateLimitExceededError)
        throw rateLimitedResponse();
      throw error;
    }
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(RequireCanonicalOriginGuard, BrowserSessionGuard, CsrfGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.logoutUser.execute(
      request.auth,
      this.requestContextFactory.create(request),
    );
    this.cookies.clearSessionCookies(response);
  }

  @Get("session")
  @UseGuards(BrowserSessionGuard)
  session(@Req() request: AuthenticatedRequest) {
    return this.getSession.execute(
      request.auth,
      currentCsrfToken(request, request.auth, this.credentialIssuer),
    );
  }

  private setSessionCookies(
    response: Response,
    session:
      | Awaited<ReturnType<Login["execute"]>>
      | Awaited<ReturnType<RefreshSession["execute"]>>,
  ): void {
    this.cookies.setSessionCookies(response, {
      ...session,
      remainingRefreshLifetimeSeconds: refreshLifetimeSeconds(
        session.refreshAbsoluteExpiresAt,
        this.clock.now(),
      ),
    });
  }
}

function currentCsrfToken(
  request: Request,
  principal: AuthenticatedRequest["auth"],
  credentialIssuer: SessionCredentialIssuer,
): string | null {
  try {
    const csrfToken = parseAuthCookies(request.headers.cookie).csrf;
    return csrfToken && credentialIssuer.matches(csrfToken, principal.csrfHash)
      ? csrfToken
      : null;
  } catch (error) {
    if (error instanceof InvalidAuthCookieError) return null;
    throw error;
  }
}

function rateLimitedResponse(): HttpException {
  return new HttpException("Too Many Requests", HttpStatus.TOO_MANY_REQUESTS);
}

function refreshLifetimeSeconds(absoluteExpiry: Date, now: Date): number {
  const remaining = Math.ceil(
    (absoluteExpiry.getTime() - now.getTime()) / 1_000,
  );
  return Math.max(1, Math.min(MAXIMUM_REFRESH_LIFETIME_SECONDS, remaining));
}

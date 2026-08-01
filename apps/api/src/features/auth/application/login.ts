import type {
  AuthRepository,
  IdentityWithCredential,
} from "./auth.repository.js";
import {
  type AuthAbuseControl,
  type AuthRequestAbuseContext,
} from "./auth-abuse-control.js";
import type { SecurityAuditService } from "./security-audit.js";
import type { Clock } from "./clock.js";
import {
  isValidLoginPassword,
  normalizeAccountIdentifier,
} from "./account-identifier.js";
import {
  issueSessionBundle,
  toSessionBundle,
  type SessionBundle,
  type SessionPrincipal,
} from "./session-bundle.js";
import { GenericAuthenticationError } from "../domain/auth-errors.js";
import type { PasswordHasher } from "../domain/password-hasher.js";
import type { SessionCredentialIssuer } from "../domain/session-credentials.js";

export type LoginInput = {
  accountIdentifier: string;
  password: string;
};

export type LoginResult = SessionBundle & { principal: SessionPrincipal };

const UNKNOWN_ACCOUNT_PASSWORD = "invalid-login-password";

export class Login {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly credentialIssuer: SessionCredentialIssuer,
    private readonly clock: Clock,
    private readonly abuseControl: AuthAbuseControl,
    private readonly auditService: SecurityAuditService,
  ) {}

  async execute(
    credentials: LoginInput,
    context: AuthRequestAbuseContext,
  ): Promise<LoginResult> {
    const accountIdentifier = normalizeAccountIdentifier(
      credentials?.accountIdentifier,
    );
    if (!accountIdentifier || !isValidLoginPassword(credentials?.password)) {
      throw new GenericAuthenticationError();
    }

    try {
      const now = await this.abuseControl.reserveLogin(
        accountIdentifier,
        context,
      );
      const identity =
        await this.repository.findIdentityWithCredential(accountIdentifier);
      if (!identity) {
        await this.passwordHasher.hash(UNKNOWN_ACCOUNT_PASSWORD);
        throw new GenericAuthenticationError();
      }
      if (
        !(await this.passwordHasher.verify(
          credentials.password,
          identity.passwordHash,
        ))
      ) {
        throw new GenericAuthenticationError();
      }

      await this.rehashWhenRequired(identity, credentials.password, now);
      await this.abuseControl.completeLoginSuccess(accountIdentifier);
      const session = issueSessionBundle(this.credentialIssuer, now);
      const familyId = await this.repository.createSessionFamily({
        userId: identity.userId,
        access: session.access,
        refresh: session.refresh,
        now,
        requestCorrelationId: context.requestCorrelationId,
      });
      return {
        ...toSessionBundle(session),
        principal: {
          userId: identity.userId,
          familyId,
          accessSessionId: session.access.id,
          verified: identity.verifiedAt !== null,
          platformRole: identity.platformRole,
          csrfHash: session.access.csrfHash,
        },
      };
    } catch (error) {
      if (error instanceof GenericAuthenticationError) {
        await this.auditService.denied("LOGIN_DENIED", context);
      }
      throw error;
    }
  }

  private async rehashWhenRequired(
    identity: IdentityWithCredential,
    password: string,
    now: Date,
  ): Promise<void> {
    if (!this.passwordHasher.needsRehash(identity.passwordHash)) return;
    await this.repository.updatePasswordHash(
      identity.userId,
      await this.passwordHasher.hash(password),
      now,
    );
  }
}

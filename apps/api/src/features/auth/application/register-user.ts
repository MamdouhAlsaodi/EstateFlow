import type { AuthRepository } from "./auth.repository.js";
import {
  type AuthAbuseControl,
  type AuthRequestAbuseContext,
} from "./auth-abuse-control.js";
import type { Clock } from "./clock.js";
import {
  isValidRegistrationPassword,
  normalizeAccountIdentifier,
} from "./account-identifier.js";
import {
  AuthRateLimitExceededError,
  InvalidRegistrationInputError,
} from "../domain/auth-errors.js";
import type { OneTimeSecretIssuer } from "../domain/one-time-secret.js";
import type { PasswordHasher } from "../domain/password-hasher.js";
import type { SecurityAuditService } from "./security-audit.js";
import type { VerificationDelivery } from "./verification-delivery.js";

const VERIFICATION_LIFETIME_MILLISECONDS = 15 * 60_000;

export type RegisterUserInput = {
  accountIdentifier: string;
  password: string;
};

export type RegisterUserResult = { status: "accepted" };

export class RegisterUser {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly secretIssuer: OneTimeSecretIssuer,
    private readonly delivery: VerificationDelivery,
    private readonly abuseControl: AuthAbuseControl,
    private readonly auditService: SecurityAuditService,
  ) {}

  async execute(
    registration: RegisterUserInput,
    context: AuthRequestAbuseContext,
  ): Promise<RegisterUserResult> {
    const accountIdentifier = normalizeAccountIdentifier(
      registration?.accountIdentifier,
    );
    if (
      !accountIdentifier ||
      !isValidRegistrationPassword(registration?.password)
    ) {
      throw new InvalidRegistrationInputError();
    }
    let now: Date;
    try {
      now = await this.abuseControl.consumeRegistration(
        accountIdentifier,
        context,
      );
    } catch (error) {
      if (error instanceof AuthRateLimitExceededError) {
        await this.auditService.denied("REGISTRATION_DENIED", context);
      }
      throw error;
    }
    const passwordHash = await this.passwordHasher.hash(registration.password);
    const verification = this.issueVerification(now);
    const creation = await this.repository.createIdentity({
      accountIdentifier,
      passwordHash,
      now,
      verificationSecretHash: verification.hash,
      verificationExpiresAt: verification.expiresAt,
      requestCorrelationId: context.requestCorrelationId,
    });
    if (creation.status === "created") {
      await this.delivery.deliver({
        accountIdentifier,
        secret: verification.secret,
        expiresAt: verification.expiresAt,
      });
    } else {
      await this.auditService.allowed("REGISTRATION_ACCEPTED", context);
    }
    return { status: "accepted" };
  }

  private issueVerification(now: Date) {
    const issuedSecret = this.secretIssuer.issue();
    return {
      secret: issuedSecret.secret,
      hash: issuedSecret.hash,
      expiresAt: new Date(now.getTime() + VERIFICATION_LIFETIME_MILLISECONDS),
    };
  }
}

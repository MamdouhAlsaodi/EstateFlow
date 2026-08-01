import type { AuthRepository } from "./auth.repository.js";
import {
  type AuthAbuseControl,
  type AuthRequestAbuseContext,
} from "./auth-abuse-control.js";
import { isValidRegistrationPassword } from "./account-identifier.js";
import type { SecurityAuditService } from "./security-audit.js";
import type { Clock } from "./clock.js";
import {
  AuthRateLimitExceededError,
  InvalidPasswordResetError,
} from "../domain/auth-errors.js";
import {
  isCanonicalOneTimeSecret,
  type OneTimeSecretIssuer,
} from "../domain/one-time-secret.js";
import type { PasswordHasher } from "../domain/password-hasher.js";

export type ResetPasswordInput = {
  secret: string;
  password: string;
};

export type ResetPasswordResult = { status: "reset" };

export class ResetPassword {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly secretIssuer: OneTimeSecretIssuer,
    private readonly clock: Clock,
    private readonly abuseControl: AuthAbuseControl,
    private readonly auditService: SecurityAuditService,
  ) {}

  async execute(
    input: ResetPasswordInput,
    context: AuthRequestAbuseContext,
  ): Promise<ResetPasswordResult> {
    if (
      !isCanonicalOneTimeSecret(input?.secret) ||
      !isValidRegistrationPassword(input?.password)
    ) {
      throw new InvalidPasswordResetError();
    }
    const now = this.clock.now();
    const secretHash = this.secretIssuer.hash(input.secret);
    const userId = await this.repository.findPasswordResetSubject(
      secretHash,
      now,
    );
    try {
      await this.abuseControl.consumePasswordReset(
        userId,
        secretHash,
        context,
        now,
      );
    } catch (error) {
      if (error instanceof AuthRateLimitExceededError) {
        await this.auditService.denied(
          "PASSWORD_RESET_DENIED",
          context,
          userId,
        );
      }
      throw error;
    }
    const passwordHash = await this.passwordHasher.hash(input.password);
    const resetStatus = await this.repository.resetPassword({
      secretHash,
      passwordHash,
      now,
      requestCorrelationId: context.requestCorrelationId,
    });
    if (resetStatus !== "reset") {
      await this.auditService.denied("PASSWORD_RESET_DENIED", context, userId);
      throw new InvalidPasswordResetError();
    }
    return { status: "reset" };
  }
}

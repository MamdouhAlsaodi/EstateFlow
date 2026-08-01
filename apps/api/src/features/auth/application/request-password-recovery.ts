import type { AuthRepository } from "./auth.repository.js";
import {
  type AuthAbuseControl,
  type AuthRequestAbuseContext,
} from "./auth-abuse-control.js";
import { normalizeAccountIdentifier } from "./account-identifier.js";
import { AuthRateLimitExceededError } from "../domain/auth-errors.js";
import type { SecurityAuditService } from "./security-audit.js";
import type { Clock } from "./clock.js";
import type { OneTimeSecretIssuer } from "../domain/one-time-secret.js";
import type { PasswordRecoveryDelivery } from "./verification-delivery.js";

const PASSWORD_RECOVERY_LIFETIME_MILLISECONDS = 15 * 60_000;
const INVALID_PASSWORD_RECOVERY_ACCOUNT_IDENTIFIER =
  "invalid-password-recovery-account";

export type RequestPasswordRecoveryInput = {
  accountIdentifier: string;
};

export type RequestPasswordRecoveryResult = { status: "accepted" };

export class RequestPasswordRecovery {
  constructor(
    private readonly repository: AuthRepository,
    private readonly secretIssuer: OneTimeSecretIssuer,
    private readonly delivery: PasswordRecoveryDelivery,
    private readonly clock: Clock,
    private readonly abuseControl: AuthAbuseControl,
    private readonly auditService: SecurityAuditService,
  ) {}

  async execute(
    input: RequestPasswordRecoveryInput,
    context: AuthRequestAbuseContext,
  ): Promise<RequestPasswordRecoveryResult> {
    const accountIdentifier = normalizeAccountIdentifier(
      input?.accountIdentifier,
    );
    let now: Date;
    try {
      now = await this.abuseControl.consumePasswordRecovery(
        accountIdentifier ?? INVALID_PASSWORD_RECOVERY_ACCOUNT_IDENTIFIER,
        context,
      );
    } catch (error) {
      if (error instanceof AuthRateLimitExceededError) {
        await this.auditService.denied("PASSWORD_RECOVERY_DENIED", context);
      }
      throw error;
    }
    const issuedSecret = this.secretIssuer.issue();
    const expiresAt = new Date(
      now.getTime() + PASSWORD_RECOVERY_LIFETIME_MILLISECONDS,
    );
    const deliveryTarget = await this.repository.createPasswordRecovery({
      accountIdentifier,
      secretHash: issuedSecret.hash,
      now,
      expiresAt,
      requestCorrelationId: context.requestCorrelationId,
    });
    if (deliveryTarget) {
      await this.delivery.deliver({
        accountIdentifier: deliveryTarget.accountIdentifier,
        secret: issuedSecret.secret,
        expiresAt,
      });
    } else {
      await this.auditService.allowed("PASSWORD_RECOVERY_ACCEPTED", context);
    }
    return { status: "accepted" };
  }
}

import type {
  AuthRateLimitEndpoint,
  AuthRepository,
} from "./auth.repository.js";
import type { Clock } from "./clock.js";
import {
  DEFAULT_AUTH_ABUSE_POLICY,
  createAuthAbusePolicy,
  type AuthAbusePolicy,
  type AuthRateLimitPolicy as AbuseRateLimitPolicy,
} from "./auth-abuse-policy.js";
import {
  AuthRateLimitExceededError,
  GenericAuthenticationError,
} from "../domain/auth-errors.js";
import type { AuthKeyHasher } from "../domain/auth-key-hasher.js";

export type AuthRequestAbuseContext = Readonly<{
  clientSourceKeyHash: string;
  requestCorrelationId: string;
}>;

type RateLimitConsumption = Readonly<{
  endpoint: AuthRateLimitEndpoint;
  accountIdentifier: string;
  context: AuthRequestAbuseContext;
  limits: AbuseRateLimitPolicy;
  now: Date;
}>;

export class AuthAbuseControl {
  private readonly policy: AuthAbusePolicy;

  constructor(
    private readonly repository: AuthRepository,
    private readonly keyHasher: AuthKeyHasher,
    private readonly clock: Clock,
    policy: AuthAbusePolicy = DEFAULT_AUTH_ABUSE_POLICY,
  ) {
    this.policy = createAuthAbusePolicy(policy);
  }

  consumeRegistration(
    accountIdentifier: string,
    context: AuthRequestAbuseContext,
  ): Promise<Date> {
    return this.consumeRateLimitedEndpoint(
      "REGISTRATION",
      accountIdentifier,
      context,
      this.policy.registration,
    );
  }

  consumePasswordRecovery(
    accountIdentifier: string,
    context: AuthRequestAbuseContext,
  ): Promise<Date> {
    return this.consumeRateLimitedEndpoint(
      "PASSWORD_RECOVERY",
      accountIdentifier,
      context,
      this.policy.passwordRecovery,
    );
  }

  async consumePasswordReset(
    userId: string | null,
    secretHash: string,
    context: AuthRequestAbuseContext,
    now: Date,
  ): Promise<void> {
    await this.consumeRateLimitedEndpointAt({
      endpoint: "PASSWORD_RESET",
      accountIdentifier: passwordResetSubject(userId, secretHash),
      context,
      limits: this.policy.passwordReset,
      now,
    });
  }

  async consumeRefresh(
    userId: string | null,
    refreshId: string,
    context: AuthRequestAbuseContext,
    now: Date,
  ): Promise<void> {
    await this.consumeRateLimitedEndpointAt({
      endpoint: "REFRESH",
      accountIdentifier: refreshSubject(userId, refreshId),
      context,
      limits: this.policy.refresh,
      now,
    });
  }

  async reserveLogin(
    accountIdentifier: string,
    context: AuthRequestAbuseContext,
  ): Promise<Date> {
    validateRequestContext(context);
    const now = this.clock.now();
    const rateLimitWindowStart = rollingWindowStart(now, this.policy.windowMs);
    const decision = await this.repository.reserveLoginAttempt({
      endpoint: "LOGIN",
      accountKeyHash: this.keyHasher.hashAccount(accountIdentifier),
      clientSourceKeyHash: context.clientSourceKeyHash,
      accountLimit: this.policy.login.accountLimit,
      clientSourceLimit: this.policy.login.clientSourceLimit,
      windowStart: rateLimitWindowStart,
      invalidCredentialsWindowStart: rateLimitWindowStart,
      lockoutWindowStart: rollingWindowStart(now, this.policy.lockoutMs),
      lockoutThreshold: this.policy.lockoutThreshold,
      now,
    });
    if (decision.status !== "reserved") throw new GenericAuthenticationError();
    return now;
  }

  async completeLoginSuccess(accountIdentifier: string): Promise<void> {
    await this.repository.completeLoginSuccess({
      accountKeyHash: this.keyHasher.hashAccount(accountIdentifier),
    });
  }

  private async consumeRateLimitedEndpoint(
    endpoint: AuthRateLimitEndpoint,
    accountIdentifier: string,
    context: AuthRequestAbuseContext,
    limits: AbuseRateLimitPolicy,
  ): Promise<Date> {
    const now = this.clock.now();
    await this.consumeRateLimitedEndpointAt({
      endpoint,
      accountIdentifier,
      context,
      limits,
      now,
    });
    return now;
  }

  private async consumeRateLimitedEndpointAt(
    consumption: RateLimitConsumption,
  ): Promise<void> {
    validateRequestContext(consumption.context);
    const decision = await this.repository.consumeRateLimit({
      endpoint: consumption.endpoint,
      accountKeyHash: this.keyHasher.hashAccount(consumption.accountIdentifier),
      clientSourceKeyHash: consumption.context.clientSourceKeyHash,
      accountLimit: consumption.limits.accountLimit,
      clientSourceLimit: consumption.limits.clientSourceLimit,
      windowStart: rollingWindowStart(consumption.now, this.policy.windowMs),
      now: consumption.now,
    });
    if (decision.status === "rejected") throw new AuthRateLimitExceededError();
  }
}

function passwordResetSubject(
  userId: string | null,
  secretHash: string,
): string {
  return userId
    ? `password-reset-subject:${userId}`
    : `password-reset-subject:unknown:${secretHash}`;
}

function refreshSubject(userId: string | null, refreshId: string): string {
  return userId
    ? `refresh-subject:${userId}`
    : `refresh-subject:unknown:${refreshId}`;
}

function validateRequestContext(context: AuthRequestAbuseContext): void {
  validateRequestCorrelationId(context.requestCorrelationId);
  const clientSourceKeyHash = context.clientSourceKeyHash;
  const decodedHash = Buffer.from(clientSourceKeyHash, "base64url");
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(clientSourceKeyHash) ||
    decodedHash.length !== 32 ||
    decodedHash.toString("base64url") !== clientSourceKeyHash
  ) {
    throw new Error(
      "Client source key hash must be a canonical 43-character base64url HMAC digest",
    );
  }
}

function validateRequestCorrelationId(requestCorrelationId: unknown): void {
  if (
    typeof requestCorrelationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      requestCorrelationId,
    )
  ) {
    throw new Error("Request correlation ID must be a canonical UUID");
  }
}

function rollingWindowStart(now: Date, windowMs: number): Date {
  return new Date(now.getTime() - windowMs);
}

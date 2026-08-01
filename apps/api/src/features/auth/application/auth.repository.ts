import type { CreateSecurityAuditEventInput } from "./security-audit.js";

export type CreateIdentityInput = {
  accountIdentifier: string;
  passwordHash: string;
  verificationSecretHash?: string;
  verificationExpiresAt?: Date;
  now: Date;
  requestCorrelationId: string;
};

export type CreateIdentityResult =
  { status: "created"; userId: string } | { status: "exists" };

export type CreatePasswordRecoveryInput = {
  accountIdentifier: string | null;
  secretHash: string;
  now: Date;
  expiresAt: Date;
  requestCorrelationId: string;
};

export type PasswordRecoveryDeliveryTarget = {
  accountIdentifier: string;
};

export type ResetPasswordInput = {
  secretHash: string;
  passwordHash: string;
  now: Date;
  requestCorrelationId: string;
};

export type PlatformRole = "NONE" | "PLATFORM_ADMIN";

export type IdentityWithCredential = {
  userId: string;
  accountIdentifier: string;
  verifiedAt: Date | null;
  platformRole: PlatformRole;
  passwordHash: string;
};

export type AccessSessionInput = {
  id: string;
  tokenHash: string;
  csrfHash: string;
  issuedAt: Date;
  expiresAt: Date;
};

export type RefreshSessionInput = {
  id: string;
  tokenHash: string;
  csrfHash: string;
  issuedAt: Date;
  absoluteExpiresAt: Date;
  idleExpiresAt: Date;
};

export type CreateSessionInput = {
  userId: string;
  now: Date;
  requestCorrelationId: string;
  access: AccessSessionInput;
  refresh: RefreshSessionInput;
};

export type ActiveAccessSession = {
  userId: string;
  familyId: string;
  accessSessionId: string;
  verified: boolean;
  platformRole: PlatformRole;
  tokenHash: string;
  csrfHash: string;
  expiresAt: Date;
};

export type RefreshRotation = {
  presentedRefreshId: string;
  presentedTokenHash: string;
  presentedCsrfHash: string;
  now: Date;
  nextRefresh: RefreshSessionInput;
  nextAccess: AccessSessionInput;
  requestCorrelationId: string;
};

export type RevokeFamilyInput = {
  familyId: string;
  userId: string;
  reason: "LOGOUT" | "PASSWORD_RESET";
  now: Date;
  requestCorrelationId: string;
};

export type RefreshRotationResult =
  | { status: "rotated"; absoluteExpiresAt: Date }
  | { status: "rejected" }
  | { status: "replayed" };

export interface AuthRepository {
  createIdentity(input: CreateIdentityInput): Promise<CreateIdentityResult>;
  createPasswordRecovery(
    input: CreatePasswordRecoveryInput,
  ): Promise<PasswordRecoveryDeliveryTarget | null>;
  findPasswordResetSubject(
    secretHash: string,
    now: Date,
  ): Promise<string | null>;
  resetPassword(input: ResetPasswordInput): Promise<"reset" | "invalid">;
  findIdentityWithCredential(
    accountIdentifier: string,
  ): Promise<IdentityWithCredential | null>;
  updatePasswordHash(
    userId: string,
    passwordHash: string,
    changedAt: Date,
  ): Promise<void>;
  createSessionFamily(input: CreateSessionInput): Promise<string>;
  findActiveAccessById(
    id: string,
    now: Date,
  ): Promise<ActiveAccessSession | null>;
  findRefreshSubject(
    refreshId: string,
    presentedTokenHash: string,
  ): Promise<string | null>;
  rotateRefresh(rotation: RefreshRotation): Promise<RefreshRotationResult>;
  revokeFamily(input: RevokeFamilyInput): Promise<void>;
  revokeUserFamilies(userId: string, reason: "PASSWORD_RESET"): Promise<void>;
  consumeRateLimit(input: ConsumeRateLimitInput): Promise<RateLimitDecision>;
  reserveLoginAttempt(
    input: ReserveLoginAttemptInput,
  ): Promise<ReserveLoginAttemptResult>;
  completeLoginSuccess(input: CompleteLoginSuccessInput): Promise<void>;
  createSecurityAuditEvent(input: CreateSecurityAuditEventInput): Promise<void>;
}

export type AuthRateLimitEndpoint =
  "REGISTRATION" | "LOGIN" | "PASSWORD_RECOVERY" | "PASSWORD_RESET" | "REFRESH";

export type AuthRateLimitDimension = "ACCOUNT" | "CLIENT_SOURCE";

export type RateLimitDecision =
  | { status: "allowed"; exceededDimensions: [] }
  | { status: "rejected"; exceededDimensions: AuthRateLimitDimension[] };

export type ConsumeRateLimitInput = {
  endpoint: AuthRateLimitEndpoint;
  accountKeyHash: string;
  clientSourceKeyHash: string;
  accountLimit: number;
  clientSourceLimit: number;
  windowStart: Date;
  now: Date;
};

export type ReserveLoginAttemptInput = ConsumeRateLimitInput & {
  invalidCredentialsWindowStart: Date;
  lockoutWindowStart: Date;
  lockoutThreshold: number;
};

export type ReserveLoginAttemptResult =
  | { status: "reserved"; attemptId: string }
  | { status: "locked" }
  | { status: "rate_limited"; exceededDimensions: AuthRateLimitDimension[] };

export type CompleteLoginSuccessInput = {
  accountKeyHash: string;
};

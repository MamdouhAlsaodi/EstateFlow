import { timingSafeEqual } from "node:crypto";
import { Prisma, PrismaClient, SessionRevocationReason } from "@prisma/client";
import type {
  ActiveAccessSession,
  AuthRepository,
  CreateIdentityInput,
  CreateIdentityResult,
  CreatePasswordRecoveryInput,
  PasswordRecoveryDeliveryTarget,
  ResetPasswordInput,
  CreateSessionInput,
  IdentityWithCredential,
  RefreshRotation,
  AuthRateLimitDimension,
  AuthRateLimitEndpoint,
  CompleteLoginSuccessInput,
  ConsumeRateLimitInput,
  RateLimitDecision,
  ReserveLoginAttemptInput,
  ReserveLoginAttemptResult,
  RefreshRotationResult,
  RevokeFamilyInput,
} from "../application/auth.repository.js";
import {
  validateSecurityAuditEvent,
  type CreateSecurityAuditEventInput,
} from "../application/security-audit.js";
import { calculateRefreshIdleExpiry } from "../domain/session-credentials.js";

const MAXIMUM_SERIALIZATION_ATTEMPTS = 3;
const HMAC_SHA256_BASE64URL_LENGTH = 43;
const HMAC_SHA256_DIGEST_BYTES = 32;
const AUTH_RATE_LIMIT_ENDPOINTS = new Set<AuthRateLimitEndpoint>([
  "REGISTRATION",
  "LOGIN",
  "PASSWORD_RECOVERY",
  "PASSWORD_RESET",
  "REFRESH",
]);

const ACTIVE_ACCESS_SELECTION = {
  id: true,
  tokenHash: true,
  csrfHash: true,
  expiresAt: true,
  family: {
    select: {
      id: true,
      userId: true,
      user: { select: { verifiedAt: true, platformRole: true } },
    },
  },
} satisfies Prisma.AccessSessionSelect;

type ActiveAccessRecord = Prisma.AccessSessionGetPayload<{
  select: typeof ACTIVE_ACCESS_SELECTION;
}>;

type RateLimitDimensionInput = {
  dimension: AuthRateLimitDimension;
  keyHash: string;
  limit: number;
};

type AdvisoryLock = {
  endpoint: AuthRateLimitEndpoint;
  dimension: AuthRateLimitDimension;
  keyHash: string;
};

function hashesMatch(presentedHash: string, persistedHash: string): boolean {
  const presented = Buffer.from(presentedHash, "utf8");
  const persisted = Buffer.from(persistedHash, "utf8");
  return (
    presented.length === persisted.length &&
    timingSafeEqual(presented, persisted)
  );
}

function isSerializationConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

function isAccountIdentifierUniqueConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = error.meta?.target;
  return (
    Array.isArray(target) &&
    target.length === 1 &&
    target[0] === "accountIdentifier"
  );
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createIdentity(
    input: CreateIdentityInput,
  ): Promise<CreateIdentityResult> {
    try {
      const createdIdentity = await this.prisma.$transaction((transaction) =>
        this.createIdentityInTransaction(transaction, input),
      );
      return { status: "created", userId: createdIdentity.id };
    } catch (error) {
      if (isAccountIdentifierUniqueConflict(error)) return { status: "exists" };
      throw error;
    }
  }

  private async createIdentityInTransaction(
    transaction: Prisma.TransactionClient,
    input: CreateIdentityInput,
  ) {
    const identity = await transaction.user.create({
      data: {
        accountIdentifier: input.accountIdentifier,
        createdAt: input.now,
        credential: {
          create: {
            passwordHash: input.passwordHash,
            passwordChangedAt: input.now,
          },
        },
        ...(input.verificationSecretHash && input.verificationExpiresAt
          ? {
              emailVerifications: {
                create: {
                  secretHash: input.verificationSecretHash,
                  createdAt: input.now,
                  expiresAt: input.verificationExpiresAt,
                },
              },
            }
          : {}),
      },
      select: { id: true },
    });
    await this.createTransactionalAuditEvent(transaction, {
      subjectId: identity.id,
      outcome: "ALLOWED",
      reason: "REGISTRATION_ACCEPTED",
      requestCorrelationId: input.requestCorrelationId,
      now: input.now,
    });
    return identity;
  }

  async createPasswordRecovery(
    input: CreatePasswordRecoveryInput,
  ): Promise<PasswordRecoveryDeliveryTarget | null> {
    if (!input.accountIdentifier) return null;
    return this.prisma.$transaction((transaction) =>
      this.createPasswordRecoveryInTransaction(transaction, input),
    );
  }

  private async createPasswordRecoveryInTransaction(
    transaction: Prisma.TransactionClient,
    input: CreatePasswordRecoveryInput,
  ): Promise<PasswordRecoveryDeliveryTarget | null> {
    const identity = await transaction.user.findUnique({
      where: { accountIdentifier: input.accountIdentifier! },
      select: { id: true, accountIdentifier: true },
    });
    if (!identity) return null;
    await transaction.passwordReset.create({
      data: {
        userId: identity.id,
        secretHash: input.secretHash,
        createdAt: input.now,
        expiresAt: input.expiresAt,
      },
    });
    await this.createTransactionalAuditEvent(transaction, {
      subjectId: identity.id,
      outcome: "ALLOWED",
      reason: "PASSWORD_RECOVERY_ACCEPTED",
      requestCorrelationId: input.requestCorrelationId,
      now: input.now,
    });
    return { accountIdentifier: identity.accountIdentifier };
  }

  async findPasswordResetSubject(
    secretHash: string,
    now: Date,
  ): Promise<string | null> {
    const passwordReset = await this.prisma.passwordReset.findFirst({
      where: {
        secretHash,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      select: { userId: true },
    });
    return passwordReset?.userId ?? null;
  }

  async resetPassword(input: ResetPasswordInput): Promise<"reset" | "invalid"> {
    for (
      let attempt = 1;
      attempt <= MAXIMUM_SERIALIZATION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(
          (transaction) => this.resetPasswordInTransaction(transaction, input),
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        if (
          !isSerializationConflict(error) ||
          attempt === MAXIMUM_SERIALIZATION_ATTEMPTS
        ) {
          throw error;
        }
      }
    }
    throw new Error("Unreachable serialization retry state");
  }

  private async resetPasswordInTransaction(
    transaction: Prisma.TransactionClient,
    input: ResetPasswordInput,
  ): Promise<"reset" | "invalid"> {
    const passwordReset = await transaction.passwordReset.findFirst({
      where: {
        secretHash: input.secretHash,
        consumedAt: null,
        expiresAt: { gt: input.now },
      },
      select: { id: true, userId: true },
    });
    if (!passwordReset) return "invalid";
    const consumption = await transaction.passwordReset.updateMany({
      where: {
        id: passwordReset.id,
        consumedAt: null,
        expiresAt: { gt: input.now },
      },
      data: { consumedAt: input.now },
    });
    if (consumption.count !== 1) return "invalid";
    await transaction.credential.update({
      where: { userId: passwordReset.userId },
      data: { passwordHash: input.passwordHash, passwordChangedAt: input.now },
    });
    await transaction.passwordReset.updateMany({
      where: {
        userId: passwordReset.userId,
        id: { not: passwordReset.id },
        consumedAt: null,
      },
      data: { consumedAt: input.now },
    });
    await transaction.sessionFamily.updateMany({
      where: { userId: passwordReset.userId, revokedAt: null },
      data: {
        revokedAt: input.now,
        revokedReason: SessionRevocationReason.PASSWORD_RESET,
      },
    });
    await this.createTransactionalAuditEvent(transaction, {
      subjectId: passwordReset.userId,
      outcome: "ALLOWED",
      reason: "PASSWORD_RESET_ALLOWED",
      requestCorrelationId: input.requestCorrelationId,
      now: input.now,
    });
    return "reset";
  }

  async findIdentityWithCredential(
    accountIdentifier: string,
  ): Promise<IdentityWithCredential | null> {
    const identity = await this.prisma.user.findUnique({
      where: { accountIdentifier },
      select: {
        id: true,
        accountIdentifier: true,
        verifiedAt: true,
        platformRole: true,
        credential: { select: { passwordHash: true } },
      },
    });
    if (!identity?.credential) return null;
    return {
      userId: identity.id,
      accountIdentifier: identity.accountIdentifier,
      verifiedAt: identity.verifiedAt,
      platformRole: identity.platformRole,
      passwordHash: identity.credential.passwordHash,
    };
  }

  async updatePasswordHash(
    userId: string,
    passwordHash: string,
    changedAt: Date,
  ): Promise<void> {
    await this.prisma.credential.update({
      where: { userId },
      data: { passwordHash, passwordChangedAt: changedAt },
    });
  }

  async createSessionFamily(input: CreateSessionInput): Promise<string> {
    const family = await this.prisma.$transaction(async (transaction) => {
      const createdFamily = await transaction.sessionFamily.create({
        data: {
          userId: input.userId,
          accessSessions: { create: input.access },
          refreshSessions: {
            create: { ...input.refresh, lastUsedAt: input.refresh.issuedAt },
          },
        },
        select: { id: true },
      });
      await this.createTransactionalAuditEvent(transaction, {
        subjectId: input.userId,
        outcome: "ALLOWED",
        reason: "LOGIN_ALLOWED",
        requestCorrelationId: input.requestCorrelationId,
        now: input.now,
      });
      return createdFamily;
    });
    return family.id;
  }

  async findActiveAccessById(
    id: string,
    now: Date,
  ): Promise<ActiveAccessSession | null> {
    const access = await this.prisma.accessSession.findFirst({
      where: {
        id,
        revokedAt: null,
        expiresAt: { gt: now },
        family: { revokedAt: null },
      },
      select: ACTIVE_ACCESS_SELECTION,
    });
    return access ? this.toActiveAccessSession(access) : null;
  }

  private toActiveAccessSession(
    access: ActiveAccessRecord,
  ): ActiveAccessSession {
    return {
      userId: access.family.userId,
      familyId: access.family.id,
      accessSessionId: access.id,
      verified: access.family.user.verifiedAt !== null,
      platformRole: access.family.user.platformRole,
      tokenHash: access.tokenHash,
      csrfHash: access.csrfHash,
      expiresAt: access.expiresAt,
    };
  }

  async findRefreshSubject(
    refreshId: string,
    presentedTokenHash: string,
  ): Promise<string | null> {
    const refresh = await this.prisma.refreshSession.findUnique({
      where: { id: refreshId },
      select: {
        tokenHash: true,
        family: { select: { userId: true } },
      },
    });
    return refresh && hashesMatch(presentedTokenHash, refresh.tokenHash)
      ? refresh.family.userId
      : null;
  }

  async rotateRefresh(
    rotation: RefreshRotation,
  ): Promise<RefreshRotationResult> {
    for (
      let attempt = 1;
      attempt <= MAXIMUM_SERIALIZATION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(
          (transaction) => this.rotateInTransaction(transaction, rotation),
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        if (
          !isSerializationConflict(error) ||
          attempt === MAXIMUM_SERIALIZATION_ATTEMPTS
        ) {
          throw error;
        }
      }
    }
    throw new Error("Unreachable serialization retry state");
  }

  private async rotateInTransaction(
    transaction: Prisma.TransactionClient,
    rotation: RefreshRotation,
  ): Promise<RefreshRotationResult> {
    const refresh = await transaction.refreshSession.findUnique({
      where: { id: rotation.presentedRefreshId },
      select: {
        familyId: true,
        absoluteExpiresAt: true,
        tokenHash: true,
        csrfHash: true,
        family: { select: { userId: true } },
      },
    });
    if (
      !refresh ||
      !hashesMatch(rotation.presentedTokenHash, refresh.tokenHash) ||
      !hashesMatch(rotation.presentedCsrfHash, refresh.csrfHash)
    ) {
      await this.createTransactionalAuditEvent(transaction, {
        subjectId: null,
        outcome: "DENIED",
        reason: "REFRESH_DENIED",
        requestCorrelationId: rotation.requestCorrelationId,
        now: rotation.now,
      });
      return { status: "rejected" };
    }
    const consumed = await transaction.refreshSession.updateMany({
      where: {
        id: rotation.presentedRefreshId,
        consumedAt: null,
        revokedAt: null,
        idleExpiresAt: { gt: rotation.now },
        absoluteExpiresAt: { gt: rotation.now },
        family: { revokedAt: null },
      },
      data: { consumedAt: rotation.now, lastUsedAt: rotation.now },
    });
    if (consumed.count !== 1) {
      const result = await this.rejectOrRevokeReplay(transaction, rotation);
      await this.createTransactionalAuditEvent(transaction, {
        subjectId: result.status === "replayed" ? refresh.family.userId : null,
        outcome: "DENIED",
        reason: "REFRESH_DENIED",
        requestCorrelationId: rotation.requestCorrelationId,
        now: rotation.now,
      });
      return result;
    }
    await this.createReplacementSessions(
      transaction,
      refresh.familyId,
      refresh.absoluteExpiresAt,
      rotation,
    );
    await this.createTransactionalAuditEvent(transaction, {
      subjectId: refresh.family.userId,
      outcome: "ALLOWED",
      reason: "REFRESH_ALLOWED",
      requestCorrelationId: rotation.requestCorrelationId,
      now: rotation.now,
    });
    return {
      status: "rotated",
      absoluteExpiresAt: new Date(refresh.absoluteExpiresAt),
    };
  }

  private async createReplacementSessions(
    transaction: Prisma.TransactionClient,
    familyId: string,
    absoluteExpiresAt: Date,
    rotation: RefreshRotation,
  ): Promise<void> {
    await transaction.refreshSession.create({
      data: {
        ...rotation.nextRefresh,
        familyId,
        absoluteExpiresAt,
        idleExpiresAt: calculateRefreshIdleExpiry(
          rotation.now,
          absoluteExpiresAt,
        ),
        lastUsedAt: rotation.now,
      },
    });
    await transaction.accessSession.create({
      data: { ...rotation.nextAccess, familyId },
    });
    await transaction.refreshSession.update({
      where: { id: rotation.presentedRefreshId },
      data: { replacedById: rotation.nextRefresh.id },
    });
  }

  async revokeFamily(input: RevokeFamilyInput): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.sessionFamily.updateMany({
        where: { id: input.familyId, revokedAt: null },
        data: { revokedAt: input.now, revokedReason: input.reason },
      });
      if (input.reason === "LOGOUT") {
        await this.createTransactionalAuditEvent(transaction, {
          subjectId: input.userId,
          outcome: "ALLOWED",
          reason: "LOGOUT_ALLOWED",
          requestCorrelationId: input.requestCorrelationId,
          now: input.now,
        });
      }
    });
  }

  async revokeUserFamilies(
    userId: string,
    reason: "PASSWORD_RESET",
  ): Promise<void> {
    await this.prisma.sessionFamily.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async createTransactionalAuditEvent(
    transaction: Prisma.TransactionClient,
    event: CreateSecurityAuditEventInput,
  ): Promise<void> {
    validateSecurityAuditEvent(event);
    await transaction.securityAuditEvent.create({
      data: {
        subjectId: event.subjectId,
        outcome: event.outcome,
        reason: event.reason,
        requestCorrelationId: event.requestCorrelationId,
        createdAt: event.now,
      },
    });
  }

  async consumeRateLimit(
    input: ConsumeRateLimitInput,
  ): Promise<RateLimitDecision> {
    this.validateRateLimitInput(input);
    return this.runLockedReadCommittedTransaction(async (transaction) => {
      await this.acquireRateLocks(transaction, input);
      return this.consumeRateLimitWithHeldLocks(transaction, input);
    });
  }

  async reserveLoginAttempt(
    input: ReserveLoginAttemptInput,
  ): Promise<ReserveLoginAttemptResult> {
    this.validateLoginAttemptInput(input);
    return this.runLockedReadCommittedTransaction(async (transaction) => {
      await this.acquireRateLocks(transaction, input);
      const rateDecision = await this.consumeRateLimitWithHeldLocks(
        transaction,
        input,
      );
      if (rateDecision.status === "rejected") {
        return this.recordRateLimitedAttempt(transaction, input, rateDecision);
      }
      if (await this.hasActiveLockMarker(transaction, input))
        return { status: "locked" };
      return this.reserveInvalidCredentials(transaction, input);
    });
  }

  async completeLoginSuccess(input: CompleteLoginSuccessInput): Promise<void> {
    this.validateKeyHash(input.accountKeyHash);
    await this.runLockedReadCommittedTransaction(async (transaction) => {
      await this.acquireAdvisoryLocks(transaction, [
        {
          endpoint: "LOGIN",
          dimension: "ACCOUNT",
          keyHash: input.accountKeyHash,
        },
      ]);
      await transaction.authAttempt.deleteMany({
        where: { accountKeyHash: input.accountKeyHash },
      });
    });
  }

  async createSecurityAuditEvent(
    input: CreateSecurityAuditEventInput,
  ): Promise<void> {
    validateSecurityAuditEvent(input);
    await this.prisma.securityAuditEvent.create({
      data: {
        subjectId: input.subjectId,
        outcome: input.outcome,
        reason: input.reason,
        requestCorrelationId: input.requestCorrelationId,
        createdAt: input.now,
      },
    });
  }

  private async consumeRateLimitWithHeldLocks(
    transaction: Prisma.TransactionClient,
    input: ConsumeRateLimitInput,
  ): Promise<RateLimitDecision> {
    const dimensions = this.rateLimitDimensions(input);
    const counts = await Promise.all(
      dimensions.map((dimension) =>
        this.countRateLimitEvents(transaction, input, dimension),
      ),
    );
    const exceededDimensions = counts
      .filter(({ count, limit }) => count >= limit)
      .map(({ dimension }) => dimension);
    return this.persistRateLimitDecision(
      transaction,
      input,
      dimensions,
      exceededDimensions,
    );
  }

  private rateLimitDimensions(
    input: ConsumeRateLimitInput,
  ): RateLimitDimensionInput[] {
    return [
      {
        dimension: "ACCOUNT",
        keyHash: input.accountKeyHash,
        limit: input.accountLimit,
      },
      {
        dimension: "CLIENT_SOURCE",
        keyHash: input.clientSourceKeyHash,
        limit: input.clientSourceLimit,
      },
    ];
  }

  private async countRateLimitEvents(
    transaction: Prisma.TransactionClient,
    input: ConsumeRateLimitInput,
    dimension: RateLimitDimensionInput,
  ): Promise<RateLimitDimensionInput & { count: number }> {
    const count = await transaction.authRateLimitEvent.count({
      where: {
        endpoint: input.endpoint,
        dimension: dimension.dimension,
        keyHash: dimension.keyHash,
        createdAt: { gte: input.windowStart },
      },
    });
    return { ...dimension, count };
  }

  private async persistRateLimitDecision(
    transaction: Prisma.TransactionClient,
    input: ConsumeRateLimitInput,
    dimensions: RateLimitDimensionInput[],
    exceededDimensions: AuthRateLimitDimension[],
  ): Promise<RateLimitDecision> {
    const outcome = exceededDimensions.length === 0 ? "ALLOWED" : "REJECTED";
    await transaction.authRateLimitEvent.createMany({
      data: dimensions.map(({ dimension, keyHash }) => ({
        endpoint: input.endpoint,
        dimension,
        keyHash,
        outcome,
        createdAt: input.now,
      })),
    });
    return exceededDimensions.length === 0
      ? { status: "allowed", exceededDimensions: [] }
      : { status: "rejected", exceededDimensions };
  }

  private async hasActiveLockMarker(
    transaction: Prisma.TransactionClient,
    input: ReserveLoginAttemptInput,
  ): Promise<boolean> {
    const marker = await transaction.authAttempt.findFirst({
      where: {
        accountKeyHash: input.accountKeyHash,
        reason: "ACCOUNT_LOCKED",
        createdAt: { gte: input.lockoutWindowStart },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return marker !== null;
  }

  private async recordRateLimitedAttempt(
    transaction: Prisma.TransactionClient,
    input: ReserveLoginAttemptInput,
    decision: Extract<RateLimitDecision, { status: "rejected" }>,
  ): Promise<ReserveLoginAttemptResult> {
    await this.createAuthAttempt(transaction, input, "RATE_LIMITED");
    return {
      status: "rate_limited",
      exceededDimensions: decision.exceededDimensions,
    };
  }

  private async reserveInvalidCredentials(
    transaction: Prisma.TransactionClient,
    input: ReserveLoginAttemptInput,
  ): Promise<ReserveLoginAttemptResult> {
    const priorCount = await transaction.authAttempt.count({
      where: {
        accountKeyHash: input.accountKeyHash,
        reason: "INVALID_CREDENTIALS",
        createdAt: { gte: input.invalidCredentialsWindowStart },
      },
    });
    const attemptId = await this.createAuthAttempt(
      transaction,
      input,
      "INVALID_CREDENTIALS",
    );
    if (priorCount + 1 >= input.lockoutThreshold) {
      await this.createAuthAttempt(transaction, input, "ACCOUNT_LOCKED");
    }
    return { status: "reserved", attemptId };
  }

  private async createAuthAttempt(
    transaction: Prisma.TransactionClient,
    input: ReserveLoginAttemptInput,
    reason: "INVALID_CREDENTIALS" | "ACCOUNT_LOCKED" | "RATE_LIMITED",
  ): Promise<string> {
    const attempt = await transaction.authAttempt.create({
      data: {
        accountKeyHash: input.accountKeyHash,
        clientSourceKeyHash: input.clientSourceKeyHash,
        reason,
        createdAt: input.now,
      },
      select: { id: true },
    });
    return attempt.id;
  }

  private async acquireRateLocks(
    transaction: Prisma.TransactionClient,
    input: ConsumeRateLimitInput,
  ): Promise<void> {
    await this.acquireAdvisoryLocks(
      transaction,
      this.rateLimitDimensions(input).map(({ dimension, keyHash }) => ({
        endpoint: input.endpoint,
        dimension,
        keyHash,
      })),
    );
  }

  private async acquireAdvisoryLocks(
    transaction: Prisma.TransactionClient,
    locks: AdvisoryLock[],
  ): Promise<void> {
    const lockKeys = [
      ...new Set(
        locks.map(
          ({ endpoint, dimension, keyHash }) =>
            `${endpoint}:${dimension}:${keyHash}`,
        ),
      ),
    ].sort();
    for (const lockKey of lockKeys) {
      await transaction.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );
    }
  }

  private async runLockedReadCommittedTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (
      let attempt = 1;
      attempt <= MAXIMUM_SERIALIZATION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: "ReadCommitted",
        });
      } catch (error) {
        if (
          !isSerializationConflict(error) ||
          attempt === MAXIMUM_SERIALIZATION_ATTEMPTS
        ) {
          throw error;
        }
      }
    }
    throw new Error("Unreachable serialization retry state");
  }

  private validateLoginAttemptInput(input: ReserveLoginAttemptInput): void {
    this.validateRateLimitInput(input);
    this.validateWindowStart(input.invalidCredentialsWindowStart, input.now);
    this.validateWindowStart(input.lockoutWindowStart, input.now);
    this.validatePositiveSafeInteger(input.lockoutThreshold);
  }

  private validateRateLimitInput(input: ConsumeRateLimitInput): void {
    this.validateRateLimitEndpoint(input.endpoint);
    this.validateKeyHash(input.accountKeyHash);
    this.validateKeyHash(input.clientSourceKeyHash);
    this.validatePositiveSafeInteger(input.accountLimit);
    this.validatePositiveSafeInteger(input.clientSourceLimit);
    this.validateWindowStart(input.windowStart, input.now);
  }

  private validateRateLimitEndpoint(
    value: unknown,
  ): asserts value is AuthRateLimitEndpoint {
    if (
      typeof value !== "string" ||
      !AUTH_RATE_LIMIT_ENDPOINTS.has(value as AuthRateLimitEndpoint)
    ) {
      throw new Error(
        "Rate-limit input requires a supported rate-limit endpoint",
      );
    }
  }

  private validateKeyHash(value: unknown): void {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
      throw new Error(
        "Key hash must be a canonical 43-character base64url HMAC digest",
      );
    }
    const decodedHash = Buffer.from(value, "base64url");
    if (
      decodedHash.length !== HMAC_SHA256_DIGEST_BYTES ||
      value.length !== HMAC_SHA256_BASE64URL_LENGTH ||
      decodedHash.toString("base64url") !== value
    ) {
      throw new Error(
        "Key hash must be a canonical 43-character base64url HMAC digest",
      );
    }
  }

  private validatePositiveSafeInteger(value: number): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(
        "Rate limits and lockout thresholds must be positive safe integers",
      );
    }
  }

  private validateWindowStart(windowStart: Date, now: Date): void {
    if (
      Number.isNaN(windowStart.getTime()) ||
      Number.isNaN(now.getTime()) ||
      windowStart > now
    ) {
      throw new Error("Rate-limit inputs require coherent Date inputs");
    }
  }

  private async rejectOrRevokeReplay(
    transaction: Prisma.TransactionClient,
    rotation: RefreshRotation,
  ): Promise<RefreshRotationResult> {
    const refresh = await transaction.refreshSession.findUnique({
      where: { id: rotation.presentedRefreshId },
      select: { consumedAt: true, familyId: true },
    });
    if (!refresh?.consumedAt) return { status: "rejected" };
    await transaction.sessionFamily.updateMany({
      where: { id: refresh.familyId, revokedAt: null },
      data: {
        revokedAt: rotation.now,
        revokedReason: SessionRevocationReason.REFRESH_REPLAY,
      },
    });
    return { status: "replayed" };
  }
}

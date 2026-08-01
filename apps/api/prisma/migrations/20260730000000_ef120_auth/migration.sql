-- CreateEnum
CREATE TYPE "SessionRevocationReason" AS ENUM ('LOGOUT', 'REFRESH_REPLAY', 'PASSWORD_RESET', 'SECURITY_EVENT');

-- CreateEnum
CREATE TYPE "AuthAttemptReason" AS ENUM ('INVALID_CREDENTIALS', 'ACCOUNT_LOCKED', 'RATE_LIMITED');

-- CreateEnum
CREATE TYPE "AuthRateLimitEndpoint" AS ENUM ('REGISTRATION', 'LOGIN', 'PASSWORD_RECOVERY', 'PASSWORD_RESET', 'REFRESH');

-- CreateEnum
CREATE TYPE "AuthRateLimitDimension" AS ENUM ('ACCOUNT', 'CLIENT_SOURCE');

-- CreateEnum
CREATE TYPE "AuthRateLimitOutcome" AS ENUM ('ALLOWED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SecurityAuditOutcome" AS ENUM ('ALLOWED', 'DENIED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountIdentifier" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMPTZ(6),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordChangedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionFamily" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(6),
    "revokedReason" "SessionRevocationReason",

    CONSTRAINT "SessionFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessSession" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMPTZ(6) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "AccessSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMPTZ(6) NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(6) NOT NULL,
    "absoluteExpiresAt" TIMESTAMPTZ(6) NOT NULL,
    "idleExpiresAt" TIMESTAMPTZ(6) NOT NULL,
    "consumedAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),
    "replacedById" UUID,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "secretHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "consumedAt" TIMESTAMPTZ(6),

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "secretHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "consumedAt" TIMESTAMPTZ(6),

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAttempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountKeyHash" TEXT NOT NULL,
    "clientSourceKeyHash" TEXT NOT NULL,
    "reason" "AuthAttemptReason" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthRateLimitEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "endpoint" "AuthRateLimitEndpoint" NOT NULL,
    "dimension" "AuthRateLimitDimension" NOT NULL,
    "keyHash" TEXT NOT NULL,
    "outcome" "AuthRateLimitOutcome" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthRateLimitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAuditEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subjectId" UUID,
    "outcome" "SecurityAuditOutcome" NOT NULL,
    "reason" TEXT NOT NULL,
    "requestCorrelationId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_accountIdentifier_key" ON "User"("accountIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_userId_key" ON "Credential"("userId");

-- CreateIndex
CREATE INDEX "SessionFamily_userId_revokedAt_idx" ON "SessionFamily"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccessSession_tokenHash_key" ON "AccessSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AccessSession_familyId_revokedAt_idx" ON "AccessSession"("familyId", "revokedAt");

-- CreateIndex
CREATE INDEX "AccessSession_expiresAt_idx" ON "AccessSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_replacedById_key" ON "RefreshSession"("replacedById");

-- CreateIndex
CREATE INDEX "RefreshSession_familyId_revokedAt_idx" ON "RefreshSession"("familyId", "revokedAt");

-- CreateIndex
CREATE INDEX "RefreshSession_idleExpiresAt_idx" ON "RefreshSession"("idleExpiresAt");

-- CreateIndex
CREATE INDEX "RefreshSession_absoluteExpiresAt_idx" ON "RefreshSession"("absoluteExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_secretHash_key" ON "PasswordReset"("secretHash");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_consumedAt_expiresAt_idx" ON "PasswordReset"("userId", "consumedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerification_secretHash_key" ON "EmailVerification"("secretHash");

-- CreateIndex
CREATE INDEX "EmailVerification_userId_consumedAt_expiresAt_idx" ON "EmailVerification"("userId", "consumedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthAttempt_accountKeyHash_createdAt_idx" ON "AuthAttempt"("accountKeyHash", "createdAt");

-- CreateIndex
CREATE INDEX "AuthAttempt_clientSourceKeyHash_createdAt_idx" ON "AuthAttempt"("clientSourceKeyHash", "createdAt");

-- CreateIndex
CREATE INDEX "AuthRateLimitEvent_endpoint_dimension_keyHash_createdAt_idx" ON "AuthRateLimitEvent"("endpoint", "dimension", "keyHash", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityAuditEvent_subjectId_createdAt_idx" ON "SecurityAuditEvent"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityAuditEvent_createdAt_idx" ON "SecurityAuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionFamily" ADD CONSTRAINT "SessionFamily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessSession" ADD CONSTRAINT "AccessSession_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "SessionFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "SessionFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "RefreshSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerification" ADD CONSTRAINT "EmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

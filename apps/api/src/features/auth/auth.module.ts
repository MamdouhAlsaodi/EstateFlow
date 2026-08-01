import { Module } from "@nestjs/common";
import {
  loadRuntimeConfig,
  RuntimeConfigError,
  type RuntimeConfig,
} from "../../bootstrap/config.js";
import { PrismaService } from "../../database/prisma.service.js";
import { AuthAbuseControl } from "./application/auth-abuse-control.js";
import { AuthenticateAccess } from "./application/authenticate-access.js";
import type { AuthRepository } from "./application/auth.repository.js";
import type { Clock } from "./application/clock.js";
import { SystemClock } from "./application/clock.js";
import { GetSession } from "./application/get-session.js";
import { Login } from "./application/login.js";
import { Logout } from "./application/logout.js";
import { RefreshSession } from "./application/refresh-session.js";
import { RegisterUser } from "./application/register-user.js";
import { RequestPasswordRecovery } from "./application/request-password-recovery.js";
import { ResetPassword } from "./application/reset-password.js";
import { SecurityAuditService } from "./application/security-audit.js";
import type {
  PasswordRecoveryDelivery,
  VerificationDelivery,
} from "./application/verification-delivery.js";
import {
  AUTH_ABUSE_CONTROL,
  AUTH_CLOCK,
  AUTH_FAKE_DELIVERY,
  AUTH_KEY_HASHER,
  AUTH_REPOSITORY,
  AUTH_RUNTIME_CONFIG,
  AUTH_SECURITY_AUDIT_SERVICE,
  ONE_TIME_SECRET_ISSUER,
  PASSWORD_HASHER,
  PASSWORD_RECOVERY_DELIVERY,
  SESSION_CREDENTIAL_ISSUER,
  VERIFICATION_DELIVERY,
} from "./auth.tokens.js";
import type { AuthKeyHasher } from "./domain/auth-key-hasher.js";
import type { OneTimeSecretIssuer } from "./domain/one-time-secret.js";
import type { PasswordHasher } from "./domain/password-hasher.js";
import type { SessionCredentialIssuer } from "./domain/session-credentials.js";
import { InMemoryAuthDelivery } from "./infrastructure/in-memory-auth-delivery.js";
import { NodeCryptoAuthKeyHasher } from "./infrastructure/node-crypto-auth-key-hasher.js";
import { NodeCryptoCredentialIssuer } from "./infrastructure/node-crypto-credential-issuer.js";
import { NodeCryptoOneTimeSecretIssuer } from "./infrastructure/node-crypto-one-time-secret-issuer.js";
import { NodeCryptoPasswordHasher } from "./infrastructure/node-crypto-password-hasher.js";
import { PrismaAuthRepository } from "./infrastructure/prisma-auth.repository.js";
import { AuthController } from "./http/auth.controller.js";
import { AuthCookieService } from "./http/auth-cookie.service.js";
import { AuthRequestContextFactory } from "./http/auth-request-context.factory.js";
import { BrowserSessionGuard } from "./http/browser-session.guard.js";
import { CsrfGuard } from "./http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "./http/origin.guard.js";
import { RefreshCsrfGuard } from "./http/refresh-csrf.guard.js";

@Module({
  controllers: [AuthController],
  providers: [
    { provide: AUTH_RUNTIME_CONFIG, useFactory: loadRuntimeConfig },
    {
      provide: AUTH_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): AuthRepository =>
        new PrismaAuthRepository(prisma),
    },
    {
      provide: PASSWORD_HASHER,
      useFactory: (): PasswordHasher => new NodeCryptoPasswordHasher(),
    },
    {
      provide: SESSION_CREDENTIAL_ISSUER,
      inject: [AUTH_RUNTIME_CONFIG],
      useFactory: (config: RuntimeConfig): SessionCredentialIssuer =>
        new NodeCryptoCredentialIssuer(config.authHashKey),
    },
    {
      provide: ONE_TIME_SECRET_ISSUER,
      inject: [AUTH_RUNTIME_CONFIG],
      useFactory: (config: RuntimeConfig): OneTimeSecretIssuer =>
        new NodeCryptoOneTimeSecretIssuer(config.authHashKey),
    },
    {
      provide: AUTH_KEY_HASHER,
      inject: [AUTH_RUNTIME_CONFIG],
      useFactory: (config: RuntimeConfig): AuthKeyHasher =>
        new NodeCryptoAuthKeyHasher(config.auditHashKey),
    },
    { provide: AUTH_CLOCK, useValue: SystemClock },
    {
      provide: AUTH_ABUSE_CONTROL,
      inject: [AUTH_REPOSITORY, AUTH_KEY_HASHER, AUTH_CLOCK],
      useFactory: (
        repository: AuthRepository,
        keyHasher: AuthKeyHasher,
        clock: Clock,
      ): AuthAbuseControl => new AuthAbuseControl(repository, keyHasher, clock),
    },
    {
      provide: AUTH_SECURITY_AUDIT_SERVICE,
      inject: [AUTH_REPOSITORY, AUTH_CLOCK],
      useFactory: (
        repository: AuthRepository,
        clock: Clock,
      ): SecurityAuditService => new SecurityAuditService(repository, clock),
    },
    {
      provide: AUTH_FAKE_DELIVERY,
      inject: [AUTH_RUNTIME_CONFIG],
      useFactory: createTestAuthDelivery,
    },
    { provide: VERIFICATION_DELIVERY, useExisting: AUTH_FAKE_DELIVERY },
    { provide: PASSWORD_RECOVERY_DELIVERY, useExisting: AUTH_FAKE_DELIVERY },
    {
      provide: RegisterUser,
      inject: [
        AUTH_REPOSITORY,
        PASSWORD_HASHER,
        AUTH_CLOCK,
        ONE_TIME_SECRET_ISSUER,
        VERIFICATION_DELIVERY,
        AUTH_ABUSE_CONTROL,
        AUTH_SECURITY_AUDIT_SERVICE,
      ],
      useFactory: (
        repository: AuthRepository,
        passwordHasher: PasswordHasher,
        clock: Clock,
        secretIssuer: OneTimeSecretIssuer,
        delivery: VerificationDelivery,
        abuseControl: AuthAbuseControl,
        auditService: SecurityAuditService,
      ) =>
        new RegisterUser(
          repository,
          passwordHasher,
          clock,
          secretIssuer,
          delivery,
          abuseControl,
          auditService,
        ),
    },
    {
      provide: Login,
      inject: [
        AUTH_REPOSITORY,
        PASSWORD_HASHER,
        SESSION_CREDENTIAL_ISSUER,
        AUTH_CLOCK,
        AUTH_ABUSE_CONTROL,
        AUTH_SECURITY_AUDIT_SERVICE,
      ],
      useFactory: (
        repository: AuthRepository,
        passwordHasher: PasswordHasher,
        credentialIssuer: SessionCredentialIssuer,
        clock: Clock,
        abuseControl: AuthAbuseControl,
        auditService: SecurityAuditService,
      ) =>
        new Login(
          repository,
          passwordHasher,
          credentialIssuer,
          clock,
          abuseControl,
          auditService,
        ),
    },
    {
      provide: RequestPasswordRecovery,
      inject: [
        AUTH_REPOSITORY,
        ONE_TIME_SECRET_ISSUER,
        PASSWORD_RECOVERY_DELIVERY,
        AUTH_CLOCK,
        AUTH_ABUSE_CONTROL,
        AUTH_SECURITY_AUDIT_SERVICE,
      ],
      useFactory: (
        repository: AuthRepository,
        secretIssuer: OneTimeSecretIssuer,
        delivery: PasswordRecoveryDelivery,
        clock: Clock,
        abuseControl: AuthAbuseControl,
        auditService: SecurityAuditService,
      ) =>
        new RequestPasswordRecovery(
          repository,
          secretIssuer,
          delivery,
          clock,
          abuseControl,
          auditService,
        ),
    },
    {
      provide: ResetPassword,
      inject: [
        AUTH_REPOSITORY,
        PASSWORD_HASHER,
        ONE_TIME_SECRET_ISSUER,
        AUTH_CLOCK,
        AUTH_ABUSE_CONTROL,
        AUTH_SECURITY_AUDIT_SERVICE,
      ],
      useFactory: (
        repository: AuthRepository,
        passwordHasher: PasswordHasher,
        secretIssuer: OneTimeSecretIssuer,
        clock: Clock,
        abuseControl: AuthAbuseControl,
        auditService: SecurityAuditService,
      ) =>
        new ResetPassword(
          repository,
          passwordHasher,
          secretIssuer,
          clock,
          abuseControl,
          auditService,
        ),
    },
    {
      provide: RefreshSession,
      inject: [
        AUTH_REPOSITORY,
        SESSION_CREDENTIAL_ISSUER,
        AUTH_CLOCK,
        AUTH_ABUSE_CONTROL,
        AUTH_SECURITY_AUDIT_SERVICE,
      ],
      useFactory: (
        repository: AuthRepository,
        credentialIssuer: SessionCredentialIssuer,
        clock: Clock,
        abuseControl: AuthAbuseControl,
        auditService: SecurityAuditService,
      ) =>
        new RefreshSession(
          repository,
          credentialIssuer,
          clock,
          abuseControl,
          auditService,
        ),
    },
    {
      provide: AuthRequestContextFactory,
      inject: [AUTH_KEY_HASHER],
      useFactory: (keyHasher: AuthKeyHasher) =>
        new AuthRequestContextFactory(keyHasher),
    },
    {
      provide: AuthenticateAccess,
      inject: [AUTH_REPOSITORY, SESSION_CREDENTIAL_ISSUER, AUTH_CLOCK],
      useFactory: (
        repository: AuthRepository,
        credentialIssuer: SessionCredentialIssuer,
        clock: Clock,
      ) => new AuthenticateAccess(repository, credentialIssuer, clock),
    },
    {
      provide: Logout,
      inject: [AUTH_REPOSITORY, AUTH_CLOCK, AUTH_SECURITY_AUDIT_SERVICE],
      useFactory: (
        repository: AuthRepository,
        clock: Clock,
        auditService: SecurityAuditService,
      ) => new Logout(repository, clock, auditService),
    },
    GetSession,
    AuthCookieService,
    RequireCanonicalOriginGuard,
    BrowserSessionGuard,
    CsrfGuard,
    RefreshCsrfGuard,
  ],
  exports: [
    AUTH_RUNTIME_CONFIG,
    SESSION_CREDENTIAL_ISSUER,
    AuthenticateAccess,
    RequireCanonicalOriginGuard,
    BrowserSessionGuard,
    CsrfGuard,
  ],
})
export class AuthModule {}

function createTestAuthDelivery(config: RuntimeConfig): InMemoryAuthDelivery {
  if (config.environment !== "test" || !config.authFakeDelivery) {
    throw new RuntimeConfigError("A real auth delivery provider is required");
  }
  return new InMemoryAuthDelivery();
}

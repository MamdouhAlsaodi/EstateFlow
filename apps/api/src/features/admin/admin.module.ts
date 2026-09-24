import { Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { SystemClock } from "../auth/application/clock.js";
import type { Clock } from "../auth/application/clock.js";
import type { PasswordHasher } from "../auth/domain/password-hasher.js";
import { NodeCryptoPasswordHasher } from "../auth/infrastructure/node-crypto-password-hasher.js";
import { ApproveBrokerMembership } from "../organizations/application/approve-broker-membership.js";
import type { OrganizationRepository } from "../organizations/application/organization.repository.js";
import { PrismaOrganizationRepository } from "../organizations/infrastructure/prisma-organization.repository.js";
import { AdminApplication } from "./application/admin-application.js";
import type {
  AdminCredentialReader,
  AdminRepository,
} from "./application/admin-repository.js";
import {
  PrismaAdminCredentialReader,
  PrismaAdminRepository,
} from "./infrastructure/prisma-admin.repository.js";
import { AdminController } from "./http/admin.controller.js";
import { PlatformAdminGuard } from "./http/platform-admin.guard.js";
import {
  ADMIN_CLOCK,
  ADMIN_CREDENTIAL_READER,
  ADMIN_PASSWORD_HASHER,
  ADMIN_REPOSITORY,
} from "./admin.tokens.js";

/**
 * EF-620 — admin & moderation module. Reuses the EF-121 platform structures:
 * the PLATFORM_ADMIN authority (no new roles), the organization repository for
 * broker approval, and the auth password hasher for the step-up confirmation.
 * The admin audit/step-up/moderation-event tables are append-only by database
 * trigger. Reuses — never duplicates — the EF-121 broker-approval application.
 */
@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [
    {
      provide: ADMIN_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): AdminRepository =>
        new PrismaAdminRepository(prisma),
    },
    {
      provide: ADMIN_CREDENTIAL_READER,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): AdminCredentialReader =>
        new PrismaAdminCredentialReader(prisma),
    },
    {
      provide: ADMIN_PASSWORD_HASHER,
      useFactory: (): PasswordHasher => new NodeCryptoPasswordHasher(),
    },
    { provide: ADMIN_CLOCK, useValue: SystemClock },
    {
      provide: PrismaOrganizationRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): OrganizationRepository =>
        new PrismaOrganizationRepository(prisma),
    },
    {
      provide: ApproveBrokerMembership,
      inject: [PrismaOrganizationRepository, ADMIN_CLOCK],
      useFactory: (
        repository: OrganizationRepository,
        clock: Clock,
      ): ApproveBrokerMembership =>
        new ApproveBrokerMembership(repository, clock),
    },
    {
      provide: AdminApplication,
      inject: [
        ADMIN_REPOSITORY,
        ADMIN_CREDENTIAL_READER,
        ADMIN_PASSWORD_HASHER,
        ApproveBrokerMembership,
      ],
      useFactory: (
        repository: AdminRepository,
        credentials: AdminCredentialReader,
        passwordHasher: PasswordHasher,
        approveBrokerMembership: ApproveBrokerMembership,
      ): AdminApplication =>
        new AdminApplication(
          repository,
          credentials,
          passwordHasher,
          approveBrokerMembership,
        ),
    },
    PlatformAdminGuard,
  ],
})
export class AdminModule {}

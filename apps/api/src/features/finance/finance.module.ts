import { Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import { AuthModule } from "../auth/auth.module.js";
import {
  LedgerApplication,
  type LedgerMembership,
  type LedgerMembershipReader,
} from "./application/ledger-application.js";
import {
  CommissionApplication,
  type CommissionMembership,
  type CommissionMembershipReader,
} from "./application/commission-application.js";
import {
  ReceivableApplication,
  type ReceivableMembership,
  type ReceivableMembershipReader,
} from "./application/receivable-application.js";
import type { ReceivableRepository } from "./application/receivable-repository.js";
import { PrismaReceivableRepository } from "./infrastructure/prisma-receivable.repository.js";
import type { CommissionRepository } from "./application/commission-repository.js";
import { PrismaCommissionRepository } from "./infrastructure/prisma-commission.repository.js";
import type { LedgerRepository } from "./application/ledger-repository.js";
import { PrismaLedgerRepository } from "./infrastructure/prisma-ledger.repository.js";
import { LedgerController } from "./http/ledger.controller.js";
import { CommissionController } from "./http/commission.controller.js";

class PrismaCommissionMembershipReader implements CommissionMembershipReader {
  constructor(private readonly prisma: PrismaService) {}

  async findMembership(
    organizationId: string,
    userId: string,
  ): Promise<CommissionMembership | null> {
    return this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { organizationId: true, role: true, status: true },
    });
  }
}

class PrismaReceivableMembershipReader implements ReceivableMembershipReader {
  constructor(private readonly prisma: PrismaService) {}

  async findMembership(
    organizationId: string,
    userId: string,
  ): Promise<ReceivableMembership | null> {
    return this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { organizationId: true, role: true, status: true },
    });
  }
}

class PrismaLedgerMembershipReader implements LedgerMembershipReader {
  constructor(private readonly prisma: PrismaService) {}

  async findMembership(
    organizationId: string,
    userId: string,
  ): Promise<LedgerMembership | null> {
    return this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { organizationId: true, role: true, status: true },
    });
  }
}

@Module({
  imports: [AuthModule],
  controllers: [LedgerController, CommissionController],
  providers: [
    {
      provide: PrismaCommissionRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): CommissionRepository =>
        new PrismaCommissionRepository(prisma),
    },
    {
      provide: PrismaCommissionMembershipReader,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): CommissionMembershipReader =>
        new PrismaCommissionMembershipReader(prisma),
    },
    {
      provide: CommissionApplication,
      inject: [PrismaCommissionRepository, PrismaCommissionMembershipReader],
      useFactory: (
        repository: CommissionRepository,
        membershipReader: CommissionMembershipReader,
      ) => new CommissionApplication(repository, membershipReader),
    },
    {
      provide: PrismaReceivableRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): ReceivableRepository =>
        new PrismaReceivableRepository(prisma),
    },
    {
      provide: PrismaReceivableMembershipReader,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): ReceivableMembershipReader =>
        new PrismaReceivableMembershipReader(prisma),
    },
    {
      provide: ReceivableApplication,
      inject: [PrismaReceivableRepository, PrismaReceivableMembershipReader],
      useFactory: (
        repository: ReceivableRepository,
        membershipReader: ReceivableMembershipReader,
      ) => new ReceivableApplication(repository, membershipReader),
    },
    {
      provide: PrismaLedgerRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): LedgerRepository =>
        new PrismaLedgerRepository(prisma),
    },
    {
      provide: PrismaLedgerMembershipReader,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): LedgerMembershipReader =>
        new PrismaLedgerMembershipReader(prisma),
    },
    {
      provide: LedgerApplication,
      inject: [PrismaLedgerRepository, PrismaLedgerMembershipReader],
      useFactory: (
        repository: LedgerRepository,
        membershipReader: LedgerMembershipReader,
      ) => new LedgerApplication(repository, membershipReader),
    },
  ],
})
export class FinanceModule {}

import { Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { ContractApplication } from "./application/contract-application.js";
import type {
  ContractMembershipReader,
  ContractRepository,
  DealSnapshotReader,
} from "./application/contract-repository.js";
import { PrismaContractRepository } from "./infrastructure/prisma-contract.repository.js";
import { PrismaDealSnapshotReader } from "./infrastructure/prisma-deal-snapshot.reader.js";
import {
  ContractController,
  CONTRACTS_MEMBERSHIP_READER,
} from "./http/contract.controller.js";

class PrismaContractMembershipReader implements ContractMembershipReader {
  constructor(private readonly prisma: PrismaService) {}

  async findMembership(
    organizationId: string,
    userId: string,
  ): Promise<{ organizationId: string; role: string; status: string } | null> {
    return this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { organizationId: true, role: true, status: true },
    });
  }
}

/**
 * EF-610 — contracts module. Operational simple e-sign only: deterministic
 * generation from (approved template version, immutable deal snapshot), PDF
 * hash anchoring, sequential signing, and append-only audit. No certified
 * e-sign provider is wired (DocuSign etc. remain deferred per PRD).
 */
@Module({
  imports: [AuthModule],
  controllers: [ContractController],
  providers: [
    {
      provide: PrismaContractRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): ContractRepository =>
        new PrismaContractRepository(prisma),
    },
    {
      provide: PrismaContractMembershipReader,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): ContractMembershipReader =>
        new PrismaContractMembershipReader(prisma),
    },
    {
      provide: PrismaDealSnapshotReader,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): DealSnapshotReader =>
        new PrismaDealSnapshotReader(prisma),
    },
    {
      provide: CONTRACTS_MEMBERSHIP_READER,
      inject: [PrismaContractMembershipReader],
      useFactory: (
        reader: ContractMembershipReader,
      ): ContractMembershipReader => reader,
    },
    {
      provide: ContractApplication,
      inject: [
        PrismaContractRepository,
        PrismaContractMembershipReader,
        PrismaDealSnapshotReader,
      ],
      useFactory: (
        repository: ContractRepository,
        membershipReader: ContractMembershipReader,
        dealSnapshots: DealSnapshotReader,
      ) => new ContractApplication(repository, membershipReader, dealSnapshots),
    },
  ],
})
export class ContractsModule {}

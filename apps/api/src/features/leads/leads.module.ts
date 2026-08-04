import { Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { LeadApplication, type LeadMembership, type LeadMembershipReader } from "./application/lead-application.js";
import type { LeadRepository } from "./application/lead-repository.js";
import { PrismaLeadRepository } from "./infrastructure/prisma-lead.repository.js";
import { LeadController } from "./http/lead.controller.js";
import { LEAD_MEMBERSHIP_READER, LEAD_REPOSITORY } from "./leads.tokens.js";

@Module({
  imports: [AuthModule],
  controllers: [LeadController],
  providers: [
    {
      provide: LEAD_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): LeadRepository => new PrismaLeadRepository(prisma),
    },
    {
      provide: LEAD_MEMBERSHIP_READER,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): LeadMembershipReader => ({
        async findMembership(organizationId, userId) {
          const membership = await prisma.membership.findUnique({
            where: { organizationId_userId: { organizationId, userId } },
            select: { organizationId: true, role: true, status: true },
          });
          return membership as LeadMembership | null;
        },
      }),
    },
    {
      provide: LeadApplication,
      inject: [LEAD_REPOSITORY, LEAD_MEMBERSHIP_READER],
      useFactory: (repository: LeadRepository, memberships: LeadMembershipReader) => new LeadApplication(repository, memberships),
    },
  ],
})
export class LeadsModule {}

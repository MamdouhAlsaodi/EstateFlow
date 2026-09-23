import { Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import { AuthModule } from "../auth/auth.module.js";
import type {
  CampaignMembership,
  CampaignMembershipReader,
} from "./application/campaign-repository.js";
import { CampaignApplication } from "./application/campaign-application.js";
import type { CampaignRepository } from "./application/campaign-repository.js";
import { PrismaCampaignRepository } from "./infrastructure/prisma-campaign.repository.js";
import { CampaignController } from "./http/campaign.controller.js";

class PrismaCampaignMembershipReader implements CampaignMembershipReader {
  constructor(private readonly prisma: PrismaService) {}

  async findMembership(
    organizationId: string,
    userId: string,
  ): Promise<CampaignMembership | null> {
    return this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { organizationId: true, role: true, status: true },
    });
  }
}

@Module({
  imports: [AuthModule],
  controllers: [CampaignController],
  providers: [
    {
      provide: PrismaCampaignRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): CampaignRepository =>
        new PrismaCampaignRepository(prisma),
    },
    {
      provide: PrismaCampaignMembershipReader,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): CampaignMembershipReader =>
        new PrismaCampaignMembershipReader(prisma),
    },
    {
      provide: CampaignApplication,
      inject: [PrismaCampaignRepository, PrismaCampaignMembershipReader],
      useFactory: (
        repository: CampaignRepository,
        membershipReader: CampaignMembershipReader,
      ) => new CampaignApplication(repository, membershipReader),
    },
  ],
})
export class CampaignsModule {}

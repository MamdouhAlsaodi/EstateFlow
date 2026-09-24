import { Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { ViewingApplication } from "./application/viewing-application.js";
import type { ViewingMembershipReader } from "./application/viewing-application.js";
import type { ViewingRepository } from "./application/viewing-repository.js";
import { ViewingController } from "./http/viewing.controller.js";
import { PrismaViewingRepository } from "./infrastructure/prisma-viewing.repository.js";

class PrismaViewingMembershipReader implements ViewingMembershipReader {
  constructor(private readonly prisma: PrismaService) {}
  async findMembership(organizationId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { organizationId: true, userId: true, role: true, status: true },
    });
    return membership;
  }
}

@Module({
  imports: [AuthModule],
  controllers: [ViewingController],
  providers: [
    {
      provide: PrismaViewingRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): ViewingRepository =>
        new PrismaViewingRepository(prisma),
    },
    {
      provide: PrismaViewingMembershipReader,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) =>
        new PrismaViewingMembershipReader(prisma),
    },
    {
      provide: ViewingApplication,
      inject: [PrismaViewingRepository, PrismaViewingMembershipReader],
      useFactory: (
        repository: ViewingRepository,
        memberships: ViewingMembershipReader,
      ) => new ViewingApplication(repository, memberships),
    },
  ],
})
export class ViewingsModule {}

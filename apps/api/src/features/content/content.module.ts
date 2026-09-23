import { Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { ContentApplication } from "./application/content-application.js";
import type {
  ContentMembership,
  ContentMembershipReader,
  ContentRepository,
} from "./application/content-repository.js";
import {
  GenerationApplication,
  type PropertyProjectionReader,
} from "./application/generation-application.js";
import { PrismaContentRepository } from "./infrastructure/prisma-content.repository.js";
import { PrismaPropertyProjectionReader } from "./infrastructure/prisma-property-projection.reader.js";
import { ContentController } from "./http/content.controller.js";

class PrismaContentMembershipReader implements ContentMembershipReader {
  constructor(private readonly prisma: PrismaService) {}

  async findMembership(
    organizationId: string,
    userId: string,
  ): Promise<ContentMembership | null> {
    return this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { organizationId: true, role: true, status: true },
    });
  }
}

@Module({
  imports: [AuthModule],
  controllers: [ContentController],
  providers: [
    {
      provide: PrismaContentRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): ContentRepository =>
        new PrismaContentRepository(prisma),
    },
    {
      provide: PrismaContentMembershipReader,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): ContentMembershipReader =>
        new PrismaContentMembershipReader(prisma),
    },
    {
      provide: PrismaPropertyProjectionReader,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): PropertyProjectionReader =>
        new PrismaPropertyProjectionReader(prisma),
    },
    {
      provide: ContentApplication,
      inject: [PrismaContentRepository, PrismaContentMembershipReader],
      useFactory: (
        repository: ContentRepository,
        membershipReader: ContentMembershipReader,
      ) => new ContentApplication(repository, membershipReader),
    },
    {
      provide: GenerationApplication,
      inject: [
        PrismaContentRepository,
        PrismaContentMembershipReader,
        PrismaPropertyProjectionReader,
      ],
      useFactory: (
        repository: ContentRepository,
        membershipReader: ContentMembershipReader,
        projectionReader: PropertyProjectionReader,
      ) =>
        new GenerationApplication(
          repository,
          membershipReader,
          projectionReader,
        ),
    },
  ],
})
export class ContentModule {}

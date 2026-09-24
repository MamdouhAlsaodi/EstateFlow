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
import { ContentPublishingApplication } from "./application/publishing-application.js";
import type { PublishingChannelPort } from "./application/publishing-channel.port.js";
import { InMemoryRecordingPublishingAdapter } from "./application/publishing-channel.port.js";
import type { ContentPublishingRepository } from "./application/publishing-repository.js";
import { PrismaContentRepository } from "./infrastructure/prisma-content.repository.js";
import { PrismaContentPublishingRepository } from "./infrastructure/prisma-content-publishing.repository.js";
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
      provide: PrismaContentPublishingRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): ContentPublishingRepository =>
        new PrismaContentPublishingRepository(prisma),
    },
    {
      // The only EF-404 channel adapter: the deterministic in-memory fake.
      // Real portal/social adapters stay behind this port and outside this
      // module until a future packet approves one.
      provide: InMemoryRecordingPublishingAdapter,
      useFactory: () => new InMemoryRecordingPublishingAdapter(),
    },
    {
      provide: "PUBLISHING_CHANNEL_PORT",
      inject: [InMemoryRecordingPublishingAdapter],
      useFactory: (
        adapter: InMemoryRecordingPublishingAdapter,
      ): PublishingChannelPort => adapter,
    },
    {
      provide: ContentApplication,
      inject: [
        PrismaContentRepository,
        PrismaContentMembershipReader,
        ContentPublishingApplication,
      ],
      useFactory: (
        repository: ContentRepository,
        membershipReader: ContentMembershipReader,
        publishing: ContentPublishingApplication,
      ) => new ContentApplication(repository, membershipReader, publishing),
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
    {
      provide: ContentPublishingApplication,
      inject: [
        PrismaContentPublishingRepository,
        PrismaContentRepository,
        PrismaContentMembershipReader,
        "PUBLISHING_CHANNEL_PORT",
      ],
      useFactory: (
        repository: ContentPublishingRepository,
        content: ContentRepository,
        membershipReader: ContentMembershipReader,
        channelPort: PublishingChannelPort,
      ) =>
        new ContentPublishingApplication(
          repository,
          content,
          membershipReader,
          channelPort,
        ),
    },
  ],
  exports: [ContentPublishingApplication],
})
export class ContentModule {}

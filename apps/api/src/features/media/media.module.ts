import { Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { MediaApplication } from "./application/media-application.js";
import type { MediaRepository } from "./application/media-repository.js";
import { MediaIntentSigner } from "./domain/media-intent.js";
import {
  InMemoryFakeStorageAdapter,
  type StoragePort,
} from "./domain/storage.port.js";
import { PrismaMediaRepository } from "./infrastructure/prisma-media.repository.js";
import {
  MEDIA_MEMBERSHIP_READER,
  MediaController,
} from "./http/media.controller.js";
import {
  MEDIA_INTENT_SIGNER,
  MEDIA_STORAGE_PORT,
  MediaStorageSimController,
} from "./http/media-storage.controller.js";

export const MEDIA_REPOSITORY = Symbol("MEDIA_REPOSITORY");

/**
 * EF-601 — the only storage adapter activated in this packet is the
 * deterministic in-memory fake behind StoragePort. The S3-compatible adapter
 * (same port) stays deactivated: no credentials exist in this boundary.
 */
@Module({
  imports: [AuthModule],
  controllers: [MediaController, MediaStorageSimController],
  providers: [
    {
      provide: MEDIA_INTENT_SIGNER,
      useFactory: () => new MediaIntentSigner(),
    },
    {
      provide: MEDIA_STORAGE_PORT,
      inject: [MEDIA_INTENT_SIGNER],
      useFactory: (signer: MediaIntentSigner): StoragePort =>
        new InMemoryFakeStorageAdapter(signer),
    },
    {
      provide: MEDIA_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): MediaRepository =>
        new PrismaMediaRepository(prisma),
    },
    {
      provide: MEDIA_MEMBERSHIP_READER,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => ({
        async findMembership(organizationId: string, userId: string) {
          return prisma.membership.findUnique({
            where: { organizationId_userId: { organizationId, userId } },
            select: { organizationId: true, role: true, status: true },
          });
        },
      }),
    },
    {
      provide: MediaApplication,
      inject: [MEDIA_REPOSITORY, MEDIA_STORAGE_PORT, MEDIA_INTENT_SIGNER],
      useFactory: (
        repository: MediaRepository,
        storage: StoragePort,
        signer: MediaIntentSigner,
      ) => new MediaApplication({ repository, storage, signer }),
    },
  ],
})
export class MediaModule {}

import { Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { GeoSearchApplication } from "./application/geo-search-application.js";
import type { GeoSearchRepository } from "./application/geo-search-repository.js";
import {
  GEO_SEARCH_MEMBERSHIP_READER,
  GeoSearchController,
} from "./http/geo-search.controller.js";
import { PrismaGeoSearchRepository } from "./infrastructure/prisma-geo-search.repository.js";

export const GEO_SEARCH_REPOSITORY = Symbol("GEO_SEARCH_REPOSITORY");

@Module({
  imports: [AuthModule],
  controllers: [GeoSearchController],
  providers: [
    {
      provide: GEO_SEARCH_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): GeoSearchRepository =>
        new PrismaGeoSearchRepository(prisma),
    },
    {
      provide: GEO_SEARCH_MEMBERSHIP_READER,
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
      provide: GeoSearchApplication,
      inject: [GEO_SEARCH_REPOSITORY],
      useFactory: (repository: GeoSearchRepository) =>
        new GeoSearchApplication(repository),
    },
  ],
})
export class SearchModule {}

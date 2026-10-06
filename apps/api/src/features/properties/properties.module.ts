import { Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { SearchModule } from "../search/search.module.js";
import { CsvImportApplication } from "./application/csv-import-application.js";
import {
  CSV_IMPORT_REPOSITORY,
  type CsvImportRepository,
} from "./application/csv-import-repository.js";
import { PropertyApplication } from "./application/property-application.js";
import type { PropertyRepository } from "./application/property-repository.js";
import { PrismaCsvImportRepository } from "./infrastructure/prisma-csv-import.repository.js";
import { PrismaPropertyRepository } from "./infrastructure/prisma-property.repository.js";
import { CsvImportController } from "./http/csv-import.controller.js";
import {
  PropertyController,
  PROPERTY_MEMBERSHIP_READER,
} from "./http/property.controller.js";

export const PROPERTY_REPOSITORY = Symbol("PROPERTY_REPOSITORY");

@Module({
  imports: [AuthModule, SearchModule],
  controllers: [PropertyController, CsvImportController],
  providers: [
    {
      provide: PROPERTY_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): PropertyRepository =>
        new PrismaPropertyRepository(prisma),
    },
    {
      provide: PROPERTY_MEMBERSHIP_READER,
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
      provide: PropertyApplication,
      inject: [PROPERTY_REPOSITORY],
      useFactory: (repository: PropertyRepository) =>
        new PropertyApplication(repository),
    },
    {
      provide: CSV_IMPORT_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): CsvImportRepository =>
        new PrismaCsvImportRepository(prisma),
    },
    {
      provide: CsvImportApplication,
      inject: [CSV_IMPORT_REPOSITORY],
      useFactory: (repository: CsvImportRepository) =>
        new CsvImportApplication({ repository }),
    },
  ],
})
export class PropertiesModule {}

import { Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { PropertyApplication } from "./application/property-application.js";
import type { PropertyRepository } from "./application/property-repository.js";
import { PrismaPropertyRepository } from "./infrastructure/prisma-property.repository.js";
import {
  PropertyController,
  PROPERTY_MEMBERSHIP_READER,
} from "./http/property.controller.js";

export const PROPERTY_REPOSITORY = Symbol("PROPERTY_REPOSITORY");

@Module({
  imports: [AuthModule],
  controllers: [PropertyController],
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
  ],
})
export class PropertiesModule {}

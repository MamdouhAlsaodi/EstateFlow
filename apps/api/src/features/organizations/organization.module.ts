import { Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { ApproveBrokerMembership } from "./application/approve-broker-membership.js";
import type { Clock } from "./application/approve-broker-membership.js";
import { CreateMembership } from "./application/create-membership.js";
import { CreateOrganization } from "./application/create-organization.js";
import { GetMyMembership } from "./application/get-my-membership.js";
import { GetOrganization } from "./application/get-organization.js";
import { ListOrganizationMemberships } from "./application/list-organization-memberships.js";
import type { OrganizationRepository } from "./application/organization.repository.js";
import { SystemClock } from "../auth/application/clock.js";
import { PrismaOrganizationRepository } from "./infrastructure/prisma-organization.repository.js";
import { OrganizationController } from "./http/organization.controller.js";
import {
  ORGANIZATION_CLOCK,
  ORGANIZATION_REPOSITORY,
} from "./organization.tokens.js";

@Module({
  imports: [AuthModule],
  controllers: [OrganizationController],
  providers: [
    {
      provide: ORGANIZATION_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): OrganizationRepository =>
        new PrismaOrganizationRepository(prisma),
    },
    { provide: ORGANIZATION_CLOCK, useValue: SystemClock },
    {
      provide: CreateOrganization,
      inject: [ORGANIZATION_REPOSITORY],
      useFactory: (repository: OrganizationRepository) =>
        new CreateOrganization(repository),
    },
    {
      provide: GetOrganization,
      inject: [ORGANIZATION_REPOSITORY],
      useFactory: (repository: OrganizationRepository) =>
        new GetOrganization(repository),
    },
    {
      provide: ListOrganizationMemberships,
      inject: [ORGANIZATION_REPOSITORY],
      useFactory: (repository: OrganizationRepository) =>
        new ListOrganizationMemberships(repository),
    },
    {
      provide: GetMyMembership,
      inject: [ORGANIZATION_REPOSITORY],
      useFactory: (repository: OrganizationRepository) =>
        new GetMyMembership(repository),
    },
    {
      provide: CreateMembership,
      inject: [ORGANIZATION_REPOSITORY],
      useFactory: (repository: OrganizationRepository) =>
        new CreateMembership(repository),
    },
    {
      provide: ApproveBrokerMembership,
      inject: [ORGANIZATION_REPOSITORY, ORGANIZATION_CLOCK],
      useFactory: (repository: OrganizationRepository, clock: Clock) =>
        new ApproveBrokerMembership(repository, clock),
    },
  ],
})
export class OrganizationModule {}

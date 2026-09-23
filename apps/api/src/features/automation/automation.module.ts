import { forwardRef, Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import { LeadsModule } from "../leads/leads.module.js";
import { LEAD_REPOSITORY } from "../leads/leads.tokens.js";
import { AuthModule } from "../auth/auth.module.js";
import {
  AutomationRuleApplication,
  type AutomationMembership,
  type AutomationMembershipReader,
} from "./application/rule-application.js";
import type { AutomationRuleRepository } from "./application/rule-repository.js";
import { PrismaAutomationRuleRepository } from "./infrastructure/prisma-automation-rule.repository.js";
import type { AutomationJobRepository } from "./application/job-repository.js";
import { PrismaAutomationJobRepository } from "./infrastructure/prisma-automation-job.repository.js";
import { AutomationScheduler } from "./application/automation-scheduler.js";
import type {
  AutomationActionPort,
  SchedulerRuleReader,
} from "./application/automation-action-port.js";
import type { LeadRepository } from "../leads/application/lead-repository.js";
import { AutomationRuleController } from "./http/automation-rule.controller.js";
import {
  AUTOMATION_OUTBOUND_DELIVERY,
  InMemoryAutomationDelivery,
  LeadAutomationActionExecutor,
  type AutomationOutboundDelivery,
} from "./application/lead-automation-executor.js";
import { LeadAutomationCoordinator } from "./application/lead-automation-coordinator.js";

class PrismaAutomationMembershipReader implements AutomationMembershipReader {
  constructor(private readonly prisma: PrismaService) {}

  async findMembership(
    organizationId: string,
    userId: string,
  ): Promise<AutomationMembership | null> {
    return this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { organizationId: true, role: true, status: true },
    });
  }
}

@Module({
  imports: [AuthModule, forwardRef(() => LeadsModule)],
  controllers: [AutomationRuleController],
  providers: [
    {
      provide: PrismaAutomationRuleRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): AutomationRuleRepository =>
        new PrismaAutomationRuleRepository(prisma),
    },
    {
      provide: PrismaAutomationJobRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): AutomationJobRepository =>
        new PrismaAutomationJobRepository(prisma),
    },
    {
      provide: PrismaAutomationMembershipReader,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): AutomationMembershipReader =>
        new PrismaAutomationMembershipReader(prisma),
    },
    {
      provide: AutomationRuleApplication,
      inject: [
        PrismaAutomationRuleRepository,
        PrismaAutomationMembershipReader,
        PrismaAutomationJobRepository,
      ],
      useFactory: (
        repository: AutomationRuleRepository,
        membershipReader: AutomationMembershipReader,
        jobs: AutomationJobRepository,
      ) => new AutomationRuleApplication(repository, membershipReader, jobs),
    },
    {
      provide: AUTOMATION_OUTBOUND_DELIVERY,
      useFactory: (): AutomationOutboundDelivery =>
        new InMemoryAutomationDelivery(),
    },
    {
      provide: LeadAutomationActionExecutor,
      inject: [
        LEAD_REPOSITORY,
        PrismaAutomationRuleRepository,
        AUTOMATION_OUTBOUND_DELIVERY,
      ],
      useFactory: (
        leads: LeadRepository,
        rules: SchedulerRuleReader,
        delivery: AutomationOutboundDelivery,
      ) => new LeadAutomationActionExecutor(leads, rules, delivery),
    },
    {
      provide: AutomationScheduler,
      inject: [
        PrismaAutomationJobRepository,
        PrismaAutomationRuleRepository,
        LeadAutomationActionExecutor,
      ],
      useFactory: (
        jobs: AutomationJobRepository,
        rules: SchedulerRuleReader,
        actionPort: AutomationActionPort,
      ) => new AutomationScheduler(jobs, rules, actionPort),
    },
    {
      provide: LeadAutomationCoordinator,
      inject: [
        AutomationScheduler,
        PrismaAutomationRuleRepository,
        LEAD_REPOSITORY,
      ],
      useFactory: (
        scheduler: AutomationScheduler,
        rules: SchedulerRuleReader,
        leads: LeadRepository,
      ) => new LeadAutomationCoordinator(scheduler, rules, leads),
    },
  ],
  exports: [AutomationScheduler, LeadAutomationCoordinator],
})
export class AutomationModule {}

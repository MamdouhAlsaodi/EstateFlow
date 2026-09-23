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
  LeadAutomationActionExecutor,
  type AutomationOutboundDelivery,
} from "./application/lead-automation-executor.js";
import { LeadAutomationCoordinator } from "./application/lead-automation-coordinator.js";
import { PrismaAutomationDelivery } from "../notifications/prisma-automation-delivery.js";
import { PrismaFinanceReminderRepository } from "./infrastructure/prisma-finance-reminder.repository.js";
import type { FinanceReminderRepository } from "./application/finance-reminder-repository.js";
import { FinanceReminderCoordinator } from "./application/finance-reminder-coordinator.js";
import { FinanceAutomationActionExecutor } from "./application/finance-automation-executor.js";
import { AutomationActionDispatcher } from "./application/automation-action-dispatcher.js";

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
      provide: PrismaFinanceReminderRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): FinanceReminderRepository =>
        new PrismaFinanceReminderRepository(prisma),
    },
    {
      provide: AUTOMATION_OUTBOUND_DELIVERY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): AutomationOutboundDelivery =>
        new PrismaAutomationDelivery(prisma),
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
      provide: FinanceAutomationActionExecutor,
      inject: [
        PrismaFinanceReminderRepository,
        PrismaAutomationRuleRepository,
        AUTOMATION_OUTBOUND_DELIVERY,
      ],
      useFactory: (
        finance: FinanceReminderRepository,
        rules: SchedulerRuleReader,
        delivery: AutomationOutboundDelivery,
      ) => new FinanceAutomationActionExecutor(finance, rules, delivery),
    },
    {
      provide: AutomationActionDispatcher,
      inject: [LeadAutomationActionExecutor, FinanceAutomationActionExecutor],
      useFactory: (lead: AutomationActionPort, finance: AutomationActionPort) =>
        new AutomationActionDispatcher(lead, finance),
    },
    {
      provide: FinanceReminderCoordinator,
      inject: [PrismaAutomationRuleRepository, PrismaFinanceReminderRepository],
      useFactory: (
        rules: SchedulerRuleReader,
        finance: FinanceReminderRepository,
      ) => new FinanceReminderCoordinator(rules, finance),
    },
    {
      provide: AutomationScheduler,
      inject: [
        PrismaAutomationJobRepository,
        PrismaAutomationRuleRepository,
        AutomationActionDispatcher,
        FinanceReminderCoordinator,
      ],
      useFactory: (
        jobs: AutomationJobRepository,
        rules: SchedulerRuleReader,
        actionPort: AutomationActionPort,
        occurrenceSource: FinanceReminderCoordinator,
      ) => new AutomationScheduler(jobs, rules, actionPort, occurrenceSource),
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

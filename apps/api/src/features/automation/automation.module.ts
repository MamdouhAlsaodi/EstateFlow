import { Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
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
  AutomationActionExecutionOutcome,
  AutomationActionPort,
  SchedulerRuleReader,
} from "./application/automation-action-port.js";
import { AutomationRuleController } from "./http/automation-rule.controller.js";

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

/**
 * Conservative stand-in until EF-303 registers the first concrete action
 * executors. A scheduled job reaching execution is failed with a typed,
 * visible error instead of being silently dropped.
 */
class UnconfiguredActionExecutor implements AutomationActionPort {
  async executeAction(): Promise<AutomationActionExecutionOutcome> {
    return {
      kind: "failed",
      retryable: false,
      errorKind: "action-executor-not-configured",
      message:
        "no automation action executor is registered; EF-303 wires the first concrete executors",
    };
  }
}

@Module({
  imports: [AuthModule],
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
      ],
      useFactory: (
        repository: AutomationRuleRepository,
        membershipReader: AutomationMembershipReader,
      ) => new AutomationRuleApplication(repository, membershipReader),
    },
    {
      provide: UnconfiguredActionExecutor,
      useFactory: () => new UnconfiguredActionExecutor(),
    },
    {
      provide: AutomationScheduler,
      inject: [
        PrismaAutomationJobRepository,
        PrismaAutomationRuleRepository,
        UnconfiguredActionExecutor,
      ],
      useFactory: (
        jobs: AutomationJobRepository,
        rules: SchedulerRuleReader,
        actionPort: AutomationActionPort,
      ) => new AutomationScheduler(jobs, rules, actionPort),
    },
  ],
})
export class AutomationModule {}

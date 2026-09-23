import { NestFactory } from "@nestjs/core";
import type { INestApplicationContext } from "@nestjs/common";
import { AppModule } from "../../../app.module.js";
import { AutomationScheduler } from "./automation-scheduler.js";

export type AutomationSchedulerTickInput = Readonly<{
  now: Date;
  limit: number;
}>;

export type AutomationSchedulerTickResult = Readonly<{
  schedules: Readonly<{
    evaluatedRules: number;
    scheduled: number;
    alreadyScheduled: number;
  }>;
  jobs: Readonly<{
    claimed: number;
    succeeded: number;
    retried: number;
    failed: number;
  }>;
}>;

export type AutomationSchedulerTickRuntime = Readonly<{
  tick(
    input: AutomationSchedulerTickInput,
  ): Promise<AutomationSchedulerTickResult>;
  close(): Promise<void>;
}>;

/**
 * Internal worker transport. It deliberately exposes only the EF-302 tick;
 * concrete action executors and Prisma ownership remain inside the API module.
 */
export async function createAutomationSchedulerTick(): Promise<AutomationSchedulerTickRuntime> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const scheduler = app.get(AutomationScheduler);
  return {
    tick: (input) => scheduler.runTick(input),
    close: () => app.close(),
  };
}

export type AutomationWorkerApplicationContext = INestApplicationContext;

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../../app.module.js";
import { ContentPublishingApplication } from "./publishing-application.js";

export type PublishingTickInput = Readonly<{ now: Date; limit: number }>;

export type PublishingTickResult = Readonly<{
  claimed: number;
  delivered: number;
  retried: number;
  failed: number;
  cancelled: number;
}>;

export type ContentPublishingTickRuntime = Readonly<{
  tick(input: PublishingTickInput): Promise<PublishingTickResult>;
  close(): Promise<void>;
}>;

/**
 * Internal worker transport for the EF-404 delivery half of the ONE worker
 * tick. It deliberately exposes only `runDueDeliveries`; the port, the
 * repositories, and Prisma ownership stay inside the API module. apps/worker
 * composes this with AutomationScheduler.runTick on the same loop — there is
 * no second scheduler and no second loop.
 */
export async function createContentPublishingTick(): Promise<ContentPublishingTickRuntime> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const publishing = app.get(ContentPublishingApplication);
  return {
    tick: (input) => publishing.runDueDeliveries(input),
    close: () => app.close(),
  };
}

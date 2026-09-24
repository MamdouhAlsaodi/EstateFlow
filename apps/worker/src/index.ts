declare const process: {
  argv: string[];
  once(signal: string, listener: () => void): void;
  exit(code: number): never;
};
import {
  createAutomationWorkerLoop,
  type AutomationWorkerLoop,
} from "../../../scripts/automation-worker-loop.mjs";

type SchedulerTickResult = Record<string, unknown>;

type ComposedSchedulerTick = Readonly<{
  tick(input: { now: Date; limit: number }): Promise<SchedulerTickResult>;
}>;

type WorkerLoopOptions = Readonly<{
  intervalMs?: number;
  maxBackoffMs?: number;
  setTimeoutFn?: (callback: () => void, delay: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  logger?: Readonly<{ error?: (message: string) => void }>;
}>;

export const DEFAULT_AUTOMATION_JOB_BATCH_SIZE = 100;

export type AutomationWorkerOptions = WorkerLoopOptions &
  Readonly<{
    scheduler: ComposedSchedulerTick;
    jobBatchSize?: number;
  }>;

/**
 * Thin EF-303 runner. The scheduler tick and its Lead executors belong to the
 * API process; this package only supplies time, batching, and lifecycle.
 */
export function createAutomationWorker(
  options: AutomationWorkerOptions,
): AutomationWorkerLoop {
  const jobBatchSize =
    options.jobBatchSize ?? DEFAULT_AUTOMATION_JOB_BATCH_SIZE;
  if (!Number.isInteger(jobBatchSize) || jobBatchSize < 1 || jobBatchSize > 100)
    throw new RangeError("jobBatchSize must be an integer between 1 and 100");

  return createAutomationWorkerLoop({
    tick: () =>
      options.scheduler
        .tick({ now: new Date(), limit: jobBatchSize })
        .then(() => undefined),
    intervalMs: options.intervalMs,
    maxBackoffMs: options.maxBackoffMs,
    setTimeoutFn: options.setTimeoutFn,
    clearTimeoutFn: options.clearTimeoutFn,
    logger: options.logger,
  });
}

/**
 * Composed EF-303/EF-404 worker runtime. The automation scheduler tick and
 * the content publishing tick both belong to the API process; this package
 * only supplies time, batching, lifecycle, and the single-loop composition:
 * one loop, one cadence — delivery rides the existing worker tick, there is
 * no second scheduler.
 */
export async function createComposedSchedulerRuntime(): Promise<
  Readonly<{
    scheduler: ComposedSchedulerTick;
    close: () => Promise<void>;
  }>
> {
  const apiAutomationModulePath =
    "../../api/dist/features/automation/application/automation-worker-tick.js";
  const apiPublishingModulePath =
    "../../api/dist/features/content/application/publishing-worker-tick.js";
  const apiMediaOrphanModulePath =
    "../../api/dist/features/media/application/media-orphan-tick.js";
  // Runtime workspace boundaries: their builds emit these modules before the
  // worker starts; dynamic imports keep this package free of API/Nest
  // dependencies and executor knowledge.
  const automationModule = (await import(
    apiAutomationModulePath
  )) as unknown as Readonly<{
    createAutomationSchedulerTick(): Promise<
      ComposedSchedulerTick & Readonly<{ close(): Promise<void> }>
    >;
  }>;
  const publishingModule = (await import(
    apiPublishingModulePath
  )) as unknown as Readonly<{
    createContentPublishingTick(): Promise<
      ComposedSchedulerTick & Readonly<{ close(): Promise<void> }>
    >;
  }>;
  const mediaOrphanModule = (await import(
    apiMediaOrphanModulePath
  )) as unknown as Readonly<{
    createMediaOrphanTick(): Promise<
      ComposedSchedulerTick & Readonly<{ close(): Promise<void> }>
    >;
  }>;
  const automation = await automationModule.createAutomationSchedulerTick();
  const publishing = await publishingModule.createContentPublishingTick();
  const mediaOrphan = await mediaOrphanModule.createMediaOrphanTick();
  let closed = false;
  return {
    scheduler: {
      tick: async (input) => {
        // Automation first (unchanged EF-303 semantics), then the EF-404
        // delivery half and the EF-601 orphan-sweep half of the same tick.
        const jobs = (await automation.tick(input)) as SchedulerTickResult;
        const deliveries = (await publishing.tick(
          input,
        )) as SchedulerTickResult;
        const media = (await mediaOrphan.tick(input)) as SchedulerTickResult;
        return { ...jobs, deliveries, media };
      },
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await Promise.all([
        automation.close(),
        publishing.close(),
        mediaOrphan.close(),
      ]);
    },
  };
}

/** Start the real long-lived worker against the API-owned scheduler context. */
export async function startAutomationWorker(
  options: WorkerLoopOptions = {},
): Promise<
  Readonly<{ loop: AutomationWorkerLoop; stop: () => Promise<void> }>
> {
  const runtime = await createComposedSchedulerRuntime();
  const loop = createAutomationWorker({
    scheduler: runtime.scheduler,
    ...options,
  });
  loop.start();
  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await loop.stop();
    await runtime.close();
  };
  return { loop, stop };
}

async function main(): Promise<void> {
  const worker = await startAutomationWorker();
  const shutdown = (): void => {
    void worker.stop().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1]?.endsWith("index.js")) void main();

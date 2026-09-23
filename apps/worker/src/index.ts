declare const process: {
  argv: string[];
  once(signal: string, listener: () => void): void;
  exit(code: number): never;
};
import {
  createAutomationWorkerLoop,
  type AutomationWorkerLoop,
} from "../../../scripts/automation-worker-loop.mjs";

type AutomationSchedulerTick = Readonly<{
  tick(input: { now: Date; limit: number }): Promise<unknown>;
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
    scheduler: AutomationSchedulerTick;
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

/** Start the real long-lived worker against the API-owned scheduler context. */
export async function startAutomationWorker(
  options: WorkerLoopOptions = {},
): Promise<
  Readonly<{ loop: AutomationWorkerLoop; stop: () => Promise<void> }>
> {
  // The API is a runtime workspace boundary. Its build emits this module
  // before the worker is started; keeping the import dynamic keeps the worker
  // package free of API/Nest dependencies and action-executor knowledge.
  const apiTickModulePath =
    "../../api/dist/features/automation/application/automation-worker-tick.js";
  const apiTickModule = (await import(
    apiTickModulePath
  )) as unknown as Readonly<{
    createAutomationSchedulerTick(): Promise<
      AutomationSchedulerTick & Readonly<{ close(): Promise<void> }>
    >;
  }>;
  const runtime = await apiTickModule.createAutomationSchedulerTick();
  const loop = createAutomationWorker({ scheduler: runtime, ...options });
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

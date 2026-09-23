export type AutomationWorkerLoopOptions = Readonly<{
  tick: () => Promise<void>;
  intervalMs?: number;
  maxBackoffMs?: number;
  setTimeoutFn?: (callback: () => void, delay: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  logger?: Readonly<{ error?: (message: string) => void }>;
}>;

export type AutomationWorkerLoop = Readonly<{
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly backoffMs: number;
}>;

export function createAutomationWorkerLoop(
  options: AutomationWorkerLoopOptions,
): AutomationWorkerLoop;

export const automationWorkerDefaults: Readonly<{
  intervalMs: number;
  maxBackoffMs: number;
}>;

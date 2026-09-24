import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../../app.module.js";
import { MediaApplication } from "./media-application.js";

export type MediaOrphanTickInput = Readonly<{ now: Date; limit: number }>;

export type MediaOrphanTickResult = Readonly<{
  marked: number;
  swept: number;
  deletedStorageKeys: number;
}>;

export type MediaOrphanTickRuntime = Readonly<{
  tick(input: MediaOrphanTickInput): Promise<MediaOrphanTickResult>;
  close(): Promise<void>;
}>;

/**
 * EF-601 — orphan-sweep half of the ONE worker tick, mirroring the EF-404
 * delivery-tick transport: this exposes only `runOrphanMaintenance`; the
 * repository, the StoragePort, and Prisma ownership stay inside the API
 * module. apps/worker composes it with the automation and publishing ticks.
 *
 * Documented boundary: with the deterministic in-memory fake adapter, storage
 * deletion executed in the worker process cannot reach bytes held by another
 * process's heap — rows are swept authoritatively and the fake's bytes are
 * unreachable garbage. A real adapter deletes objects by key remotely.
 */
export async function createMediaOrphanTick(): Promise<MediaOrphanTickRuntime> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const media = app.get(MediaApplication);
  return {
    tick: (input) => media.runOrphanMaintenance({ now: input.now }),
    close: () => app.close(),
  };
}

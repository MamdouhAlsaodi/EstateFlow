import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";

/**
 * Narrow readiness port: resolves when the primary datastore is reachable,
 * rejects otherwise. Health decisions must never depend on concrete driver
 * details so tests can inject a fake probe.
 */
export interface ReadinessProbePort {
  check(): Promise<void>;
}

/**
 * Production adapter: one cheap read-only query through the existing shared
 * Prisma singleton. No writes, no schema assumptions, no connection churn.
 */
@Injectable()
export class PrismaReadinessProbe implements ReadinessProbePort {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}

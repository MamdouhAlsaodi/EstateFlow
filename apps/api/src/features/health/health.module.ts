import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { PrismaReadinessProbe } from "./readiness-probe.port.js";

@Module({ controllers: [HealthController], providers: [PrismaReadinessProbe] })
export class HealthModule {}

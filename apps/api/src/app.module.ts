import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module.js";
import { AuthModule } from "./features/auth/auth.module.js";
import { HealthModule } from "./features/health/health.module.js";
import { OrganizationModule } from "./features/organizations/organization.module.js";
import { LeadsModule } from "./features/leads/leads.module.js";

@Module({
  imports: [DatabaseModule, HealthModule, AuthModule, OrganizationModule, LeadsModule],
})
export class AppModule {}

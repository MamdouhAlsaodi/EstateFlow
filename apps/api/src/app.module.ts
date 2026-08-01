import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module.js";
import { AuthModule } from "./features/auth/auth.module.js";
import { HealthModule } from "./features/health/health.module.js";
import { OrganizationModule } from "./features/organizations/organization.module.js";

@Module({
  imports: [DatabaseModule, HealthModule, AuthModule, OrganizationModule],
})
export class AppModule {}

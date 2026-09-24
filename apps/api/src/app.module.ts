import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module.js";
import { AuthModule } from "./features/auth/auth.module.js";
import { HealthModule } from "./features/health/health.module.js";
import { OrganizationModule } from "./features/organizations/organization.module.js";
import { LeadsModule } from "./features/leads/leads.module.js";
import { PropertiesModule } from "./features/properties/properties.module.js";
import { FinanceModule } from "./features/finance/finance.module.js";
import { AutomationModule } from "./features/automation/automation.module.js";
import { CampaignsModule } from "./features/campaigns/campaigns.module.js";
import { ContentModule } from "./features/content/content.module.js";
import { ViewingsModule } from "./features/viewings/viewings.module.js";
import { MediaModule } from "./features/media/media.module.js";
import { ContractsModule } from "./features/contracts/contracts.module.js";

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    AuthModule,
    OrganizationModule,
    LeadsModule,
    PropertiesModule,
    FinanceModule,
    AutomationModule,
    CampaignsModule,
    ContentModule,
    ViewingsModule,
    MediaModule,
    ContractsModule,
  ],
})
export class AppModule {}

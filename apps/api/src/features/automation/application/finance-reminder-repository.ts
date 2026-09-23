import type {
  FinanceReminderCandidate,
  FinanceReminderTargetKind,
} from "../domain/finance-reminder.js";

export interface FinanceReminderRepository {
  listReceivableCandidates(
    organizationId?: string,
  ): Promise<readonly FinanceReminderCandidate[]>;
  listCommissionCandidates(
    organizationId?: string,
  ): Promise<readonly FinanceReminderCandidate[]>;
  findCurrentTarget(
    organizationId: string,
    targetType: FinanceReminderTargetKind,
    targetId: string,
  ): Promise<FinanceReminderCandidate | null>;
}

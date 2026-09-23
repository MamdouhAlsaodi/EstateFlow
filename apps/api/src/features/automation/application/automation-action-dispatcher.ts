import type {
  AutomationActionExecutionOutcome,
  AutomationActionExecutionRequest,
  AutomationActionPort,
} from "./automation-action-port.js";

export class AutomationActionDispatcher implements AutomationActionPort {
  constructor(
    private readonly lead: AutomationActionPort,
    private readonly finance: AutomationActionPort,
  ) {}

  executeAction(
    request: AutomationActionExecutionRequest,
  ): Promise<AutomationActionExecutionOutcome> {
    if (
      request.job.targetType === "RECEIVABLE" ||
      request.job.targetType === "COMMISSION"
    )
      return this.finance.executeAction(request);
    return this.lead.executeAction(request);
  }
}

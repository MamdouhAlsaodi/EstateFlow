import { ApiError } from "../../lib/api-client/index";
import type { MessageKey } from "../../i18n";
import { LeadStage, type LeadBoardLeadDto } from "../../lib/api-client/leads";

export const LEAD_STAGES = [
  LeadStage.NEW,
  LeadStage.CONTACTED,
  LeadStage.QUALIFIED,
  LeadStage.NURTURING,
] as const;

/**
 * EF-630 — stage labels are translation-catalog keys; the rendered text
 * lives in `src/i18n/messages/leads.ts`.
 */
export const LEAD_STAGE_LABELS: Record<LeadStage, MessageKey> = {
  NEW: "leads.stage.new",
  CONTACTED: "leads.stage.contacted",
  QUALIFIED: "leads.stage.qualified",
  NURTURING: "leads.stage.nurturing",
};

const ALLOWED_LEAD_TRANSITIONS: Readonly<
  Record<LeadStage, readonly LeadStage[]>
> = {
  NEW: [LeadStage.CONTACTED],
  CONTACTED: [LeadStage.QUALIFIED, LeadStage.NEW],
  QUALIFIED: [LeadStage.NURTURING, LeadStage.CONTACTED],
  NURTURING: [LeadStage.CONTACTED],
};

export function getAllowedLeadTransitions(
  stage: LeadStage,
): readonly LeadStage[] {
  return ALLOWED_LEAD_TRANSITIONS[stage];
}

export type GroupedLeads = Record<LeadStage, readonly LeadBoardLeadDto[]>;

export function appendLeadBoardPage(
  current: readonly LeadBoardLeadDto[],
  next: readonly LeadBoardLeadDto[],
): readonly LeadBoardLeadDto[] {
  return [...current, ...next];
}

export function replaceLeadAfterTransition(
  leads: readonly LeadBoardLeadDto[],
  organizationId: string,
  leadId: string,
  returnedLead: LeadBoardLeadDto,
): readonly LeadBoardLeadDto[] {
  if (
    returnedLead.organizationId !== organizationId ||
    returnedLead.id !== leadId
  )
    return leads;
  return leads.map((lead) =>
    lead.id === leadId && lead.organizationId === organizationId
      ? returnedLead
      : lead,
  );
}

export function groupLeadsByStage(
  leads: readonly LeadBoardLeadDto[],
): GroupedLeads {
  const grouped: Record<LeadStage, LeadBoardLeadDto[]> = {
    NEW: [],
    CONTACTED: [],
    QUALIFIED: [],
    NURTURING: [],
  };
  for (const lead of leads) grouped[lead.stage].push(lead);
  return grouped;
}

export type LeadBoardErrorKind =
  "unauthorized" | "forbidden" | "not-found" | "stale" | "csrf" | "error";

export type LeadBoardErrorState = Readonly<{
  kind: LeadBoardErrorKind;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
}>;

export function isLeadMutationSessionRejection(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 401 ||
      error.status === 403 ||
      error.code.toUpperCase().includes("CSRF"))
  );
}

export function getLeadBoardErrorState(
  error: unknown,
  context: Readonly<{ mutation?: boolean }> = {},
): LeadBoardErrorState {
  if (context.mutation && isLeadMutationSessionRejection(error))
    return {
      kind: "csrf",
      titleKey: "leads.error.csrfTitle",
      descriptionKey: "leads.error.csrfDescription",
    };
  if (error instanceof ApiError && error.status === 401)
    return {
      kind: "unauthorized",
      titleKey: "leads.error.unauthorizedTitle",
      descriptionKey: "leads.error.unauthorizedDescription",
    };
  if (error instanceof ApiError && error.status === 403)
    return {
      kind: "forbidden",
      titleKey: "leads.error.forbiddenTitle",
      descriptionKey: "leads.error.forbiddenDescription",
    };
  if (error instanceof ApiError && error.status === 404)
    return {
      kind: "not-found",
      titleKey: "leads.error.notFoundTitle",
      descriptionKey: "leads.error.notFoundDescription",
    };
  if (error instanceof ApiError && error.status === 409)
    return {
      kind: "stale",
      titleKey: "leads.error.staleTitle",
      descriptionKey: "leads.error.staleDescription",
    };
  return {
    kind: "error",
    titleKey: "leads.error.genericTitle",
    descriptionKey: "leads.error.genericDescription",
  };
}

import { ApiError } from "../../lib/api-client/index";
import { LeadStage, type LeadBoardLeadDto } from "../../lib/api-client/leads";

export const LEAD_STAGES = [
  LeadStage.NEW,
  LeadStage.CONTACTED,
  LeadStage.QUALIFIED,
  LeadStage.NURTURING,
] as const;

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  NEW: "جديد",
  CONTACTED: "تم التواصل",
  QUALIFIED: "مؤهل",
  NURTURING: "قيد المتابعة",
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

export type LeadBoardErrorState = Readonly<{
  kind: "unauthorized" | "forbidden" | "not-found" | "stale" | "csrf" | "error";
  title: string;
  description: string;
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
      title: "تعذر التحقق من الجلسة",
      description:
        "انتهت الجلسة أو تعذر التحقق من طلبك. أعد التحقق من الجلسة قبل المحاولة مرة أخرى.",
    };
  if (error instanceof ApiError && error.status === 401)
    return {
      kind: "unauthorized",
      title: "يلزم تسجيل الدخول",
      description: "سجّل الدخول لعرض العملاء المحتملين.",
    };
  if (error instanceof ApiError && error.status === 403)
    return {
      kind: "forbidden",
      title: "لا تملك صلاحية العرض",
      description: "لا يمكن عرض عملاء هذه المؤسسة بهذا الحساب.",
    };
  if (error instanceof ApiError && error.status === 404)
    return {
      kind: "not-found",
      title: "المؤسسة غير موجودة",
      description: "تحقق من الرابط أو اطلب من المسؤول مراجعة المؤسسة.",
    };
  if (error instanceof ApiError && error.status === 409)
    return {
      kind: "stale",
      title: "تغيرت بيانات العميل",
      description: "أعد تحميل اللوحة قبل تنفيذ هذا الإجراء.",
    };
  return {
    kind: "error",
    title: "تعذر تنفيذ الإجراء",
    description: "حدث خطأ غير متوقع. جرّب مرة أخرى.",
  };
}

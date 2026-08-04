"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./lead-board.module.css";
import { createApiClient } from "../../lib/api-client/index";
import type { LeadBoardLeadDto, LeadStage } from "../../lib/api-client/leads";
import { createSessionCsrfProvider, type SessionCsrfProvider } from "../../lib/api-client/session";
import { useOrganizationContext } from "../organization-context/organization-context";
import { appendLeadBoardPage, getAllowedLeadTransitions, getLeadBoardErrorState, groupLeadsByStage, isLeadMutationSessionRejection, LEAD_STAGE_LABELS, LEAD_STAGES, replaceLeadAfterTransition } from "./lead-board-model";

const apiClient = createApiClient();
const sessionCsrfProvider: SessionCsrfProvider = createSessionCsrfProvider(apiClient);

type BoardState = Readonly<{ items: readonly LeadBoardLeadDto[]; nextCursor: string | null }>;

export function LeadBoard() {
  const { organizationId } = useOrganizationContext();
  const [board, setBoard] = useState<BoardState>({ items: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [pendingCommands, setPendingCommands] = useState<ReadonlySet<string>>(new Set());
  const [actionError, setActionError] = useState<{ leadId: string; error: unknown } | null>(null);

  const load = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const response = await apiClient.getLeadBoard({ organizationId, query: cursor ? { cursor } : {} });
      setBoard((current) => cursor ? { items: appendLeadBoardPage(current.items, response.items), nextCursor: response.nextCursor } : response);
    } catch (caught) {
      setError(caught);
    } finally {
      if (cursor) setLoadingMore(false); else setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load, retryKey]);

  const grouped = useMemo(() => groupLeadsByStage(board.items), [board.items]);

  const transition = useCallback(async (lead: LeadBoardLeadDto, to: LeadStage) => {
    const commandKey = `${lead.id}:${to}`;
    if (pendingCommands.has(commandKey)) return;
    setPendingCommands((current) => new Set(current).add(commandKey));
    setActionError(null);
    try {
      const csrfToken = await sessionCsrfProvider.getToken();
      const response = await apiClient.transitionLead({ organizationId, leadId: lead.id, to, expectedVersion: lead.version, csrfToken });
      const updatedItems = replaceLeadAfterTransition(board.items, organizationId, lead.id, response.lead);
      if (updatedItems === board.items) throw new Error("Invalid lead transition response");
      setBoard((current) => ({ ...current, items: replaceLeadAfterTransition(current.items, organizationId, lead.id, response.lead) }));
    } catch (caught) {
      if (isLeadMutationSessionRejection(caught)) sessionCsrfProvider.clear();
      setActionError({ leadId: lead.id, error: caught });
    } finally {
      setPendingCommands((current) => { const next = new Set(current); next.delete(commandKey); return next; });
    }
  }, [board.items, organizationId, pendingCommands]);

  const reloadAfterConflict = useCallback(() => {
    setActionError(null);
    setRetryKey((key) => key + 1);
  }, []);

  const reacquireSession = useCallback(async (leadId: string) => {
    try {
      await sessionCsrfProvider.getToken();
      setActionError((current) => current?.leadId === leadId ? null : current);
    } catch (caught) {
      setActionError({ leadId, error: caught });
    }
  }, []);
  if (loading) return <BoardStateCard busy title="جارٍ تحميل العملاء المحتملين" description="نجهز لوحة المتابعة." />;
  if (error) {
    const state = getLeadBoardErrorState(error);
    return <BoardStateCard title={state.title} description={state.description} actionLabel="إعادة المحاولة" onAction={() => setRetryKey((key) => key + 1)} />;
  }

  return (
    <section className="page-stack" aria-labelledby="lead-board-title">
      <header className="page-heading">
        <div>
          <p className="eyebrow">مساحة المؤسسة</p>
          <h1 id="lead-board-title">لوحة العملاء المحتملين</h1>
          <p>عرض للقراءة فقط لمتابعة العملاء حسب المرحلة.</p>
        </div>
        <span className="table-count" aria-label={`إجمالي العملاء المحتملين: ${board.items.length}`}>{board.items.length} عميل</span>
      </header>
      {board.items.length === 0 ? (
        <BoardStateCard title="لا توجد عملاء محتملون بعد" description="ستظهر العملاء هنا عند وصول بيانات المؤسسة." />
      ) : (
        <div className={styles.board} aria-label="مراحل العملاء المحتملين">
          {LEAD_STAGES.map((stage) => (
            <section className={styles.column} key={stage} aria-labelledby={`lead-stage-${stage}`}>
              <header className={styles.columnHeading}>
                <h2 id={`lead-stage-${stage}`}>{LEAD_STAGE_LABELS[stage]}</h2>
                <span className="table-count" aria-label={`عدد ${LEAD_STAGE_LABELS[stage]}: ${grouped[stage].length}`}>{grouped[stage].length}</span>
              </header>
              <div className={styles.cards}>
                {grouped[stage].map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    pendingTransition={(to) => pendingCommands.has(`${lead.id}:${to}`)}
                    actionError={actionError?.leadId === lead.id ? actionError.error : null}
                    onTransition={(to) => void transition(lead, to)}
                    onReload={reloadAfterConflict}
                    onReacquireSession={reacquireSession}
                  />
                ))}
                {grouped[stage].length === 0 && <p className={styles.empty}>لا توجد سجلات</p>}
              </div>
            </section>
          ))}
        </div>
      )}
      {board.nextCursor && (
        <div className={`button-row ${styles.loadMore}`}>
          <button className="button button-secondary" disabled={loadingMore} onClick={() => void load(board.nextCursor ?? undefined)} type="button">
            {loadingMore ? "جارٍ التحميل…" : "تحميل المزيد"}
          </button>
        </div>
      )}
    </section>
  );
}

function LeadCard({ lead, pendingTransition, actionError, onTransition, onReload, onReacquireSession }: Readonly<{ lead: LeadBoardLeadDto; pendingTransition: (to: LeadStage) => boolean; actionError: unknown; onTransition: (to: LeadStage) => void; onReload: () => void; onReacquireSession: (leadId: string) => void }>) {
  const errorState = actionError ? getLeadBoardErrorState(actionError, { mutation: true }) : null;
  return (
    <article className={styles.card}>
      <strong>{lead.nextAction}</strong><span>المصدر: {lead.source}</span>
      <div className="button-row" aria-label={`إجراءات ${LEAD_STAGE_LABELS[lead.stage]}`}>
        {getAllowedLeadTransitions(lead.stage).map((to) => (
          <button className="button button-secondary" disabled={pendingTransition(to)} key={to} onClick={() => onTransition(to)} type="button">
            {pendingTransition(to) ? "جارٍ الحفظ…" : `نقل إلى ${LEAD_STAGE_LABELS[to]}`}
          </button>
        ))}
      </div>
      {errorState && <div role="alert"><p>{errorState.title}</p><p>{errorState.description}</p>{errorState.kind === "stale" && <button className="button button-secondary" onClick={onReload} type="button">إعادة تحميل</button>}{errorState.kind === "csrf" && <button className="button button-secondary" onClick={() => void onReacquireSession(lead.id)} type="button">إعادة التحقق من الجلسة</button>}</div>}
    </article>
  );
}

function BoardStateCard({ busy = false, title, description, actionLabel, onAction }: Readonly<{ busy?: boolean; title: string; description: string; actionLabel?: string; onAction?: () => void }>) {
  return <section aria-busy={busy} className="state-card" role={busy ? "status" : "alert"}><p className="eyebrow">العملاء المحتملون</p><h1>{title}</h1><p>{description}</p>{actionLabel && onAction && <button className="button button-primary" onClick={onAction} type="button">{actionLabel}</button>}</section>;
}

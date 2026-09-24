"use client";

import { useCallback, useEffect, useState } from "react";
import {
  approveBroker,
  fetchPendingBrokers,
  reinstateBroker,
  suspendBroker,
} from "./admin-api";
import { isStepUpRequiredError } from "./admin-api";
import { labelFrom, MEMBERSHIP_STATUS_LABELS } from "./admin-labels";
import type { PendingBroker, PendingBrokersPage } from "./admin-contract";
import { StepUpForm } from "./step-up-form";
import styles from "./admin.module.css";

type Decision = "suspend" | "reinstate";

type PendingCommand = Readonly<{
  broker: PendingBroker;
  decision: Decision;
  reason: string;
}>;

/**
 * EF-620 — pending brokers queue across every tenant plus platform-level
 * suspend/reinstate. Identity and state only; no account identifiers or
 * secrets are rendered. Suspend is sensitive: a mandatory reason plus a fresh
 * password re-confirmation, both re-enforced by the API when the command
 * arrives (403 STEP_UP_REQUIRED opens the re-auth form, then the command is
 * retried once).
 */
export function BrokersQueueView() {
  const [page, setPage] = useState<PendingBrokersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openFormId, setOpenFormId] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setPage(await fetchPendingBrokers({}));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(broker: PendingBroker) {
    setBusyId(broker.membershipId);
    setActionError(null);
    try {
      await approveBroker({
        organizationId: broker.organizationId,
        membershipId: broker.membershipId,
      });
      await load();
    } catch {
      setActionError("تعذر اعتماد الوسيط. تحقق من الجلسة وحاول مرة أخرى.");
    } finally {
      setBusyId(null);
      setOpenFormId(null);
    }
  }

  async function decide(command: PendingCommand): Promise<boolean> {
    setBusyId(command.broker.membershipId);
    setActionError(null);
    try {
      if (command.decision === "suspend") {
        await suspendBroker({
          organizationId: command.broker.organizationId,
          membershipId: command.broker.membershipId,
          reason: command.reason,
        });
      } else {
        await reinstateBroker({
          organizationId: command.broker.organizationId,
          membershipId: command.broker.membershipId,
          reason: command.reason,
        });
      }
      await load();
      return true;
    } catch (caught) {
      if (isStepUpRequiredError(caught)) {
        setPendingCommand(command);
        setActionError(
          "يتطلب هذا الإجراء إعادة تأكيد كلمة المرور قبل التنفيذ.",
        );
        return false;
      }
      setActionError(
        "تعذر تنفيذ القرار. تأكد من كتابة السبب وحالة الوسيط ثم حاول مرة أخرى.",
      );
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function onStepUpConfirmed() {
    const command = pendingCommand;
    setPendingCommand(null);
    if (command) {
      const done = await decide(command);
      if (done) setOpenFormId(null);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">لوحة الإدارة</p>
          <h1>الوسطاء العقاريون</h1>
          <p>
            طلبات انضمام الوسطاء في كل المؤسسات، وإدارة الإيقاف على مستوى
            المنصة.
          </p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void load()}
        >
          تحديث
        </button>
      </header>
      {loading && <p role="status">جارٍ تحميل الطلبات…</p>}
      {error && (
        <div className="state-card" role="alert">
          <strong>تعذر تحميل قائمة الوسطاء</strong>
          <p>تحقق من الجلسة ثم حاول مرة أخرى.</p>
        </div>
      )}
      {actionError && (
        <div className="state-card" role="alert">
          {actionError}
        </div>
      )}
      {!loading && !error && (
        <section aria-labelledby="brokers-title" className="panel">
          <div className={styles.sectionHeading}>
            <h2 id="brokers-title">الوسطاء وحالاتهم</h2>
            <span className="table-count">{page?.items.length ?? 0} عنصر</span>
          </div>
          {page === null || page.items.length === 0 ? (
            <p>لا توجد طلبات أو وسطاء مطابقون حالياً.</p>
          ) : (
            <ul className={styles.list}>
              {page.items.map((broker) => (
                <li key={broker.membershipId}>
                  <div>
                    <strong>{broker.organizationName}</strong>
                    <span>
                      الحالة:{" "}
                      {labelFrom(MEMBERSHIP_STATUS_LABELS, broker.status)}
                    </span>
                    <span>
                      طلب الانضمام: {formatDate(broker.createdAt)}
                      {broker.approvedAt
                        ? ` · الاعتماد: ${formatDate(broker.approvedAt)}`
                        : ""}
                    </span>
                  </div>
                  <div className={styles.actions}>
                    {broker.status === "PENDING" && (
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={busyId === broker.membershipId}
                        onClick={() => void approve(broker)}
                      >
                        اعتماد
                      </button>
                    )}
                    {broker.status === "ACTIVE" && (
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() =>
                          setOpenFormId(
                            openFormId === broker.membershipId
                              ? null
                              : broker.membershipId,
                          )
                        }
                      >
                        إيقاف
                      </button>
                    )}
                    {broker.status === "SUSPENDED" && (
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() =>
                          setOpenFormId(
                            openFormId === broker.membershipId
                              ? null
                              : broker.membershipId,
                          )
                        }
                      >
                        إعادة التفعيل
                      </button>
                    )}
                  </div>
                  {openFormId === broker.membershipId && (
                    <ReasonForm
                      title={
                        broker.status === "ACTIVE"
                          ? "إيقاف الوسيط على مستوى المنصة"
                          : "إعادة تفعيل الوسيط"
                      }
                      hint={
                        broker.status === "ACTIVE"
                          ? "الإيقاف حسّاس: يُطلب السبب ثم إعادة تأكيد كلمة المرور، ويُسجَّل كل ذلك في سجل الإدارة."
                          : "اذكر سبب إعادة التفعيل؛ يُسجَّل في سجل الإدارة ولا يمكن تعديله."
                      }
                      busy={busyId === broker.membershipId}
                      onSubmit={(reason) =>
                        void decide({
                          broker,
                          decision:
                            broker.status === "ACTIVE"
                              ? "suspend"
                              : "reinstate",
                          reason,
                        })
                      }
                      onCancel={() => setOpenFormId(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {pendingCommand && (
        <section className="panel" aria-label="إعادة تأكيد كلمة المرور">
          <h2>إعادة تأكيد الهوية</h2>
          <StepUpForm
            onConfirmed={() => void onStepUpConfirmed()}
            onCancel={() => setPendingCommand(null)}
          />
        </section>
      )}
    </div>
  );
}

/** Mandatory reason input for a privileged decision. */
function ReasonForm({
  title,
  hint,
  busy,
  onSubmit,
  onCancel,
}: {
  title: string;
  hint: string;
  busy: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length === 0 || trimmed.length > 500) {
      setLocalError("السبب مطلوب ولا يتجاوز 500 حرف.");
      return;
    }
    setLocalError(null);
    onSubmit(trimmed);
  }

  return (
    <form className={styles.commandForm} onSubmit={submit}>
      <strong>{title}</strong>
      <p className={styles.hint}>{hint}</p>
      <label>
        السبب (إلزامي)
        <textarea
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          required
        />
      </label>
      {localError && (
        <div className="state-card" role="alert">
          {localError}
        </div>
      )}
      <div className="button-row">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "جارٍ التنفيذ…" : "متابعة"}
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={onCancel}
          disabled={busy}
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "وقت غير متاح"
    : new Intl.DateTimeFormat("ar", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

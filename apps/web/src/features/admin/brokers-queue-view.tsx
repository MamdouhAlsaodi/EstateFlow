"use client";

import { useCallback, useEffect, useState } from "react";
import {
  approveBroker,
  fetchPendingBrokers,
  reinstateBroker,
  suspendBroker,
} from "./admin-api";
import { isStepUpRequiredError } from "./admin-api";
import { formatDateTime, labelFromKey, useT } from "../../i18n";
import { MEMBERSHIP_STATUS_LABELS } from "./admin-labels";
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
  const t = useT();
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
      setActionError(t("admin.brokers.approveFailed"));
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
        setActionError(t("admin.brokers.stepUpRequired"));
        return false;
      }
      setActionError(t("admin.brokers.decideFailed"));
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
          <p className="eyebrow">{t("admin.common.eyebrow")}</p>
          <h1>{t("admin.brokers.title")}</h1>
          <p>{t("admin.brokers.subtitle")}</p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void load()}
        >
          {t("admin.common.refresh")}
        </button>
      </header>
      {loading && <p role="status">{t("admin.brokers.loading")}</p>}
      {error && (
        <div className="state-card" role="alert">
          <strong>{t("admin.brokers.loadFailed")}</strong>
          <p>{t("admin.brokers.loadFailedHint")}</p>
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
            <h2 id="brokers-title">{t("admin.brokers.listTitle")}</h2>
            <span className="table-count">
              {t("admin.brokers.itemCount", { count: page?.items.length ?? 0 })}
            </span>
          </div>
          {page === null || page.items.length === 0 ? (
            <p>{t("admin.brokers.empty")}</p>
          ) : (
            <ul className={styles.list}>
              {page.items.map((broker) => (
                <li key={broker.membershipId}>
                  <div>
                    <strong>{broker.organizationName}</strong>
                    <span>
                      {t("admin.brokers.statusPrefix")}{" "}
                      {labelFromKey(
                        MEMBERSHIP_STATUS_LABELS,
                        t,
                        broker.status,
                        broker.status,
                      )}
                    </span>
                    <span>
                      {t("admin.brokers.requestPrefix")}{" "}
                      {formatDate(
                        broker.createdAt,
                        t("admin.common.timeUnavailable"),
                      )}
                      {broker.approvedAt
                        ? ` · ${t("admin.brokers.approvedPrefix")} ${formatDate(broker.approvedAt, t("admin.common.timeUnavailable"))}`
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
                        {t("admin.brokers.approve")}
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
                        {t("admin.brokers.suspend")}
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
                        {t("admin.brokers.reinstate")}
                      </button>
                    )}
                  </div>
                  {openFormId === broker.membershipId && (
                    <ReasonForm
                      title={
                        broker.status === "ACTIVE"
                          ? t("admin.brokers.suspendTitle")
                          : t("admin.brokers.reinstateTitle")
                      }
                      hint={
                        broker.status === "ACTIVE"
                          ? t("admin.brokers.suspendHint")
                          : t("admin.brokers.reinstateHint")
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
        <section className="panel" aria-label={t("admin.common.stepUpAria")}>
          <h2>{t("admin.common.stepUpTitle")}</h2>
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
  const t = useT();
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length === 0 || trimmed.length > 500) {
      setLocalError(t("admin.common.reasonInvalid"));
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
        {t("admin.common.reasonLabel")}
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
          {busy ? t("admin.common.pending") : t("admin.common.continue")}
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={onCancel}
          disabled={busy}
        >
          {t("admin.common.cancel")}
        </button>
      </div>
    </form>
  );
}

function formatDate(value: string, fallback: string): string {
  try {
    return formatDateTime(value);
  } catch {
    return fallback;
  }
}

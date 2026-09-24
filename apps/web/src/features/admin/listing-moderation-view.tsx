"use client";

import { useCallback, useEffect, useState } from "react";
import {
  approveListingModeration,
  fetchModerationQueue,
  isStepUpRequiredError,
  rejectListingModeration,
  takedownListing,
} from "./admin-api";
import { formatDateTime, labelFromKey, useT } from "../../i18n";
import {
  LISTING_STATUS_LABELS,
  MODERATION_STATUS_LABELS,
} from "./admin-labels";
import type { ModerationItem, ModerationQueuePage } from "./admin-contract";
import { StepUpForm } from "./step-up-form";
import styles from "./admin.module.css";

type Decision = "approve" | "reject" | "takedown";

type PendingCommand = Readonly<{
  item: ModerationItem;
  decision: Decision;
  reason: string;
}>;

/**
 * EF-620 — platform moderation queue for published listings. Approve keeps a
 * listing public; reject/takedown archive it with a mandatory reason.
 * Takedown is sensitive: mandatory reason + fresh password re-confirmation,
 * both re-enforced by the API (403 STEP_UP_REQUIRED opens the re-auth form).
 */
export function ListingModerationView() {
  const t = useT();
  const [page, setPage] = useState<ModerationQueuePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openFormId, setOpenFormId] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setPage(await fetchModerationQueue({}));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(command: PendingCommand): Promise<boolean> {
    setBusyId(command.item.listingId);
    setActionError(null);
    setNotice(null);
    try {
      if (command.decision === "approve") {
        await approveListingModeration({
          organizationId: command.item.organizationId,
          listingId: command.item.listingId,
          reason: command.reason,
        });
        setNotice(t("admin.moderation.approvedNotice"));
      } else if (command.decision === "reject") {
        await rejectListingModeration({
          organizationId: command.item.organizationId,
          listingId: command.item.listingId,
          reason: command.reason,
        });
        setNotice(t("admin.moderation.rejectedNotice"));
      } else {
        await takedownListing({
          organizationId: command.item.organizationId,
          listingId: command.item.listingId,
          reason: command.reason,
        });
        setNotice(t("admin.moderation.takedownNotice"));
      }
      await load();
      return true;
    } catch (caught) {
      if (isStepUpRequiredError(caught)) {
        setPendingCommand(command);
        setActionError(t("admin.moderation.stepUpRequired"));
        return false;
      }
      setActionError(t("admin.moderation.decideFailed"));
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
          <h1>{t("admin.moderation.title")}</h1>
          <p>{t("admin.moderation.subtitle")}</p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void load()}
        >
          {t("admin.common.refresh")}
        </button>
      </header>
      {loading && <p role="status">{t("admin.moderation.loading")}</p>}
      {error && (
        <div className="state-card" role="alert">
          <strong>{t("admin.moderation.loadFailed")}</strong>
          <p>{t("admin.moderation.loadFailedHint")}</p>
        </div>
      )}
      {actionError && (
        <div className="state-card" role="alert">
          {actionError}
        </div>
      )}
      {notice && (
        <div className="state-card" role="status">
          {notice}
        </div>
      )}
      {!loading && !error && (
        <section aria-labelledby="queue-title" className="panel">
          <div className={styles.sectionHeading}>
            <h2 id="queue-title">{t("admin.moderation.queueTitle")}</h2>
            <span className="table-count">
              {t("admin.moderation.itemCount", {
                count: page?.items.length ?? 0,
              })}
            </span>
          </div>
          {page === null || page.items.length === 0 ? (
            <p>{t("admin.moderation.empty")}</p>
          ) : (
            <ul className={styles.list}>
              {page.items.map((item) => (
                <li key={item.listingId}>
                  <div>
                    <strong>{item.propertyTitle}</strong>
                    <span>
                      {labelFromKey(
                        LISTING_STATUS_LABELS,
                        t,
                        item.listingStatus,
                        item.listingStatus,
                      )}{" "}
                      ·{" "}
                      {labelFromKey(
                        MODERATION_STATUS_LABELS,
                        t,
                        item.moderationStatus,
                        item.moderationStatus,
                      )}
                    </span>
                    <span>
                      {t("admin.moderation.publishedPrefix")}{" "}
                      {formatDate(
                        item.createdAt,
                        t("admin.common.timeUnavailable"),
                      )}{" "}
                      · {t("admin.moderation.updatedPrefix")}{" "}
                      {formatDate(
                        item.updatedAt,
                        t("admin.common.timeUnavailable"),
                      )}
                    </span>
                    {item.moderationReason && (
                      <span>
                        {t("admin.moderation.previousReasonPrefix")}{" "}
                        {item.moderationReason}
                        {item.moderatedAt
                          ? ` · ${formatDate(item.moderatedAt, t("admin.common.timeUnavailable"))}`
                          : ""}
                      </span>
                    )}
                  </div>
                  <div className={styles.actions}>
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={busyId === item.listingId}
                      onClick={() => {
                        setPendingCommand(null);
                        void decide({
                          item,
                          decision: "approve",
                          reason: "",
                        }).then((done) => {
                          if (done) setOpenFormId(null);
                        });
                      }}
                    >
                      {t("admin.moderation.approve")}
                    </button>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() =>
                        setOpenFormId(
                          openFormId === item.listingId ? null : item.listingId,
                        )
                      }
                    >
                      {t("admin.moderation.rejectOrTakedown")}
                    </button>
                  </div>
                  {openFormId === item.listingId && (
                    <ModerationForm
                      busy={busyId === item.listingId}
                      onReject={(reason) =>
                        void decide({
                          item,
                          decision: "reject",
                          reason,
                        }).then((done) => {
                          if (done) setOpenFormId(null);
                        })
                      }
                      onTakedown={(reason) =>
                        void decide({
                          item,
                          decision: "takedown",
                          reason,
                        }).then((done) => {
                          if (done) setOpenFormId(null);
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

/**
 * Reject or takedown share one reason input; takedown additionally requires
 * the password re-confirmation, enforced first by the API answer.
 */
function ModerationForm({
  busy,
  onReject,
  onTakedown,
  onCancel,
}: {
  busy: boolean;
  onReject: (reason: string) => void;
  onTakedown: (reason: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(event: React.FormEvent, decision: "reject" | "takedown") {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length === 0 || trimmed.length > 500) {
      setLocalError(t("admin.common.reasonInvalid"));
      return;
    }
    setLocalError(null);
    if (decision === "reject") onReject(trimmed);
    else onTakedown(trimmed);
  }

  return (
    <form
      className={styles.commandForm}
      onSubmit={(event) => event.preventDefault()}
    >
      <strong>{t("admin.moderation.decisionTitle")}</strong>
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
        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={(event) => submit(event, "reject")}
        >
          {t("admin.moderation.reject")}
        </button>
        <button
          className="button button-primary"
          type="button"
          disabled={busy}
          onClick={(event) => submit(event, "takedown")}
        >
          {t("admin.moderation.takedown")}
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

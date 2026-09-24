"use client";

import { useCallback, useEffect, useState } from "react";
import {
  approveListingModeration,
  fetchModerationQueue,
  isStepUpRequiredError,
  rejectListingModeration,
  takedownListing,
} from "./admin-api";
import {
  labelFrom,
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
        setNotice("تم اعتماد الإعلان.");
      } else if (command.decision === "reject") {
        await rejectListingModeration({
          organizationId: command.item.organizationId,
          listingId: command.item.listingId,
          reason: command.reason,
        });
        setNotice("تم رفض الإعلان وأرشفته.");
      } else {
        await takedownListing({
          organizationId: command.item.organizationId,
          listingId: command.item.listingId,
          reason: command.reason,
        });
        setNotice("تم تخفيض الإعلان عن النشر وأرشفته.");
      }
      await load();
      return true;
    } catch (caught) {
      if (isStepUpRequiredError(caught)) {
        setPendingCommand(command);
        setActionError(
          "يتطلب تخفيض الإعلان إعادة تأكيد كلمة المرور قبل التنفيذ.",
        );
        return false;
      }
      setActionError(
        "تعذر تنفيذ قرار المراجعة. تأكد من حالة الإعلان والسبب ثم حاول مرة أخرى.",
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
          <h1>مراجعة الإعلانات</h1>
          <p>
            الإعلانات المنشورة في كل المؤسسات بانتظار المراجعة. الاعتماد يبقي
            الإعلان منشوراً، والرفض أو التخفيض يؤرشفه مع تسجيل السبب.
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
      {loading && <p role="status">جارٍ تحميل قائمة المراجعة…</p>}
      {error && (
        <div className="state-card" role="alert">
          <strong>تعذر تحميل قائمة المراجعة</strong>
          <p>تحقق من الجلسة ثم حاول مرة أخرى.</p>
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
            <h2 id="queue-title">قائمة المراجعة</h2>
            <span className="table-count">{page?.items.length ?? 0} عنصر</span>
          </div>
          {page === null || page.items.length === 0 ? (
            <p>لا توجد إعلانات بانتظار المراجعة. أحسنت!</p>
          ) : (
            <ul className={styles.list}>
              {page.items.map((item) => (
                <li key={item.listingId}>
                  <div>
                    <strong>{item.propertyTitle}</strong>
                    <span>
                      {labelFrom(LISTING_STATUS_LABELS, item.listingStatus)} ·{" "}
                      {labelFrom(
                        MODERATION_STATUS_LABELS,
                        item.moderationStatus,
                      )}
                    </span>
                    <span>
                      نُشر/أُنشئ: {formatDate(item.createdAt)} · آخر تحديث:{" "}
                      {formatDate(item.updatedAt)}
                    </span>
                    {item.moderationReason && (
                      <span>
                        سبب سابق: {item.moderationReason}
                        {item.moderatedAt
                          ? ` · ${formatDate(item.moderatedAt)}`
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
                      اعتماد
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
                      رفض / تخفيض
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
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(event: React.FormEvent, decision: "reject" | "takedown") {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length === 0 || trimmed.length > 500) {
      setLocalError("السبب مطلوب ولا يتجاوز 500 حرف.");
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
      <strong>قرار المراجعة</strong>
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
        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={(event) => submit(event, "reject")}
        >
          رفض وأرشفة
        </button>
        <button
          className="button button-primary"
          type="button"
          disabled={busy}
          onClick={(event) => submit(event, "takedown")}
        >
          تخفيض عن النشر
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

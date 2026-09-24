"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useT } from "../../i18n";
import { useOrganizationContext } from "../organization-context/organization-context";
import {
  CONTENT_CHANNELS,
  CONTENT_FAILURE_KINDS,
  type ContentDetailResponse,
  type ContentStatus,
} from "./content-contract";
import {
  contentChannelLabels,
  contentFailureKindLabels,
  contentStatusHints,
  contentStatusLabels,
} from "./content-labels";
import {
  createContentRevision,
  editContentItem,
  fetchContentDetail,
  transitionContentItem,
} from "./content-api";
import { StatusBadge } from "./content-list-view";
import styles from "./content-views.module.css";

const EDIT_FORM = {
  title: "",
  body: "",
  channel: "INSTAGRAM",
  campaignId: "",
};

/**
 * EF-402 — item detail: lifecycle state, approval version/hash
 * timeline, revision-variant lineage, and guarded lifecycle actions. The
 * approval lock and published immutability are enforced by the server.
 */
export function ContentDetailView({
  contentItemId,
}: Readonly<{ contentItemId: string }>) {
  const t = useT();
  const { organizationId } = useOrganizationContext();
  const [detail, setDetail] = useState<ContentDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState(EDIT_FORM);
  const [scheduledFor, setScheduledFor] = useState("");
  const [failureKind, setFailureKind] = useState("CHANNEL_REJECTED");
  const [failureReason, setFailureReason] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await fetchContentDetail({ organizationId, contentItemId }));
    } catch {
      setError(t("content.detail.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [organizationId, contentItemId]);

  async function run(
    action: () => Promise<unknown>,
    message: string,
  ): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(message);
      await refresh();
    } catch {
      setError(t("content.detail.actionFailed"));
    } finally {
      setPending(false);
    }
  }

  function submitEdit(): void {
    if (
      form.title.trim().length === 0 ||
      form.body.trim().length === 0 ||
      !CONTENT_CHANNELS.includes(
        form.channel as (typeof CONTENT_CHANNELS)[number],
      )
    ) {
      setError(t("content.detail.editValidation"));
      return;
    }
    void run(
      () =>
        editContentItem(
          { organizationId, contentItemId },
          {
            title: form.title,
            body: form.body,
            channel: form.channel,
            ...(form.campaignId.trim() === ""
              ? {}
              : { campaignId: form.campaignId.trim() }),
          },
        ).then(() => setForm(EDIT_FORM)),
      t("content.detail.editedNotice"),
    );
  }

  function transition(
    toStatus: string,
    extra: {
      reason?: string;
      failureKind?: string;
      scheduledFor?: string;
    } = {},
    message: string = t("content.detail.statusUpdatedNotice"),
  ): void {
    void run(
      () =>
        transitionContentItem(
          { organizationId, contentItemId },
          {
            toStatus,
            ...extra,
          },
        ),
      message,
    );
  }

  function submitSchedule(): void {
    const iso =
      `${scheduledFor.trim()}`.length === 16
        ? `${scheduledFor.trim()}:00.000Z`
        : scheduledFor.trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(iso)) {
      setError(t("content.detail.scheduleValidation"));
      return;
    }
    transition(
      "SCHEDULED",
      { scheduledFor: iso },
      t("content.detail.scheduledNotice"),
    );
  }

  function submitFailure(): void {
    if (failureReason.trim().length === 0) {
      setError(t("content.detail.failureReasonRequired"));
      return;
    }
    transition(
      "FAILED",
      { failureKind, reason: failureReason },
      t("content.detail.failureNotice"),
    );
  }

  const item = detail?.item;
  const approvals = (detail?.transitions ?? []).filter(
    (entry) => entry.toStatus === "APPROVED" && entry.version !== undefined,
  );

  return (
    <div className="workspace-stack">
      <section aria-labelledby="content-item-title">
        <p className="eyebrow">
          <Link href={`/ar/organizations/${organizationId}/content`}>
            {t("content.detail.contentLink")}
          </Link>{" "}
          {t("content.detail.eyebrowRest")}
        </p>
        <h1 id="content-item-title">{item?.title ?? "…"}</h1>
        {item === undefined ? (
          <p>
            {loading
              ? t("content.common.loading")
              : t("content.detail.pressLoad")}
          </p>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <StatusBadge status={item.status} />
              <span>{t(contentChannelLabels[item.channel])}</span>
              {item.variantNumber > 1 && (
                <span style={{ color: "var(--ef-ink-muted)" }}>
                  {t("content.common.variantOf", {
                    number: item.variantNumber,
                  })}
                </span>
              )}
              {item.approvedVersion !== undefined && (
                <span style={{ color: "var(--ef-ink-muted)" }}>
                  {t("content.common.approvedVersion", {
                    version: item.approvedVersion,
                  })}
                </span>
              )}
            </div>
            <p style={{ color: "var(--ef-ink-muted)" }}>
              {t(contentStatusHints[item.status])}
            </p>
          </>
        )}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void refresh()}
            disabled={loading || pending}
          >
            {t("content.detail.load")}
          </button>
          {item !== undefined &&
            item.status !== "IDEA" &&
            item.status !== "DRAFT" && (
              <button
                className="button button-secondary"
                type="button"
                disabled={pending}
                onClick={() =>
                  void run(
                    () =>
                      createContentRevision({ organizationId, contentItemId }),
                    t("content.detail.revisionNotice"),
                  )
                }
              >
                {t("content.detail.createRevision")}
              </button>
            )}
        </div>
        {error && (
          <div role="alert" style={{ color: "#b3423a", marginTop: "0.75rem" }}>
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <p
            role="status"
            style={{ color: "var(--ef-teal)", marginTop: "0.75rem" }}
          >
            {notice}
          </p>
        )}
      </section>

      {item !== undefined && (
        <>
          <section aria-labelledby="content-body-title">
            <h2 id="content-body-title">{t("content.detail.bodyTitle")}</h2>
            <div className={styles.panel}>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{item.body}</p>
              {item.scheduledFor !== undefined && (
                <span style={{ color: "var(--ef-ink-muted)" }}>
                  {t("content.detail.scheduledFor", {
                    value: item.scheduledFor.slice(0, 16).replace("T", " "),
                  })}
                </span>
              )}
              {item.contentHash !== undefined && (
                <span
                  style={{
                    direction: "ltr",
                    display: "block",
                    wordBreak: "break-all",
                  }}
                >
                  hash: {item.contentHash}
                </span>
              )}
              {item.generatedTemplateId !== undefined &&
                item.sourcePropertyId !== undefined && (
                  <span
                    style={{
                      color: "var(--ef-ink-muted)",
                      direction: "ltr",
                      display: "block",
                      wordBreak: "break-all",
                    }}
                  >
                    {`generated: ${item.generatedTemplateId} v${item.generatedTemplateVersion ?? "?"} ← property ${item.sourcePropertyId} v${item.sourcePropertyVersion ?? "?"}`}
                  </span>
                )}
            </div>
          </section>

          <LifecycleActions
            status={item.status}
            pending={pending}
            form={form}
            setForm={setForm}
            onSubmitEdit={submitEdit}
            onTransition={transition}
            scheduledFor={scheduledFor}
            setScheduledFor={setScheduledFor}
            failureKind={failureKind}
            setFailureKind={setFailureKind}
            failureReason={failureReason}
            setFailureReason={setFailureReason}
            onSubmitSchedule={submitSchedule}
            onSubmitFailure={submitFailure}
          />

          <section aria-labelledby="content-versions-title">
            <h2 id="content-versions-title">
              {t("content.detail.timelineTitle")}
            </h2>
            {approvals.length === 0 ? (
              <p>{t("content.detail.notApprovedYet")}</p>
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t("content.detail.thVersion")}</th>
                      <th scope="col">{t("content.detail.thHash")}</th>
                      <th scope="col">{t("content.detail.thApprovedAt")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvals.map((entry) => (
                      <tr key={entry.id}>
                        <td>v{entry.version}</td>
                        <td
                          style={{ direction: "ltr", wordBreak: "break-all" }}
                        >
                          {entry.contentHash}
                        </td>
                        <td>
                          {entry.createdAt.slice(0, 16).replace("T", " ")} UTC
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="content-transitions-title">
            <h2 id="content-transitions-title">
              {t("content.detail.transitionsTitle")}
            </h2>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t("content.detail.thFrom")}</th>
                    <th scope="col">{t("content.detail.thTo")}</th>
                    <th scope="col">{t("content.detail.thDetails")}</th>
                    <th scope="col">{t("content.detail.thTime")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail?.transitions ?? []).map((entry) => (
                    <tr key={entry.id}>
                      <td>{t(contentStatusLabels[entry.fromStatus])}</td>
                      <td>{t(contentStatusLabels[entry.toStatus])}</td>
                      <td>
                        {entry.failureKind !== undefined
                          ? t(contentFailureKindLabels[entry.failureKind])
                          : (entry.reason ?? "—")}
                        {entry.version !== undefined
                          ? ` — v${entry.version}`
                          : ""}
                      </td>
                      <td>
                        {entry.createdAt.slice(0, 16).replace("T", " ")} UTC
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="content-variants-title">
            <h2 id="content-variants-title">
              {t("content.detail.variantsTitle")}
            </h2>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                display: "grid",
                gap: "0.5rem",
              }}
            >
              {(detail?.variants ?? []).map((variant) => (
                <li key={variant.id}>
                  {variant.id === item.id ? (
                    <strong>
                      #{variant.variantNumber} —{" "}
                      {t(contentStatusLabels[variant.status])}{" "}
                      {t("content.detail.thisVariantTag")}
                    </strong>
                  ) : (
                    <Link
                      href={`/ar/organizations/${organizationId}/content/${variant.id}`}
                    >
                      #{variant.variantNumber} — {variant.title} (
                      {t(contentStatusLabels[variant.status])})
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

type LifecycleActionsProps = Readonly<{
  status: ContentStatus;
  pending: boolean;
  form: typeof EDIT_FORM;
  setForm: (form: typeof EDIT_FORM) => void;
  onSubmitEdit: () => void;
  onTransition: (
    toStatus: string,
    extra?: { reason?: string },
    message?: string,
  ) => void;
  scheduledFor: string;
  setScheduledFor: (value: string) => void;
  failureKind: string;
  setFailureKind: (value: string) => void;
  failureReason: string;
  setFailureReason: (value: string) => void;
  onSubmitSchedule: () => void;
  onSubmitFailure: () => void;
}>;

function LifecycleActions({
  status,
  pending,
  form,
  setForm,
  onSubmitEdit,
  onTransition,
  scheduledFor,
  setScheduledFor,
  failureKind,
  setFailureKind,
  failureReason,
  setFailureReason,
  onSubmitSchedule,
  onSubmitFailure,
}: LifecycleActionsProps) {
  const t = useT();
  const editable = status === "IDEA" || status === "DRAFT";
  return (
    <section aria-labelledby="content-actions-title">
      <h2 id="content-actions-title">{t("content.actions.title")}</h2>
      <div className={styles.panel}>
        {editable && (
          <>
            <h3>{t("content.actions.editTitle")}</h3>
            <div className={styles.formGrid}>
              <label>
                {t("content.list.titleLabel")}
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
              </label>
              <label>
                {t("content.list.bodyLabel")}
                <textarea
                  rows={3}
                  value={form.body}
                  onChange={(event) =>
                    setForm({ ...form, body: event.target.value })
                  }
                />
              </label>
              <label>
                {t("content.actions.channelLabel")}
                <select
                  value={form.channel}
                  onChange={(event) =>
                    setForm({ ...form, channel: event.target.value })
                  }
                >
                  {CONTENT_CHANNELS.map((channel) => (
                    <option key={channel} value={channel}>
                      {t(contentChannelLabels[channel])}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                className="button button-primary"
                type="button"
                disabled={pending}
                onClick={onSubmitEdit}
              >
                {t("content.actions.saveEdit")}
              </button>
              {status === "IDEA" && (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    onTransition(
                      "DRAFT",
                      undefined,
                      t("content.actions.toDraftNotice"),
                    )
                  }
                >
                  {t("content.actions.toDraft")}
                </button>
              )}
            </div>
          </>
        )}
        {status === "DRAFT" && (
          <button
            className="button button-primary"
            type="button"
            disabled={pending}
            onClick={() =>
              onTransition(
                "REVIEW",
                undefined,
                t("content.actions.toReviewNotice"),
              )
            }
          >
            {t("content.actions.toReview")}
          </button>
        )}
        {status === "REVIEW" && (
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              className="button button-primary"
              type="button"
              disabled={pending}
              onClick={() =>
                onTransition(
                  "APPROVED",
                  undefined,
                  t("content.actions.approveNotice"),
                )
              }
            >
              {t("content.actions.approve")}
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={pending}
              onClick={() =>
                onTransition(
                  "DRAFT",
                  undefined,
                  t("content.actions.backToDraftNotice"),
                )
              }
            >
              {t("content.actions.backToDraft")}
            </button>
          </div>
        )}
        {status === "APPROVED" && (
          <>
            <h3>{t("content.actions.scheduleHeading")}</h3>
            <div className={styles.formGrid}>
              <label>
                {t("content.actions.scheduleLabel")}
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                />
              </label>
            </div>
            <button
              className="button button-primary"
              type="button"
              disabled={pending}
              onClick={onSubmitSchedule}
            >
              {t("content.actions.scheduleButton")}
            </button>
          </>
        )}
        {status === "SCHEDULED" && (
          <>
            <h3>{t("content.actions.publishExecTitle")}</h3>
            <p style={{ color: "var(--ef-ink-muted)", margin: 0 }}>
              {t("content.actions.publishExecNote")}
            </p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                className="button button-primary"
                type="button"
                disabled={pending}
                onClick={() =>
                  onTransition(
                    "PUBLISHED",
                    undefined,
                    t("content.actions.publishNotice"),
                  )
                }
              >
                {t("content.actions.publishButton")}
              </button>
            </div>
            <h3>{t("content.actions.failureTitle")}</h3>
            <div className={styles.formGrid}>
              <label>
                {t("content.actions.failureKindLabel")}
                <select
                  value={failureKind}
                  onChange={(event) => setFailureKind(event.target.value)}
                >
                  {CONTENT_FAILURE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(contentFailureKindLabels[kind])}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("content.actions.failureReasonLabel")}
                <input
                  value={failureReason}
                  onChange={(event) => setFailureReason(event.target.value)}
                />
              </label>
            </div>
            <button
              className="button button-secondary"
              type="button"
              disabled={pending}
              onClick={onSubmitFailure}
            >
              {t("content.actions.failureButton")}
            </button>
          </>
        )}
        {status === "FAILED" && (
          <button
            className="button button-secondary"
            type="button"
            disabled={pending}
            onClick={() =>
              onTransition(
                "REVIEW",
                undefined,
                t("content.actions.backToReviewNotice"),
              )
            }
          >
            {t("content.actions.backToReview")}
          </button>
        )}
        {!editable &&
          status !== "REVIEW" &&
          status !== "APPROVED" &&
          status !== "SCHEDULED" &&
          status !== "FAILED" && (
            <p style={{ color: "var(--ef-ink-muted)", margin: 0 }}>
              {t("content.actions.publishedImmutable")}
            </p>
          )}
      </div>
    </section>
  );
}

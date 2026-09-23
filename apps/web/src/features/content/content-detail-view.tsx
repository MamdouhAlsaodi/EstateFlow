"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
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
 * EF-402 — Arabic item detail: lifecycle state, approval version/hash
 * timeline, revision-variant lineage, and guarded lifecycle actions. The
 * approval lock and published immutability are enforced by the server.
 */
export function ContentDetailView({
  contentItemId,
}: Readonly<{ contentItemId: string }>) {
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
      setError("تعذر تحميل تفاصيل المحتوى. تحقق من الرابط وحاول مجددًا.");
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
      setError("تعذر تنفيذ الأمر. تحقق من صلاحياتك وحالة المحتوى.");
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
      setError("تحقق من حقول التعديل: العنوان، النص، والقناة.");
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
      "تم تعديل المحتوى.",
    );
  }

  function transition(
    toStatus: string,
    extra: {
      reason?: string;
      failureKind?: string;
      scheduledFor?: string;
    } = {},
    message = "تم تحديث حالة المحتوى.",
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
      setError("أدخل موعد نشر UTC بالصيغة 2026-10-01T09:00.");
      return;
    }
    transition("SCHEDULED", { scheduledFor: iso }, "تم جدولة المحتوى.");
  }

  function submitFailure(): void {
    if (failureReason.trim().length === 0) {
      setError("ذكر سبب الفشل إلزامي.");
      return;
    }
    transition(
      "FAILED",
      { failureKind, reason: failureReason },
      "تم توثيق فشل النشر.",
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
            المحتوى
          </Link>{" "}
          — تفاصيل العنصر
        </p>
        <h1 id="content-item-title">{item?.title ?? "…"}</h1>
        {item === undefined ? (
          <p>{loading ? "جارٍ التحميل…" : "اضغط «تحميل العنصر» للعرض."}</p>
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
              <span>{contentChannelLabels[item.channel]}</span>
              {item.variantNumber > 1 && (
                <span style={{ color: "var(--ef-ink-muted)" }}>
                  نسخة منقحة #{item.variantNumber}
                </span>
              )}
              {item.approvedVersion !== undefined && (
                <span style={{ color: "var(--ef-ink-muted)" }}>
                  النسخة المعتمدة v{item.approvedVersion}
                </span>
              )}
            </div>
            <p style={{ color: "var(--ef-ink-muted)" }}>
              {contentStatusHints[item.status]}
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
            تحميل العنصر
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
                    "تم إنشاء نسخة منقحة جديدة (مسودة).",
                  )
                }
              >
                إنشاء نسخة منقحة
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
            <h2 id="content-body-title">نص المحتوى</h2>
            <div className={styles.panel}>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{item.body}</p>
              {item.scheduledFor !== undefined && (
                <span style={{ color: "var(--ef-ink-muted)" }}>
                  موعد النشر: {item.scheduledFor.slice(0, 16).replace("T", " ")}{" "}
                  UTC
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
            <h2 id="content-versions-title">الخط الزمني للنسخ والاعتماد</h2>
            {approvals.length === 0 ? (
              <p>لم يُعتمد هذا العنصر بعد.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">النسخة</th>
                      <th scope="col">بصمة المحتوى (hash)</th>
                      <th scope="col">وقت الاعتماد</th>
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
            <h2 id="content-transitions-title">سجل الحالة (غير قابل للحذف)</h2>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">من</th>
                    <th scope="col">إلى</th>
                    <th scope="col">التفاصيل</th>
                    <th scope="col">الوقت</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail?.transitions ?? []).map((entry) => (
                    <tr key={entry.id}>
                      <td>{contentStatusLabels[entry.fromStatus]}</td>
                      <td>{contentStatusLabels[entry.toStatus]}</td>
                      <td>
                        {entry.failureKind !== undefined
                          ? contentFailureKindLabels[entry.failureKind]
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
            <h2 id="content-variants-title">نسخ التنقيح</h2>
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
                      {contentStatusLabels[variant.status]} (هذه)
                    </strong>
                  ) : (
                    <Link
                      href={`/ar/organizations/${organizationId}/content/${variant.id}`}
                    >
                      #{variant.variantNumber} — {variant.title} (
                      {contentStatusLabels[variant.status]})
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
  const editable = status === "IDEA" || status === "DRAFT";
  return (
    <section aria-labelledby="content-actions-title">
      <h2 id="content-actions-title">الأوامر المتاحة</h2>
      <div className={styles.panel}>
        {editable && (
          <>
            <h3>تعديل المحتوى</h3>
            <div className={styles.formGrid}>
              <label>
                العنوان
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
              </label>
              <label>
                النص
                <textarea
                  rows={3}
                  value={form.body}
                  onChange={(event) =>
                    setForm({ ...form, body: event.target.value })
                  }
                />
              </label>
              <label>
                القناة
                <select
                  value={form.channel}
                  onChange={(event) =>
                    setForm({ ...form, channel: event.target.value })
                  }
                >
                  {CONTENT_CHANNELS.map((channel) => (
                    <option key={channel} value={channel}>
                      {contentChannelLabels[channel]}
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
                حفظ التعديل
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
                      "تم تحويل الفكرة إلى مسودة.",
                    )
                  }
                >
                  تحويل إلى مسودة
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
                "أُرسل المحتوى إلى قائمة المراجعة.",
              )
            }
          >
            إرسال للمراجعة
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
                  "تم اعتماد المحتوى وقفل نسخته وبصمته.",
                )
              }
            >
              اعتماد (يقفل النسخة والبصمة)
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={pending}
              onClick={() =>
                onTransition("DRAFT", undefined, "أُعيد المحتوى إلى المسودة.")
              }
            >
              إعادة إلى المسودة
            </button>
          </div>
        )}
        {status === "APPROVED" && (
          <>
            <h3>جدولة النشر</h3>
            <div className={styles.formGrid}>
              <label>
                موعد النشر (UTC)
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
              جدولة النشر
            </button>
          </>
        )}
        {status === "SCHEDULED" && (
          <>
            <h3>تنفيذ النشر (حالة سير العمل)</h3>
            <p style={{ color: "var(--ef-ink-muted)", margin: 0 }}>
              التسليم الفعلي على القناة يتم عبر EF-404؛ هنا يُوثَّق ناتج النشر.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                className="button button-primary"
                type="button"
                disabled={pending}
                onClick={() =>
                  onTransition("PUBLISHED", undefined, "تم توثيق النشر.")
                }
              >
                توثيق النشر
              </button>
            </div>
            <h3>توثيق فشل النشر</h3>
            <div className={styles.formGrid}>
              <label>
                نوع الفشل
                <select
                  value={failureKind}
                  onChange={(event) => setFailureKind(event.target.value)}
                >
                  {CONTENT_FAILURE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {contentFailureKindLabels[kind]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                سبب الفشل (إلزامي)
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
              توثيق الفشل
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
                "أُعيد المحتوى إلى قائمة المراجعة.",
              )
            }
          >
            إعادة إلى المراجعة
          </button>
        )}
        {!editable &&
          status !== "REVIEW" &&
          status !== "APPROVED" &&
          status !== "SCHEDULED" &&
          status !== "FAILED" && (
            <p style={{ color: "var(--ef-ink-muted)", margin: 0 }}>
              المحتوى المنشور غير قابل للتغيير — استخدم «إنشاء نسخة منقحة».
            </p>
          )}
      </div>
    </section>
  );
}

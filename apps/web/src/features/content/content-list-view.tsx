"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useOrganizationContext } from "../organization-context/organization-context";
import {
  CONTENT_CHANNELS,
  CONTENT_STATUSES,
  type ContentListPage,
  type ContentStatus,
  type ContentSummary,
} from "./content-contract";
import { contentChannelLabels, contentStatusLabels } from "./content-labels";
import { createContentItem, fetchContentItems } from "./content-api";
import styles from "./content-views.module.css";

const EMPTY_FORM = {
  title: "",
  body: "",
  channel: "INSTAGRAM",
  campaignId: "",
};

/**
 * EF-402 — Arabic content list with lifecycle badges and an inline idea
 * creation form. Every figure comes from the strict API contract.
 */
export function ContentListView() {
  const { organizationId } = useOrganizationContext();
  const [page, setPage] = useState<ContentListPage | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPage(
        await fetchContentItems({
          organizationId,
          ...(statusFilter === "" ? {} : { status: statusFilter }),
        }),
      );
    } catch {
      setError("تعذر تحميل المحتوى من الخادم. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, statusFilter]);

  async function submitCreate(): Promise<void> {
    if (
      form.title.trim().length === 0 ||
      form.body.trim().length === 0 ||
      !CONTENT_CHANNELS.includes(
        form.channel as (typeof CONTENT_CHANNELS)[number],
      )
    ) {
      setError("تحقق من الحقول: العنوان، النص، والقناة.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await createContentItem(
        { organizationId },
        {
          title: form.title,
          body: form.body,
          channel: form.channel,
          ...(form.campaignId.trim() === ""
            ? {}
            : { campaignId: form.campaignId.trim() }),
        },
      );
      setForm(EMPTY_FORM);
      await refresh();
    } catch {
      setError("تعذر إنشاء المحتوى. تحقق من صلاحياتك ومن معرّف الحملة.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="workspace-stack">
      <section aria-labelledby="content-title">
        <p className="eyebrow">EF-402 — دورة حياة المحتوى</p>
        <h1 id="content-title">المحتوى التسويقي</h1>
        <p>
          دورة الحياة: فكرة ← مسودة ← مراجعة ← اعتماد ← جدولة ← نشر/فشل. يُقفل
          الاعتماد نسخة المحتوى وبصمته، والمحتوى المنشور غير قابل للتعديل؛
          التنقيح ينشئ نسخة جديدة تمرّ بالدورة كاملة.
        </p>
        <nav
          aria-label="أدوات المحتوى"
          style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}
        >
          <Link
            className="button button-secondary"
            href={`/ar/organizations/${organizationId}/content/review-queue`}
          >
            قائمة المراجعة
          </Link>
          <Link
            className="button button-secondary"
            href={`/ar/organizations/${organizationId}/content/calendar`}
          >
            تقويم النشر
          </Link>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void refresh()}
            disabled={loading || pending}
          >
            {loading ? "جارٍ التحميل…" : "تحديث القائمة"}
          </button>
        </nav>
        {error && (
          <div role="alert" style={{ color: "#b3423a", marginTop: "0.75rem" }}>
            <span>{error}</span>
          </div>
        )}
      </section>

      <section aria-labelledby="content-list-title">
        <h2 id="content-list-title">قائمة المحتوى</h2>
        <label style={{ display: "grid", gap: "0.25rem", maxWidth: "16rem" }}>
          تصفية الحالة
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">كل الحالات</option>
            {CONTENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {contentStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        {!page ? (
          <p>اضغط «تحديث القائمة» للعرض.</p>
        ) : page.items.length === 0 ? (
          <p>لا يوجد محتوى في هذه التصفية.</p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              display: "grid",
              gap: "0.75rem",
            }}
          >
            {page.items.map((item) => (
              <ContentCard
                key={item.id}
                item={item}
                organizationId={organizationId}
              />
            ))}
          </ul>
        )}
        {page?.nextCursor && (
          <p style={{ color: "var(--ef-ink-muted)" }}>
            توجد عناصر إضافية — استخدم تصفية الحالة لتضييق القائمة.
          </p>
        )}
      </section>

      <section aria-labelledby="content-create-title">
        <h2 id="content-create-title">فكرة جديدة</h2>
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
            قناة النشر (تخصيصي)
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
          <label>
            معرّف الحملة (اختياري)
            <input
              value={form.campaignId}
              onChange={(event) =>
                setForm({ ...form, campaignId: event.target.value })
              }
              dir="ltr"
            />
          </label>
        </div>
        <div style={{ marginTop: "0.75rem" }}>
          <button
            className="button button-primary"
            type="button"
            disabled={pending}
            onClick={() => void submitCreate()}
          >
            {pending ? "جارٍ الإنشاء…" : "إنشاء الفكرة"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ContentCard({
  item,
  organizationId,
}: {
  item: ContentSummary;
  organizationId: string;
}) {
  return (
    <li
      style={{
        border: "1px solid var(--ef-line)",
        borderRadius: "var(--ef-radius)",
        padding: "1rem",
        display: "grid",
        gap: "0.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Link href={`/ar/organizations/${organizationId}/content/${item.id}`}>
          <strong>{item.title}</strong>
        </Link>
        <StatusBadge status={item.status} />
        <span style={{ color: "var(--ef-ink-muted)" }}>
          {contentChannelLabels[item.channel]}
        </span>
        {item.variantNumber > 1 && (
          <span style={{ color: "var(--ef-ink-muted)" }}>
            نسخة منقحة #{item.variantNumber}
          </span>
        )}
      </div>
      <span style={{ color: "var(--ef-ink-muted)" }}>
        {item.approvedVersion === undefined
          ? "لم يُعتمد بعد"
          : `النسخة المعتمدة: v${item.approvedVersion}`}
        {item.scheduledFor === undefined
          ? ""
          : ` — مجدول: ${new Date(item.scheduledFor).toISOString().slice(0, 16).replace("T", " ")} UTC`}
      </span>
    </li>
  );
}

export function StatusBadge({ status }: { status: ContentStatus }) {
  const className = `${styles.statusChip} ${
    status === "IDEA"
      ? styles.statusIdea
      : status === "DRAFT"
        ? styles.statusDraft
        : status === "REVIEW"
          ? styles.statusReview
          : status === "APPROVED"
            ? styles.statusApproved
            : status === "SCHEDULED"
              ? styles.statusScheduled
              : status === "PUBLISHED"
                ? styles.statusPublished
                : styles.statusFailed
  }`;
  return <span className={className}>{contentStatusLabels[status]}</span>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useOrganizationContext } from "../organization-context/organization-context";
import { fetchViewings, requestViewing, viewingAction } from "./viewing-api";
import type { Viewing, ViewingPage } from "./viewing-contract";
import styles from "./viewing-views.module.css";

const labels: Record<Viewing["status"], string> = {
  REQUESTED: "قيد الطلب",
  CONFIRMED: "مؤكدة",
  CANCELLED: "ملغاة",
  COMPLETED: "مكتملة",
  NO_SHOW: "لم يحضر",
};
const EMPTY_FORM = {
  leadId: "",
  propertyId: "",
  brokerId: "",
  startAt: "",
  endAt: "",
};

export function ViewingsListView() {
  const { organizationId } = useOrganizationContext();
  const [page, setPage] = useState<ViewingPage | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const now = new Date();
      const from = new Date(now);
      from.setDate(now.getDate() - now.getDay());
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setDate(from.getDate() + 7);
      setPage(
        await fetchViewings({
          organizationId,
          from: from.toISOString(),
          to: to.toISOString(),
        }),
      );
    } catch {
      setError("تعذر تحميل جدول المعاينات.");
    } finally {
      setBusy(false);
    }
  }, [organizationId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function mutate(operation: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await operation();
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message.includes("VIEWING_CONFLICT")
          ? "هذا الموعد يتعارض مع معاينة مؤكدة أخرى."
          : "تعذر تنفيذ الإجراء. تحقق من الحالة والصلاحيات.",
      );
      setBusy(false);
    }
  }
  async function create(): Promise<void> {
    if (
      !form.leadId ||
      !form.propertyId ||
      !form.brokerId ||
      !form.startAt ||
      !form.endAt
    ) {
      setError("أدخل معرّفات العميل والعقار والوسيط والوقت UTC.");
      return;
    }
    await mutate(async () => {
      await requestViewing({
        organizationId,
        ...form,
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
      });
      setForm(EMPTY_FORM);
    });
  }
  return (
    <main className={styles.grid}>
      <section aria-labelledby="viewings-title">
        <p className="eyebrow">EF-501 — المواعيد والتوافر</p>
        <h1 id="viewings-title">معاينات هذا الأسبوع</h1>
        <p>الأوقات محفوظة كـ UTC، ولا يحجز وقت الوسيط إلا الموعد المؤكد.</p>
        <div className={styles.toolbar}>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
          >
            {busy ? "جارٍ التنفيذ…" : "تحديث الأسبوع"}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </section>
      <section aria-labelledby="calendar-title">
        <h2 id="calendar-title">اليوم / الأسبوع</h2>
        {!page ? (
          <p>جارٍ التحميل…</p>
        ) : page.items.length === 0 ? (
          <p>لا توجد معاينات في هذا الأسبوع.</p>
        ) : (
          <ul className={styles.cards}>
            {page.items.map((viewing) => (
              <ViewingCard
                key={viewing.id}
                organizationId={organizationId}
                viewing={viewing}
                busy={busy}
                mutate={mutate}
              />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="request-title">
        <h2 id="request-title">طلب معاينة</h2>
        <div className={styles.form}>
          {(["leadId", "propertyId", "brokerId"] as const).map((field) => (
            <label key={field}>
              {field === "leadId"
                ? "معرّف العميل"
                : field === "propertyId"
                  ? "معرّف العقار"
                  : "معرّف الوسيط"}
              <input
                dir="ltr"
                value={form[field]}
                onChange={(event) =>
                  setForm({ ...form, [field]: event.target.value })
                }
              />
            </label>
          ))}
          <label>
            البداية UTC
            <input
              dir="ltr"
              type="datetime-local"
              value={form.startAt}
              onChange={(event) =>
                setForm({ ...form, startAt: event.target.value })
              }
            />
          </label>
          <label>
            النهاية UTC
            <input
              dir="ltr"
              type="datetime-local"
              value={form.endAt}
              onChange={(event) =>
                setForm({ ...form, endAt: event.target.value })
              }
            />
          </label>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() => void create()}
          disabled={busy}
        >
          إرسال طلب المعاينة
        </button>
      </section>
    </main>
  );
}
function ViewingCard({
  organizationId,
  viewing,
  busy,
  mutate,
}: {
  organizationId: string;
  viewing: Viewing;
  busy: boolean;
  mutate: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  const actions: readonly {
    action: "confirm" | "cancel" | "complete" | "no-show";
    label: string;
  }[] =
    viewing.status === "REQUESTED"
      ? [
          { action: "confirm", label: "تأكيد" },
          { action: "cancel", label: "إلغاء" },
        ]
      : viewing.status === "CONFIRMED"
        ? [
            { action: "complete", label: "إتمام" },
            { action: "no-show", label: "لم يحضر" },
            { action: "cancel", label: "إلغاء" },
          ]
        : [];
  return (
    <li className={styles.card}>
      <strong>{labels[viewing.status]}</strong>
      <span className={styles.meta} dir="ltr">
        {viewing.startAt} — {viewing.endAt}
      </span>
      <span className={styles.meta}>
        الوسيط: <b dir="ltr">{viewing.brokerId}</b>
      </span>
      <span className={styles.meta}>
        العميل: <b dir="ltr">{viewing.leadId}</b>
      </span>
      <div className={styles.actions}>
        <Link
          className="button button-secondary"
          href={`/ar/organizations/${organizationId}/viewings/${viewing.id}`}
        >
          تفاصيل والتذكيرات
        </Link>
        {actions.map((item) => (
          <button
            className="button button-secondary"
            key={item.action}
            type="button"
            disabled={busy}
            onClick={() =>
              void mutate(() =>
                viewingAction({
                  organizationId,
                  viewingId: viewing.id,
                  action: item.action,
                }),
              )
            }
          >
            {item.label}
          </button>
        ))}
      </div>
    </li>
  );
}

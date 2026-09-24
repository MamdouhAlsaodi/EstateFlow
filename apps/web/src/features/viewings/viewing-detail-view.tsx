"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useOrganizationContext } from "../organization-context/organization-context";
import { fetchViewingDetail } from "./viewing-api";
import type { ViewingDetail } from "./viewing-contract";
import styles from "./viewing-views.module.css";

const reminderLabels: Record<
  ViewingDetail["upcomingReminders"][number]["kind"],
  string
> = {
  REMINDER_24H: "تذكير قبل 24 ساعة",
  REMINDER_1H: "تذكير قبل ساعة",
  OUTCOME_REQUEST: "طلب تسجيل النتيجة",
};

export function ViewingDetailView({ viewingId }: { viewingId: string }) {
  const { organizationId } = useOrganizationContext();
  const [detail, setDetail] = useState<ViewingDetail | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      setError(false);
      setDetail(await fetchViewingDetail({ organizationId, viewingId }));
    } catch {
      setError(true);
    }
  }, [organizationId, viewingId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p role="alert">تعذر تحميل تفاصيل المعاينة.</p>;
  if (!detail) return <p role="status">جارٍ تحميل التفاصيل…</p>;
  return (
    <main className={styles.grid}>
      <section aria-labelledby="viewing-detail-title">
        <p className="eyebrow">EF-502 — أتمتة المعاينة</p>
        <h1 id="viewing-detail-title">تفاصيل المعاينة والتذكيرات</h1>
        <p dir="ltr">
          {detail.viewing.startAt} — {detail.viewing.endAt}
        </p>
        <p>الحالة: {detail.viewing.status}</p>
        <p>الوسيط: {detail.viewing.brokerId}</p>
        <p>العميل: {detail.viewing.leadId}</p>
        <Link
          className="button button-secondary"
          href={`/ar/organizations/${organizationId}/viewings`}
        >
          العودة إلى جدول المعاينات
        </Link>
      </section>
      <section aria-labelledby="upcoming-reminders-title">
        <h2 id="upcoming-reminders-title">التذكيرات القادمة</h2>
        {detail.upcomingReminders.length === 0 ? (
          <p>لا توجد تذكيرات معلقة. قد تكون المعاينة ملغاة أو اكتملت.</p>
        ) : (
          <ul className={styles.cards}>
            {detail.upcomingReminders.map((reminder) => (
              <li
                className={styles.card}
                key={`${reminder.kind}:${reminder.occurrenceKey}`}
              >
                <strong>{reminderLabels[reminder.kind]}</strong>
                <time
                  className={styles.meta}
                  dateTime={reminder.scheduledFor}
                  dir="ltr"
                >
                  {reminder.scheduledFor}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

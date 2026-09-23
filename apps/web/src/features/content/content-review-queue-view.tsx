"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useOrganizationContext } from "../organization-context/organization-context";
import type { ReviewQueueResponse } from "./content-contract";
import { contentChannelLabels } from "./content-labels";
import { fetchReviewQueue } from "./content-api";
import styles from "./content-views.module.css";

/**
 * EF-402 — Arabic review queue: every content item waiting for approval,
 * oldest submission first, so the reviewer always works in fairness order.
 */
export function ContentReviewQueueView() {
  const { organizationId } = useOrganizationContext();
  const [queue, setQueue] = useState<ReviewQueueResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setQueue(await fetchReviewQueue({ organizationId }));
    } catch {
      setError("تعذر تحميل قائمة المراجعة. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  return (
    <div className="workspace-stack">
      <section aria-labelledby="review-queue-title">
        <p className="eyebrow">EF-402 — قائمة المراجعة</p>
        <h1 id="review-queue-title">محتوى ينتظر الاعتماد</h1>
        <p>
          العناصر في حالة «قيد المراجعة» مرتبة من الأقدم إلى الأحدث. الاعتماد
          يقفل نسخة المحتوى وبصمته، وهو متاح لصاحب المكتب والمدير فقط.
        </p>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "جارٍ التحميل…" : "تحديث القائمة"}
        </button>
        {error && (
          <div role="alert" style={{ color: "#b3423a", marginTop: "0.75rem" }}>
            <span>{error}</span>
          </div>
        )}
      </section>

      <section aria-labelledby="review-queue-items-title">
        <h2 id="review-queue-items-title">عناصر في الانتظار</h2>
        {!queue ? (
          <p>اضغط «تحديث القائمة» للعرض.</p>
        ) : queue.items.length === 0 ? (
          <p>لا يوجد محتوى ينتظر المراجعة.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th scope="col">العنوان</th>
                  <th scope="col">القناة</th>
                  <th scope="col">أُرسل للمراجعة</th>
                </tr>
              </thead>
              <tbody>
                {queue.items.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <Link
                        href={`/ar/organizations/${organizationId}/content/${entry.id}`}
                      >
                        {entry.title}
                        {entry.variantNumber > 1
                          ? ` (نسخة منقحة #${entry.variantNumber})`
                          : ""}
                      </Link>
                    </td>
                    <td>{contentChannelLabels[entry.channel]}</td>
                    <td>
                      {entry.submittedAt.slice(0, 16).replace("T", " ")} UTC
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

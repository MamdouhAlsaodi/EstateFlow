"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useT } from "../../i18n";
import { useOrganizationContext } from "../organization-context/organization-context";
import type { ReviewQueueResponse } from "./content-contract";
import { contentChannelLabels } from "./content-labels";
import { fetchReviewQueue } from "./content-api";
import styles from "./content-views.module.css";

/**
 * EF-402 — review queue: every content item waiting for approval,
 * oldest submission first, so the reviewer always works in fairness order.
 */
export function ContentReviewQueueView() {
  const t = useT();
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
      setError(t("content.review.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  return (
    <div className="workspace-stack">
      <section aria-labelledby="review-queue-title">
        <p className="eyebrow">{t("content.review.eyebrow")}</p>
        <h1 id="review-queue-title">{t("content.review.title")}</h1>
        <p>{t("content.review.subtitle")}</p>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading
            ? t("content.common.loading")
            : t("content.common.refreshList")}
        </button>
        {error && (
          <div role="alert" style={{ color: "#b3423a", marginTop: "0.75rem" }}>
            <span>{error}</span>
          </div>
        )}
      </section>

      <section aria-labelledby="review-queue-items-title">
        <h2 id="review-queue-items-title">{t("content.review.itemsTitle")}</h2>
        {!queue ? (
          <p>{t("content.common.pressRefreshList")}</p>
        ) : queue.items.length === 0 ? (
          <p>{t("content.review.empty")}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t("content.review.thTitle")}</th>
                  <th scope="col">{t("content.review.thChannel")}</th>
                  <th scope="col">{t("content.review.thSubmitted")}</th>
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
                          ? t("content.review.variantSuffix", {
                              number: entry.variantNumber,
                            })
                          : ""}
                      </Link>
                    </td>
                    <td>{t(contentChannelLabels[entry.channel])}</td>
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

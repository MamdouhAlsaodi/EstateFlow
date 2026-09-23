"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useOrganizationContext } from "../organization-context/organization-context";
import {
  CAMPAIGN_CHANNELS,
  type CampaignListPage,
  type CampaignSummary,
} from "./campaign-contract";
import { campaignChannelLabels, campaignStatusLabels } from "./campaign-labels";
import { createCampaign, fetchCampaigns } from "./campaign-api";
import { BudgetProgressBar } from "./budget-progress";
import styles from "./campaign-views.module.css";

const EMPTY_FORM = {
  name: "",
  objective: "",
  channel: "META",
  startsAt: "",
  endsAt: "",
  budgetPlannedMinor: "",
  currency: "SAR",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
};

/**
 * EF-401 — Arabic campaign list with budget progress. Creation is a plain
 * guarded command; every figure comes from the strict API contract.
 */
export function CampaignsListView() {
  const { organizationId } = useOrganizationContext();
  const [page, setPage] = useState<CampaignListPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPage(await fetchCampaigns({ organizationId }));
    } catch {
      setError("تعذر تحميل الحملات من الخادم. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  async function submitCreate(): Promise<void> {
    if (
      form.name.trim().length === 0 ||
      form.objective.trim().length === 0 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(form.startsAt) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(form.endsAt) ||
      !/^[1-9]\d*$/.test(form.budgetPlannedMinor) ||
      !/^[A-Z]{3}$/.test(form.currency)
    ) {
      setError("تحقق من الحقول: الاسم، الهدف، التواريخ UTC، والميزانية.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await createCampaign({ organizationId }, { ...form });
      setForm(EMPTY_FORM);
      await refresh();
    } catch {
      setError("تعذر إنشاء الحملة. تحقق من صلاحياتك وحاول مجددًا.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="workspace-stack">
      <section aria-labelledby="campaigns-title">
        <p className="eyebrow">EF-401 — الحملات والإسناد</p>
        <h1 id="campaigns-title">الحملات التسويقية</h1>
        <p>
          الميزانية المخططة مقابل الفعلية من المصروفات المعتمدة المرتبطة
          بالحملة، مع عدد لمسات العملاء المرتبطة.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void run(refresh)}
            disabled={loading || pending}
          >
            {loading ? "جارٍ التحميل…" : "تحديث القائمة"}
          </button>
        </div>
        {error && (
          <div role="alert" style={{ color: "#b3423a", marginTop: "0.75rem" }}>
            <span>{error}</span>
          </div>
        )}
      </section>

      <section aria-labelledby="campaign-list-title">
        <h2 id="campaign-list-title">قائمة الحملات</h2>
        {!page ? (
          <p>اضغط «تحديث القائمة» للعرض.</p>
        ) : page.items.length === 0 ? (
          <p>لا توجد حملات بعد.</p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              display: "grid",
              gap: "1rem",
            }}
          >
            {page.items.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </ul>
        )}
        {page?.nextCursor && (
          <p style={{ color: "var(--ef-ink-muted)" }}>
            توجد حملات إضافية — استخدم تصفية الحالة لتضييق القائمة.
          </p>
        )}
      </section>

      <section aria-labelledby="campaign-create-title">
        <h2 id="campaign-create-title">حملة جديدة</h2>
        <div className={styles.formGrid}>
          <label>
            الاسم
            <input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </label>
          <label>
            الهدف
            <input
              value={form.objective}
              onChange={(event) =>
                setForm({ ...form, objective: event.target.value })
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
              {CAMPAIGN_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {campaignChannelLabels[channel]}
                </option>
              ))}
            </select>
          </label>
          <label>
            البداية (UTC)
            <input
              placeholder="2026-10-01T00:00:00.000Z"
              value={form.startsAt}
              onChange={(event) =>
                setForm({ ...form, startsAt: event.target.value })
              }
              dir="ltr"
            />
          </label>
          <label>
            النهاية (UTC)
            <input
              placeholder="2026-10-31T23:59:59.999Z"
              value={form.endsAt}
              onChange={(event) =>
                setForm({ ...form, endsAt: event.target.value })
              }
              dir="ltr"
            />
          </label>
          <label>
            الميزانية المخططة (أصغر وحدة)
            <input
              value={form.budgetPlannedMinor}
              onChange={(event) =>
                setForm({ ...form, budgetPlannedMinor: event.target.value })
              }
              dir="ltr"
            />
          </label>
          <label>
            العملة
            <input
              value={form.currency}
              onChange={(event) =>
                setForm({ ...form, currency: event.target.value.toUpperCase() })
              }
              dir="ltr"
            />
          </label>
          <label>
            utm_source
            <input
              value={form.utmSource}
              onChange={(event) =>
                setForm({ ...form, utmSource: event.target.value })
              }
              dir="ltr"
            />
          </label>
          <label>
            utm_medium
            <input
              value={form.utmMedium}
              onChange={(event) =>
                setForm({ ...form, utmMedium: event.target.value })
              }
              dir="ltr"
            />
          </label>
          <label>
            utm_campaign
            <input
              value={form.utmCampaign}
              onChange={(event) =>
                setForm({ ...form, utmCampaign: event.target.value })
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
            {pending ? "جارٍ الإنشاء…" : "إنشاء الحملة"}
          </button>
        </div>
      </section>
    </div>
  );

  async function run(operation: () => Promise<void>): Promise<void> {
    if (pending) return;
    setPending(true);
    try {
      await operation();
    } finally {
      setPending(false);
    }
  }
}

function CampaignCard({ campaign }: { campaign: CampaignSummary }) {
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
        <Link href={`campaigns/${campaign.id}`}>
          <strong>{campaign.name}</strong>
        </Link>
        <StatusChip status={campaign.status} />
        <span style={{ color: "var(--ef-ink-muted)" }}>
          {campaignChannelLabels[campaign.channel]}
        </span>
      </div>
      <p style={{ margin: 0 }}>{campaign.objective}</p>
      <BudgetProgressBar
        plannedMinor={campaign.budgetPlannedMinor}
        actualMinor={campaign.budgetActualMinor}
        currency={campaign.currency}
      />
      <span style={{ color: "var(--ef-ink-muted)" }}>
        لمسات مرتبطة: {campaign.touchCount}
      </span>
    </li>
  );
}

export function StatusChip({ status }: { status: CampaignSummary["status"] }) {
  const className =
    status === "ACTIVE"
      ? `${styles.statusChip} ${styles.statusActive}`
      : status === "COMPLETED"
        ? `${styles.statusChip} ${styles.statusCompleted}`
        : status === "CANCELLED"
          ? `${styles.statusChip} ${styles.statusCancelled}`
          : `${styles.statusChip} ${styles.statusDraft}`;
  return <span className={className}>{campaignStatusLabels[status]}</span>;
}

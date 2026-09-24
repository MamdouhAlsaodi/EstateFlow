"use client";

import { useT } from "../../../i18n";

/**
 * EF-105 design-system demo. Synthetic client names, property names, and
 * amounts are demo DATA (kept verbatim); every UI label, heading, state, and
 * action comes from the EF-630 translation catalog.
 */

const DEMO_LEADS = [
  {
    client: "ريم الشمري",
    property: "شقة النخيل · الرياض",
    stageKey: "demo.leadStageAwaitingCall",
    amount: "1,450,000 ر.س",
  },
  {
    client: "فهد العتيبي",
    property: "فيلا الوادي · جدة",
    stageKey: "demo.leadStageViewingConfirmed",
    amount: "2,750,000 ر.س",
  },
  {
    client: "سارة الحربي",
    property: "مكتب الواجهة · الدمام",
    stageKey: "demo.leadStageOfferReview",
    amount: "980,000 ر.س",
  },
] as const;

const STATUS_ITEMS = [
  { labelKey: "demo.statusDueSoon", value: "24,800 ر.س", tone: "status-gold" },
  {
    labelKey: "demo.statusFollowupsToday",
    value: "08",
    tone: "status-teal",
  },
  {
    labelKey: "demo.statusAwaitingDecision",
    value: "03",
    tone: "status-warning",
  },
] as const;

export function DesignSystemDemo() {
  const t = useT();
  return (
    <div className="page-stack">
      <section aria-labelledby="page-title" className="page-heading">
        <div>
          <p className="eyebrow">{t("demo.eyebrow")}</p>
          <h1 id="page-title">{t("demo.title")}</h1>
          <p>{t("demo.description")}</p>
        </div>
        <button className="button button-primary" type="button">
          {t("demo.demoAction")}
        </button>
      </section>

      <section aria-label={t("demo.metricsAria")} className="metric-grid">
        <article className="metric-card metric-card-navy">
          <span>{t("demo.metricCashLabel")}</span>
          <strong className="numeric">{t("demo.metricCashValue")}</strong>
          <small>{t("demo.metricCashNote")}</small>
        </article>
        <article className="metric-card">
          <span>{t("demo.metricCommissionsLabel")}</span>
          <strong className="numeric">
            {t("demo.metricCommissionsValue")}
          </strong>
          <small className="positive">{t("demo.metricCommissionsNote")}</small>
        </article>
        <article className="metric-card">
          <span>{t("demo.metricSlaLabel")}</span>
          <strong className="numeric">{t("demo.metricSlaValue")}</strong>
          <small>{t("demo.metricSlaNote")}</small>
        </article>
      </section>

      <section aria-label={t("demo.componentsAria")} className="demo-grid">
        <article className="panel panel-wide">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t("demo.tableEyebrow")}</p>
              <h2>{t("demo.tableTitle")}</h2>
            </div>
            <span className="table-count">{t("demo.tableCount")}</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("demo.theadClient")}</th>
                  <th>{t("demo.theadProperty")}</th>
                  <th>{t("demo.theadStage")}</th>
                  <th>{t("demo.theadValue")}</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_LEADS.map((lead) => (
                  <tr key={lead.client}>
                    <th scope="row">{lead.client}</th>
                    <td>{lead.property}</td>
                    <td>
                      <span className="status-pill">{t(lead.stageKey)}</span>
                    </td>
                    <td className="numeric">{lead.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
        <article className="panel">
          <p className="eyebrow">{t("demo.statusEyebrow")}</p>
          <h2>{t("demo.statusTitle")}</h2>
          <ul className="status-list">
            {STATUS_ITEMS.map((item) => (
              <li key={item.labelKey}>
                <span
                  aria-hidden="true"
                  className={`status-dot ${item.tone}`}
                />
                <span>{t(item.labelKey)}</span>
                <strong className="numeric">{item.value}</strong>
              </li>
            ))}
          </ul>
        </article>
        <article className="panel">
          <p className="eyebrow">{t("demo.formEyebrow")}</p>
          <h2>{t("demo.formTitle")}</h2>
          <label htmlFor="sample-note">{t("demo.noteLabel")}</label>
          <textarea
            id="sample-note"
            placeholder={t("demo.notePlaceholder")}
            rows={3}
          />
          <div className="button-row">
            <button className="button button-primary" type="button">
              {t("demo.saveDemo")}
            </button>
            <button className="button button-secondary" type="button">
              {t("demo.cancel")}
            </button>
          </div>
        </article>
      </section>

      <section aria-label={t("demo.statesAria")} className="state-grid">
        <article className="state-mini">
          <span aria-hidden="true">⌁</span>
          <h2>{t("demo.emptyTitle")}</h2>
          <p>{t("demo.emptyBody")}</p>
          <button className="text-button" type="button">
            {t("demo.emptyAction")}
          </button>
        </article>
        <article className="state-mini">
          <span aria-hidden="true">!</span>
          <h2>{t("demo.errorTitle")}</h2>
          <p>{t("demo.errorBody")}</p>
          <button className="text-button" type="button">
            {t("error.retry")}
          </button>
        </article>
      </section>
    </div>
  );
}

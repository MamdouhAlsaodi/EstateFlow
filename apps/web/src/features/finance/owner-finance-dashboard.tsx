"use client";

import { useCallback, useState } from "react";
import { useOrganizationContext } from "../organization-context/organization-context";
import {
  getOwnerAgingSummary,
  getOwnerCampaignPerformance,
  getOwnerCashFlow,
  getOwnerCommissionSummary,
  getOwnerPerformance,
  listOwnerAgingItems,
  listOwnerCommissionItems,
  listOwnerExpenseItems,
  listOwnerPaymentItems,
} from "./owner-report-api";
import {
  AGING_BUCKET_LABELS,
  COMMISSION_STATUS_LABELS,
  attributionModelLabelsAr,
  type OwnerAgingSummary,
  type OwnerCampaignPerformance,
  type OwnerCashFlow,
  type OwnerCommissionSummary,
  type OwnerPerformance,
  type CommissionItemStatus,
} from "./owner-report-model";
import styles from "./owner-finance-dashboard.module.css";

type DrillCell = Readonly<{ label: string; value: string }>;
type DrillPage = Readonly<{
  rows: readonly (readonly DrillCell[])[];
  nextCursor?: string;
}>;
type DrillConfig = Readonly<{
  kind: string;
  title: string;
  head: readonly string[];
  fetch(page: { cursor?: string }): Promise<DrillPage>;
}>;
type DrillState = Readonly<{
  config: DrillConfig;
  rows: readonly (readonly DrillCell[])[];
  nextCursor?: string;
}>;

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function OwnerFinanceDashboard() {
  const { organizationId } = useOrganizationContext();
  const [cashFlow, setCashFlow] = useState<OwnerCashFlow | null>(null);
  const [aging, setAging] = useState<OwnerAgingSummary | null>(null);
  const [commissions, setCommissions] = useState<OwnerCommissionSummary | null>(
    null,
  );
  const [performance, setPerformance] = useState<OwnerPerformance | null>(null);
  const [campaignFirstTouch, setCampaignFirstTouch] =
    useState<OwnerCampaignPerformance | null>(null);
  const [campaignLastTouch, setCampaignLastTouch] =
    useState<OwnerCampaignPerformance | null>(null);
  const [loading, setLoading] = useState(false);
  const [drillLoading, setDrillLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillState | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        cash,
        receivables,
        commission,
        margin,
        campaignsFirst,
        campaignsLast,
      ] = await Promise.all([
        getOwnerCashFlow({ organizationId }),
        getOwnerAgingSummary({ organizationId }),
        getOwnerCommissionSummary({ organizationId }),
        getOwnerPerformance({ organizationId }),
        getOwnerCampaignPerformance({
          organizationId,
          model: "FIRST_TOUCH",
        }),
        getOwnerCampaignPerformance({
          organizationId,
          model: "LAST_TOUCH",
        }),
      ]);
      setCashFlow(cash);
      setAging(receivables);
      setCommissions(commission);
      setPerformance(margin);
      setCampaignFirstTouch(campaignsFirst);
      setCampaignLastTouch(campaignsLast);
    } catch {
      setError("تعذر تحميل التقرير من الخادم. بقيت البيانات كما هي.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  async function run(
    kind: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    if (pending !== null) return;
    setPending(kind);
    setError(null);
    try {
      await operation();
    } catch {
      setError("تعذر تنفيذ الطلب. حاول مرة أخرى.");
    } finally {
      setPending(null);
    }
  }

  async function loadDrill(
    config: DrillConfig,
    append: boolean,
    cursor?: string,
  ): Promise<void> {
    setDrillLoading(true);
    setError(null);
    try {
      const page = await config.fetch(cursor ? { cursor } : {});
      setDrillDownState(config, append, page);
    } catch (drillError) {
      if (drillError instanceof TypeError)
        setError("استجابة الخادم غير مطابقة للعقد المتوقع.");
      else setError("تعذر تنفيذ الطلب. حاول مرة أخرى.");
    } finally {
      setDrillLoading(false);
    }
  }

  function setDrillDownState(
    config: DrillConfig,
    append: boolean,
    page: DrillPage,
  ): void {
    setDrill((current) => {
      const sameConfig =
        current !== null && current.config.kind === config.kind;
      const rows =
        sameConfig && append ? [...current.rows, ...page.rows] : page.rows;
      return { config, rows, nextCursor: page.nextCursor };
    });
  }

  const paymentRows =
    (dimension?: {
      dealId?: string;
      propertyId?: string;
    }): DrillConfig["fetch"] =>
    async (page) => {
      const result = await listOwnerPaymentItems({
        organizationId,
        page: { limit: 20, ...page },
        ...(dimension ? { dimension } : {}),
      });
      return {
        rows: result.items.map((item): readonly DrillCell[] => [
          { label: "id", value: item.paymentId },
          { label: "amount", value: `${item.amountMinor} ${item.currency}` },
          { label: "at", value: item.recordedAt },
          { label: "deal", value: item.dealId },
        ]),
        nextCursor: result.nextCursor,
      };
    };

  const expenseRows =
    (dimension?: {
      dealId?: string;
      propertyId?: string;
      campaignId?: string;
    }): DrillConfig["fetch"] =>
    async (page) => {
      const result = await listOwnerExpenseItems({
        organizationId,
        page: { limit: 20, ...page },
        ...(dimension ? { dimension } : {}),
      });
      return {
        rows: result.items.map((item): readonly DrillCell[] => [
          { label: "id", value: item.expenseId },
          { label: "amount", value: `${item.amountMinor} ${item.currency}` },
          { label: "category", value: item.category },
          { label: "vendor", value: item.vendorReference },
          { label: "approvedAt", value: item.decidedAt },
        ]),
        nextCursor: result.nextCursor,
      };
    };

  return (
    <div className={styles.workspace}>
      <section className={styles.header} aria-labelledby="owner-report-title">
        <p className="eyebrow">تقرير المالك — FIN-05</p>
        <h1 id="owner-report-title">لوحة المالية للمالك</h1>
        <p>
          أرقام للقراءة فقط من الخادم، مع طابع زمني لحداثة كل قراءة، وتفصيل لكل
          رقم حتى صفوفه الأصلية.
        </p>
        <div className={styles.actions}>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void run("refresh", refresh)}
            disabled={loading || pending !== null}
          >
            {loading ? "جارٍ التحديث…" : "تحديث التقرير"}
          </button>
          {cashFlow && (
            <span className={styles.freshness}>
              حداثة القراءة: <b dir="ltr">{cashFlow.asOf}</b>
            </span>
          )}
        </div>
        {error && (
          <div className={styles.error} role="alert">
            <span>{error}</span>
          </div>
        )}
      </section>

      <div className={styles.grid}>
        <section className={styles.panel} aria-labelledby="cash-flow-title">
          <h2 id="cash-flow-title">التدفق النقدي</h2>
          {!cashFlow ? (
            <p className={styles.state}>اضغط «تحديث التقرير» للعرض.</p>
          ) : (
            <>
              <MoneyTable
                caption="المقبوضات والمدفوعات وصافي النقد لكل عملة"
                rows={[
                  ...cashFlow.cashIn.map((row) => ({
                    key: `in-${row.currency}`,
                    label: "مقبوضات",
                    currency: row.currency,
                    count: row.count,
                    amountMinor: row.amountMinor,
                  })),
                  ...cashFlow.cashOut.map((row) => ({
                    key: `out-${row.currency}`,
                    label: "مدفوعات",
                    currency: row.currency,
                    count: row.count,
                    amountMinor: row.amountMinor,
                  })),
                  ...cashFlow.netCash.map((row) => ({
                    key: `net-${row.currency}`,
                    label: "صافي النقد",
                    currency: row.currency,
                    count: null,
                    amountMinor: row.amountMinor,
                  })),
                ]}
              />
              <div className={styles.buttonRow}>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={drillLoading || pending !== null}
                  onClick={() =>
                    void run("inflows", () =>
                      loadDrill(
                        {
                          kind: "inflows",
                          title: "تفصيل المقبوضات — صفوف الدفعات الأصلية",
                          head: [
                            "معرّف الدفعة",
                            "المبلغ",
                            "وقت التسجيل",
                            "الصفقة",
                          ],
                          fetch: paymentRows(),
                        },
                        false,
                      ),
                    )
                  }
                >
                  تفصيل المقبوضات
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={drillLoading || pending !== null}
                  onClick={() =>
                    void run("outflows", () =>
                      loadDrill(
                        {
                          kind: "outflows",
                          title: "تفصيل المدفوعات — المصروفات المعتمدة",
                          head: [
                            "معرّف المصروف",
                            "المبلغ",
                            "الفئة",
                            "الجهة",
                            "وقت الاعتماد",
                          ],
                          fetch: expenseRows(),
                        },
                        false,
                      ),
                    )
                  }
                >
                  تفصيل المدفوعات
                </button>
              </div>
            </>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="aging-title">
          <h2 id="aging-title">أعمار المستحقات</h2>
          {!aging ? (
            <p className={styles.state}>اضغط «تحديث التقرير» للعرض.</p>
          ) : (
            <>
              <p className={styles.freshness}>
                حتى <b dir="ltr">{aging.asOf}</b>
              </p>
              {aging.buckets.length === 0 ? (
                <p className={styles.state}>لا توجد مستحقات مفتوحة.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table>
                    <caption>إجمالي المتبقي لكل فئة عمرية وعملة</caption>
                    <thead>
                      <tr>
                        <th>الفئة</th>
                        <th>العملة</th>
                        <th>العدد</th>
                        <th>المتبقي</th>
                        <th>تفصيل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aging.buckets.map((row) => (
                        <tr key={`${row.bucket}-${row.currency}`}>
                          <td>{AGING_BUCKET_LABELS[row.bucket]}</td>
                          <td dir="ltr">{row.currency}</td>
                          <td>{row.count}</td>
                          <td dir="ltr">{row.outstandingMinor}</td>
                          <td>
                            <button
                              className="button button-secondary"
                              type="button"
                              disabled={drillLoading || pending !== null}
                              onClick={() =>
                                void run(`aging-${row.bucket}`, () =>
                                  loadDrill(
                                    {
                                      kind: `aging-${row.bucket}-${row.currency}`,
                                      title: `تفصيل الفئة: ${AGING_BUCKET_LABELS[row.bucket]}`,
                                      head: [
                                        "المستحق",
                                        "المتبقي",
                                        "الحالة",
                                        "أيام متأخرة",
                                        "الاستحقاق",
                                      ],
                                      fetch: async (page) => {
                                        const result =
                                          await listOwnerAgingItems({
                                            organizationId,
                                            bucket: row.bucket,
                                            page: { limit: 20, ...page },
                                          });
                                        return {
                                          rows: result.items.map(
                                            (item): readonly DrillCell[] => [
                                              {
                                                label: "id",
                                                value: item.receivableId,
                                              },
                                              {
                                                label: "outstanding",
                                                value: `${item.outstandingMinor} ${item.currency}`,
                                              },
                                              {
                                                label: "status",
                                                value: item.status,
                                              },
                                              {
                                                label: "days",
                                                value: String(item.daysPastDue),
                                              },
                                              {
                                                label: "due",
                                                value: item.dueAt,
                                              },
                                            ],
                                          ),
                                          nextCursor: result.nextCursor,
                                        };
                                      },
                                    },
                                    false,
                                  ),
                                )
                              }
                            >
                              عرض الصفوف
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="commissions-title">
          <h2 id="commissions-title">العمولات</h2>
          {!commissions ? (
            <p className={styles.state}>اضغط «تحديث التقرير» للعرض.</p>
          ) : (
            <>
              <p className={styles.freshness}>
                حتى <b dir="ltr">{commissions.asOf}</b>
              </p>
              <div className={styles.tableWrap}>
                <table>
                  <caption>العمولات المتوقعة والمستحقة والمدفوعة</caption>
                  <thead>
                    <tr>
                      <th>البند</th>
                      <th>العملة</th>
                      <th>العدد</th>
                      <th>المبلغ</th>
                      <th>تفصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...commissions.expected.map((row) => ({
                        key: `expected-${row.currency}`,
                        label: "متوقعة",
                        status: "EXPECTED" as CommissionItemStatus,
                        ...row,
                      })),
                      ...commissions.due.map((row) => ({
                        key: `due-${row.currency}`,
                        label: "مستحقة",
                        status: "DUE" as CommissionItemStatus,
                        ...row,
                      })),
                      ...commissions.paid.map((row) => ({
                        key: `paid-${row.currency}`,
                        label: "مدفوعة",
                        status: "PAID" as CommissionItemStatus,
                        ...row,
                      })),
                    ].map((row) => (
                      <tr key={row.key}>
                        <td>{row.label}</td>
                        <td dir="ltr">{row.currency}</td>
                        <td>{row.count}</td>
                        <td dir="ltr">{row.amountMinor}</td>
                        <td>
                          <button
                            className="button button-secondary"
                            type="button"
                            disabled={drillLoading || pending !== null}
                            onClick={() =>
                              void run(`commission-${row.status}`, () =>
                                loadDrill(
                                  {
                                    kind: `commission-${row.status}-${row.currency}`,
                                    title: `تفصيل العمولات: ${row.label}`,
                                    head: [
                                      "الاستحقاق",
                                      "الصفقة",
                                      "المبلغ",
                                      "الحالة",
                                      "النصيبان",
                                    ],
                                    fetch: async (page) => {
                                      const result =
                                        await listOwnerCommissionItems({
                                          organizationId,
                                          status: row.status,
                                          page: { limit: 20, ...page },
                                        });
                                      return {
                                        rows: result.items.map(
                                          (item): readonly DrillCell[] => [
                                            {
                                              label: "id",
                                              value: item.accrualId,
                                            },
                                            {
                                              label: "deal",
                                              value: item.dealId,
                                            },
                                            {
                                              label: "amount",
                                              value: `${item.amountMinor} ${item.currency}`,
                                            },
                                            {
                                              label: "status",
                                              value:
                                                COMMISSION_STATUS_LABELS[
                                                  item.status
                                                ],
                                            },
                                            {
                                              label: "splits",
                                              value: item.splits
                                                .map(
                                                  (split) =>
                                                    `${split.kind}:${split.amountMinor}`,
                                                )
                                                .join(" / "),
                                            },
                                          ],
                                        ),
                                        nextCursor: result.nextCursor,
                                      };
                                    },
                                  },
                                  false,
                                ),
                              )
                            }
                          >
                            عرض الصفوف
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="performance-title">
          <h2 id="performance-title">الإيراد والهامش</h2>
          {!performance ? (
            <p className={styles.state}>اضغط «تحديث التقرير» للعرض.</p>
          ) : (
            <>
              <p className={styles.freshness}>
                حتى <b dir="ltr">{performance.asOf}</b>
              </p>
              <h3>حسب الصفقة</h3>
              <PerformanceTable
                rows={performance.deals}
                emptyLabel="لا توجد حركات على الصفقات."
              />
              <div className={styles.buttonRow}>
                {performance.deals.slice(0, 5).map((row) => (
                  <button
                    key={row.keyId}
                    className="button button-secondary"
                    type="button"
                    disabled={drillLoading || pending !== null}
                    onClick={() =>
                      void run(`deal-${row.keyId}`, () =>
                        loadDrill(
                          {
                            kind: `deal-payments-${row.keyId}`,
                            title: `مقبوضات الصفقة ${shortId(row.keyId)}`,
                            head: [
                              "معرّف الدفعة",
                              "المبلغ",
                              "وقت التسجيل",
                              "الصفقة",
                            ],
                            fetch: paymentRows({ dealId: row.keyId }),
                          },
                          false,
                        ),
                      )
                    }
                  >
                    مقبوضات {shortId(row.keyId)}
                  </button>
                ))}
              </div>
              <h3>حسب العقار</h3>
              <PerformanceTable
                rows={performance.properties}
                emptyLabel="لا توجد حركات على العقارات."
              />
              <div className={styles.buttonRow}>
                {performance.properties.slice(0, 5).map((row) => (
                  <button
                    key={row.keyId}
                    className="button button-secondary"
                    type="button"
                    disabled={drillLoading || pending !== null}
                    onClick={() =>
                      void run(`property-${row.keyId}`, () =>
                        loadDrill(
                          {
                            kind: `property-costs-${row.keyId}`,
                            title: `مصروفات العقار ${shortId(row.keyId)}`,
                            head: [
                              "معرّف المصروف",
                              "المبلغ",
                              "الفئة",
                              "الجهة",
                              "وقت الاعتماد",
                            ],
                            fetch: expenseRows({ propertyId: row.keyId }),
                          },
                          false,
                        ),
                      )
                    }
                  >
                    مصروفات {shortId(row.keyId)}
                  </button>
                ))}
              </div>
              <h3>حسب الحملة (EF-401)</h3>
              {campaignFirstTouch === null || campaignLastTouch === null ? (
                <p className={styles.state}>
                  اضغط «تحديث التقرير» لعرض الإيراد والهامش حسب الحملة.
                </p>
              ) : (
                (
                  [
                    ["FIRST_TOUCH", campaignFirstTouch],
                    ["LAST_TOUCH", campaignLastTouch],
                  ] as const
                ).map(([model, report]) => (
                  <div key={model}>
                    <h4>{attributionModelLabelsAr[model]}</h4>
                    <PerformanceTable
                      rows={report.campaigns}
                      emptyLabel="لا توجد حركات مُسندة لحملات بعد."
                    />
                    <div className={styles.buttonRow}>
                      {report.campaigns.slice(0, 5).map((row) => (
                        <button
                          key={`${model}-${row.keyId}`}
                          className="button button-secondary"
                          type="button"
                          disabled={drillLoading || pending !== null}
                          onClick={() =>
                            void run(`campaign-${model}-${row.keyId}`, () =>
                              loadDrill(
                                {
                                  kind: `campaign-costs-${model}-${row.keyId}`,
                                  title: `مصروفات الحملة ${shortId(row.keyId)} — ${attributionModelLabelsAr[model]}`,
                                  head: [
                                    "معرّف المصروف",
                                    "المبلغ",
                                    "الفئة",
                                    "الجهة",
                                    "وقت الاعتماد",
                                  ],
                                  fetch: expenseRows({ campaignId: row.keyId }),
                                },
                                false,
                              ),
                            )
                          }
                        >
                          مصروفات {shortId(row.keyId)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </section>
      </div>

      {drill && (
        <section className={styles.drillDown} aria-live="polite">
          <div className={styles.drillHead}>
            <h2>{drill.config.title}</h2>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setDrill(null)}
            >
              إغلاق
            </button>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  {drill.config.head.map((cell) => (
                    <th key={cell}>{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drill.rows.map((row, index) => (
                  <tr key={index}>
                    {row.map((cell) => (
                      <td key={cell.label} dir="auto">
                        {cell.value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {drill.nextCursor && (
            <button
              className="button button-secondary"
              type="button"
              disabled={drillLoading}
              onClick={() =>
                void loadDrill(drill.config, true, drill.nextCursor)
              }
            >
              {drillLoading ? "جارٍ التحميل…" : "تحميل المزيد"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function MoneyTable(placeholder: {
  caption: string;
  rows: readonly {
    key: string;
    label: string;
    currency: string;
    count: number | null;
    amountMinor: string;
  }[];
}) {
  return (
    <div className={styles.tableWrap}>
      <table>
        <caption>{placeholder.caption}</caption>
        <thead>
          <tr>
            <th>البند</th>
            <th>العملة</th>
            <th>عدد الحركات</th>
            <th>المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {placeholder.rows.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td dir="ltr">{row.currency}</td>
              <td>{row.count === null ? "—" : row.count}</td>
              <td dir="ltr">{row.amountMinor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerformanceTable(placeholder: {
  rows: readonly {
    keyId: string;
    currency: string;
    revenueMinor: string;
    costsMinor: string;
    marginMinor: string;
  }[];
  emptyLabel: string;
}) {
  if (placeholder.rows.length === 0)
    return <p className={styles.state}>{placeholder.emptyLabel}</p>;
  return (
    <div className={styles.tableWrap}>
      <table>
        <thead>
          <tr>
            <th>المعرّف</th>
            <th>العملة</th>
            <th>الإيراد</th>
            <th>التكلفة</th>
            <th>الهامش</th>
          </tr>
        </thead>
        <tbody>
          {placeholder.rows.map((row) => (
            <tr key={`${row.keyId}-${row.currency}`}>
              <td dir="ltr">{shortId(row.keyId)}</td>
              <td dir="ltr">{row.currency}</td>
              <td dir="ltr">{row.revenueMinor}</td>
              <td dir="ltr">{row.costsMinor}</td>
              <td dir="ltr">{row.marginMinor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

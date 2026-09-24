"use client";

import { useCallback, useEffect, useState } from "react";
import {
  approveContractTemplate,
  createContractTemplate,
  fetchContract,
  fetchContracts,
  fetchContractTemplates,
  generateContract,
  requestAmendment,
  signContract,
  voidContract,
} from "./contracts-api";
import {
  CONTRACT_AUDIT_LABELS,
  CONTRACT_ROLE_LABELS,
  CONTRACT_STATUS_LABELS,
  OPERATIONAL_ESIGN_DISCLAIMER_AR,
  contractPdfUrl,
  type ContractDetail,
  type ContractSummary,
  type ContractTemplateSummary,
} from "./contracts-contract";
import styles from "./contracts.module.css";

const DEFAULT_TITLE_PATTERN = "عقد بيع — {PROPERTY_TITLE}";
const DEFAULT_BODY_PATTERN = `تم الاتفاق بين الطرفين على عقار {PROPERTY_TYPE} في {PROPERTY_ADDRESS} ضمن الصفقة {DEAL_REFERENCE}.
الجهة: {ORGANIZATION_NAME}
الوسيط: {BROKER_REFERENCE}
تاريخ اللقطة: {SNAPSHOT_CAPTURED_AT}`;

function shortHash(hash: string): string {
  return hash.slice(0, 12);
}

export function ContractsWorkspace({
  organizationId,
}: Readonly<{ organizationId: string }>) {
  const [templates, setTemplates] = useState<
    readonly ContractTemplateSummary[]
  >([]);
  const [contracts, setContracts] = useState<readonly ContractSummary[]>([]);
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dealIdInput, setDealIdInput] = useState("");
  const [filterDealId, setFilterDealId] = useState<string | undefined>(
    undefined,
  );
  const [templateKey, setTemplateKey] = useState("sale-agreement");
  const [titlePattern, setTitlePattern] = useState(DEFAULT_TITLE_PATTERN);
  const [bodyPattern, setBodyPattern] = useState(DEFAULT_BODY_PATTERN);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const refresh = useCallback(async () => {
    try {
      const [templateItems, contractItems] = await Promise.all([
        fetchContractTemplates(organizationId),
        fetchContracts(organizationId, filterDealId),
      ]);
      setTemplates(templateItems);
      setContracts(contractItems);
      setError(null);
    } catch {
      setError("تعذر تحميل العقود — تحقق من الجلسة والصلاحيات.");
    }
  }, [organizationId, filterDealId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<string | void>) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const message = await action();
        if (typeof message === "string") setNotice(message);
        await refresh();
      } catch {
        setError("تعذر تنفيذ الأمر — تحقق من الصلاحيات وترتيب التوقيع.");
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const openDetail = useCallback(
    (contractId: string) => {
      void run(async () => {
        const loaded = await fetchContract(organizationId, contractId);
        setDetail(loaded);
        return undefined;
      });
    },
    [organizationId, run],
  );

  const approvedTemplates = templates.filter(
    (template) => template.status === "APPROVED",
  );
  const effectiveTemplateId =
    approvedTemplates.find(
      (template) => template.templateId === selectedTemplateId,
    )?.templateId ??
    approvedTemplates[0]?.templateId ??
    "";

  return (
    <main className={styles.grid} dir="rtl">
      <h1>العقود والتوقيع</h1>
      <p className={styles.disclaimer} role="note">
        ⚠️ {OPERATIONAL_ESIGN_DISCLAIMER_AR}
      </p>

      <section className={styles.panel} aria-labelledby="generate-heading">
        <h2 id="generate-heading">توليد عقد من صفقة</h2>
        <p className={styles.meta}>
          يولَّد محتوى العقد حتميًا من نسخة قالب معتمدة ولقطة بيانات الصفقة
          والعقار، ويُسجَّل بصمة SHA-256 للمستند مع ختم المصدر.
        </p>
        <div className={styles.toolbar}>
          <label className={styles.field}>
            <span>معرّف الصفقة (UUID)</span>
            <input
              value={dealIdInput}
              onChange={(event) => setDealIdInput(event.target.value)}
              placeholder="33333333-3333-4333-8333-333333333333"
              disabled={busy}
            />
          </label>
          <label className={styles.field}>
            <span>القالب المعتمد</span>
            <select
              value={effectiveTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              disabled={busy || approvedTemplates.length === 0}
            >
              {approvedTemplates.length === 0 ? (
                <option value="">لا توجد قوالب معتمدة</option>
              ) : (
                approvedTemplates.map((template) => (
                  <option key={template.templateId} value={template.templateId}>
                    {template.templateKey} · نسخة {template.version}
                  </option>
                ))
              )}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || effectiveTemplateId === ""}
            onClick={() =>
              run(async () => {
                await generateContract({
                  organizationId,
                  dealId: dealIdInput.trim(),
                  templateId: effectiveTemplateId,
                });
                return "تم توليد العقد وحفظ لقطة البيانات بشكل غير قابل للتغيير.";
              })
            }
          >
            توليد العقد
          </button>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="template-heading">
        <h2 id="template-heading">قوالب العقود</h2>
        <details className={styles.editor}>
          <summary>إنشاء قالب جديد (مالك/مدير)</summary>
          <div className={styles.toolbar}>
            <label className={styles.field}>
              <span>مفتاح القالب</span>
              <input
                value={templateKey}
                onChange={(event) => setTemplateKey(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className={styles.field}>
              <span>نمط العنوان</span>
              <input
                value={titlePattern}
                onChange={(event) => setTitlePattern(event.target.value)}
                disabled={busy}
              />
            </label>
          </div>
          <label className={styles.fieldWide}>
            <span>
              نمط المتن — المتغيرات المسموحة فقط مثل {"{PROPERTY_TITLE}"}
            </span>
            <textarea
              value={bodyPattern}
              onChange={(event) => setBodyPattern(event.target.value)}
              rows={4}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await createContractTemplate({
                  organizationId,
                  templateKey: templateKey.trim(),
                  titlePattern,
                  bodyPattern,
                });
                return "تم إنشاء القالب كمسودة — يلزم اعتماده قبل الاستخدام.";
              })
            }
          >
            إنشاء مسودة القالب
          </button>
        </details>
        {templates.length === 0 ? (
          <p className={styles.meta}>لا توجد قوالب بعد.</p>
        ) : (
          <ul className={styles.list}>
            {templates.map((template) => (
              <li key={template.templateId} className={styles.card}>
                <strong>
                  {template.templateKey} · نسخة {template.version}
                </strong>
                <span className={styles.meta}>
                  {template.status === "APPROVED"
                    ? `معتمد${template.approvedAt ? ` — ${template.approvedAt}` : ""}`
                    : "مسودة"}
                </span>
                <span className={styles.meta}>{template.titlePattern}</span>
                {template.status === "DRAFT" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await approveContractTemplate({
                          organizationId,
                          templateId: template.templateId,
                        });
                        return "تم اعتماد القالب — النسخة المعتمدة غير قابلة للتغيير.";
                      })
                    }
                  >
                    اعتماد
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}

      <section className={styles.panel} aria-labelledby="contracts-heading">
        <h2 id="contracts-heading">العقود</h2>
        <div className={styles.toolbar}>
          <label className={styles.field}>
            <span>تصفية حسب الصفقة (اختياري)</span>
            <input
              value={filterDealId ?? ""}
              onChange={(event) =>
                setFilterDealId(
                  event.target.value.trim() === ""
                    ? undefined
                    : event.target.value.trim(),
                )
              }
              placeholder="كل العقود"
              disabled={busy}
            />
          </label>
        </div>
        {contracts.length === 0 ? (
          <p className={styles.meta}>لا توجد عقود بعد.</p>
        ) : (
          <ul className={styles.list}>
            {contracts.map((contract) => (
              <li
                key={contract.contractId}
                className={`${styles.card} ${contract.status === "FINALIZED" ? styles.finalized : ""}`}
              >
                <strong>{contract.title}</strong>
                <span className={styles.meta}>
                  {CONTRACT_STATUS_LABELS[contract.status]} ·{" "}
                  {contract.signatureCount}/{contract.signerTotal} توقيع ·{" "}
                  {contract.templateKey} نسخة {contract.templateVersion}
                </span>
                <span className={styles.hashLine}>
                  المستند: {shortHash(contract.pdfSha256)}… · المحتوى:{" "}
                  {shortHash(contract.contentHash)}…
                </span>
                <div className={styles.actions}>
                  <a href={contractPdfUrl(organizationId, contract.contractId)}>
                    عرض PDF
                  </a>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openDetail(contract.contractId)}
                  >
                    التفاصيل وخط التوقيع
                  </button>
                  {contract.status === "DRAFT" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const result = await signContract({
                            organizationId,
                            contractId: contract.contractId,
                          });
                          return result.contractStatus === "FINALIZED"
                            ? "تم تسجيل آخر توقيع — العقد مكتمل ومجمّد."
                            : "تم تسجيل التوقيع بالترتيب الصحيح.";
                        })
                      }
                    >
                      توقيع (حسب الدور)
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail ? (
        <section className={styles.panel} aria-labelledby="detail-heading">
          <h2 id="detail-heading">تفاصيل العقد</h2>
          <p className={styles.disclaimer}>{detail.disclaimer}</p>
          <dl className={styles.details}>
            <dt>العنوان</dt>
            <dd>{detail.title}</dd>
            <dt>الحالة</dt>
            <dd>{CONTRACT_STATUS_LABELS[detail.status]}</dd>
            <dt>العقار (من اللقطة)</dt>
            <dd>
              {detail.propertyTitle} — {detail.propertyType} —{" "}
              {detail.propertyAddress}
            </dd>
            <dt>الجهة</dt>
            <dd>{detail.organizationName}</dd>
            <dt>تاريخ اللقطة</dt>
            <dd>{detail.capturedAt}</dd>
            <dt>بصمة المستند (PDF)</dt>
            <dd className={styles.hashLine}>{detail.pdfSha256}</dd>
            <dt>بصمة المحتوى</dt>
            <dd className={styles.hashLine}>{detail.contentHash}</dd>
          </dl>
          <pre className={styles.body}>{detail.body}</pre>
          <h3>خط التوقيع التسلسلي</h3>
          <ol className={styles.signers}>
            {detail.signers.map((signer) => (
              <li key={signer.userId}>
                {signer.order}.{" "}
                {CONTRACT_ROLE_LABELS[signer.role] ?? signer.role} —{" "}
                {signer.reference} —{" "}
                {signer.signedAt
                  ? `وُقّع ${signer.signedAt} (${shortHash(signer.documentHash ?? "")}…)`
                  : detail.status === "DRAFT"
                    ? "بانتظار دوره بالترتيب"
                    : "لم يُوقّع"}
              </li>
            ))}
          </ol>
          {detail.nextSignerOrder !== null ? (
            <p className={styles.meta}>
              الدور المطلوب الآن: التوقيع رقم {detail.nextSignerOrder} — الرفض
              خارج الترتيب إلزامي.
            </p>
          ) : null}
          <h3>السجل التدقيقي (إلحاقي فقط)</h3>
          <ul className={styles.auditList}>
            {detail.auditEvents.map((event) => (
              <li key={event.eventId}>
                {CONTRACT_AUDIT_LABELS[event.action]} — {event.createdAt}
                {event.reason ? ` — السبب: ${event.reason}` : ""}
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            {detail.status === "DRAFT" ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await requestAmendment({
                        organizationId,
                        contractId: detail.contractId,
                        reason: "طلب تعديل قبل التوقيع النهائي",
                      });
                      return "سُجّل طلب التعديل في السجل التدقيقي (المستند نفسه غير قابل للتعديل).";
                    })
                  }
                >
                  طلب تعديل (توثيق فقط)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const reason = window.prompt("سبب إلغاء العقد (إلزامي):");
                      if (!reason || reason.trim().length === 0)
                        return undefined;
                      await voidContract({
                        organizationId,
                        contractId: detail.contractId,
                        reason: reason.trim(),
                      });
                      return "أُلغي العقد وسُجّل السبب — لا تعديل بعده.";
                    })
                  }
                >
                  إلغاء (مالك فقط)
                </button>
              </>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => setDetail(null)}
            >
              إغلاق التفاصيل
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

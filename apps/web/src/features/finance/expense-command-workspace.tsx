"use client";

import { useState } from "react";
import { createApiClient } from "../../lib/api-client/index";
import { createSessionCsrfProvider } from "../../lib/api-client/session";
import { useOrganizationContext } from "../organization-context/organization-context";
import { FinanceCommandForm, TechnicalField } from "./finance-command-form";
import {
  EMPTY_EXPENSE_FORM,
  isAmount,
  isByteSize,
  isCategory,
  isCurrency,
  isExpenseReplay,
  isMediaType,
  isSessionError,
  isSessionErrorMessage,
  isText,
  isUtc,
  isUuid,
  expenseSuccessMessage,
  type ExpenseCommand,
  type ExpenseFormState,
  type ExpenseMessage,
} from "./expense-command-contract";
import styles from "./expense-command-workspace.module.css";

const apiClient = createApiClient();
const sessionCsrfProvider = createSessionCsrfProvider(apiClient);

function postExpense(
  path: string,
  csrfToken: string,
  body?: unknown,
): Promise<unknown> {
  return apiClient.request(`/organizations/${path}`, {
    method: "POST",
    csrfToken,
    body,
  });
}

export function ExpenseCommandWorkspace() {
  const { organizationId } = useOrganizationContext();
  const [form, setForm] = useState<ExpenseFormState>(EMPTY_EXPENSE_FORM);
  const [pending, setPending] = useState<ExpenseCommand | null>(null);
  const [message, setMessage] = useState<ExpenseMessage | null>(null);
  const [evidenceKey, setEvidenceKey] = useState(() => crypto.randomUUID());

  function update(field: keyof ExpenseFormState, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }
  async function run(
    command: ExpenseCommand,
    operation: (csrfToken: string) => Promise<unknown>,
    onSuccess: () => void,
  ): Promise<void> {
    if (pending !== null) return;
    setPending(command);
    setMessage(null);
    try {
      const csrfToken = await sessionCsrfProvider.getToken();
      const result = await operation(csrfToken);
      onSuccess();
      setMessage({
        kind: "success",
        text: isExpenseReplay(result)
          ? "الأمر مطابق لعملية سابقة؛ لم يتغير أي سجل مالي."
          : expenseSuccessMessage(command),
      });
    } catch (error) {
      if (isSessionError(error)) sessionCsrfProvider.clear();
      setMessage({
        kind: "error",
        text: isSessionError(error)
          ? "انتهت الجلسة. أعد التحقق ثم نفّذ الأمر مرة أخرى."
          : "تعذر تنفيذ الأمر. بقيت البيانات كما هي لتراجعها وتحاول مجددًا.",
      });
    } finally {
      setPending(null);
    }
  }
  function submitDraft(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (
      !isCategory(form.category) ||
      !isText(form.vendorReference, 200) ||
      !isAmount(form.amountMinor) ||
      !isCurrency(form.currency) ||
      (form.campaignReference !== "" && !isText(form.campaignReference, 100)) ||
      (form.propertyId !== "" && !isUuid(form.propertyId)) ||
      (form.dealId !== "" && !isUuid(form.dealId))
    ) {
      validation("تحقق من التصنيف والمرجع والمبلغ والعملة والأبعاد.");
      return;
    }
    void run(
      "draft",
      (csrfToken) =>
        postExpense(
          `${encodeURIComponent(organizationId)}/finance/expenses`,
          csrfToken,
          {
            category: form.category,
            vendorReference: form.vendorReference.trim(),
            amountMinor: form.amountMinor,
            currency: form.currency,
            ...(form.campaignReference === ""
              ? {}
              : { campaignReference: form.campaignReference.trim() }),
            ...(form.propertyId === "" ? {} : { propertyId: form.propertyId }),
            ...(form.dealId === "" ? {} : { dealId: form.dealId }),
          },
        ),
      () =>
        setForm((current) => ({
          ...current,
          vendorReference: "",
          amountMinor: "",
        })),
    );
  }
  function submitEvidence(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (
      !isUuid(form.expenseId) ||
      !isUuid(form.evidenceId) ||
      !isMediaType(form.mediaType) ||
      !isByteSize(form.byteSize) ||
      (form.note !== "" && !isText(form.note, 500)) ||
      !isUtc(form.attachedAt)
    ) {
      validation("تحقق من معرّفات المصروف والمستند وحجمه ووقت الإرفاق.");
      return;
    }
    void run(
      "evidence",
      (csrfToken) =>
        postExpense(
          `${encodeURIComponent(organizationId)}/finance/expenses/${encodeURIComponent(form.expenseId)}/evidence`,
          csrfToken,
          {
            evidenceId: form.evidenceId,
            mediaType: form.mediaType,
            byteSize: Number(form.byteSize),
            ...(form.note === "" ? {} : { note: form.note.trim() }),
            attachedAt: form.attachedAt,
          },
        ),
      () => {
        setForm((current) => ({ ...current, byteSize: "", note: "" }));
        setEvidenceKey(crypto.randomUUID());
      },
    );
  }
  function submitForApproval(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!isUuid(form.expenseId)) {
      validation("أدخل معرّف مصروف صحيحًا للإرسال.");
      return;
    }
    void run(
      "submit",
      (csrfToken) =>
        postExpense(
          `${encodeURIComponent(organizationId)}/finance/expenses/${encodeURIComponent(form.expenseId)}/submit`,
          csrfToken,
        ),
      () => undefined,
    );
  }
  function submitDecision(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (
      !isUuid(form.expenseId) ||
      (form.decision !== "APPROVED" && form.decision !== "REJECTED") ||
      (form.decision === "REJECTED" && !isText(form.decisionReason, 500))
    ) {
      validation("اختر القرار الصحيح؛ الرفض يتطلب سببًا مكتوبًا.");
      return;
    }
    void run(
      "decision",
      (csrfToken) =>
        postExpense(
          `${encodeURIComponent(organizationId)}/finance/expenses/${encodeURIComponent(form.expenseId)}/decision`,
          csrfToken,
          {
            decision: form.decision,
            ...(form.decisionReason === ""
              ? {}
              : { reason: form.decisionReason.trim() }),
          },
        ),
      () => setForm((current) => ({ ...current, decisionReason: "" })),
    );
  }
  function submitPolicy(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (
      (form.thresholdMinor !== "" && !isAmount(form.thresholdMinor)) ||
      !isCurrency(form.policyCurrency)
    ) {
      validation("تحقق من قيمة الحد والعملة؛ الحد الفارغ يعني اعتمادًا مستقلًا دائمًا.");
      return;
    }
    void run(
      "policy",
      (csrfToken) =>
        postExpense(
          `${encodeURIComponent(organizationId)}/finance/expense-approval-policy`,
          csrfToken,
          {
            ...(form.thresholdMinor === ""
              ? {}
              : { thresholdMinor: form.thresholdMinor }),
            currency: form.policyCurrency,
          },
        ),
      () => undefined,
    );
  }
  function validation(text: string): void {
    setMessage({ kind: "validation", text });
  }

  return (
    <section className={styles.workspace} aria-labelledby="expense-title">
      <header className={styles.heading}>
        <p className="eyebrow">المصروفات والمستندات</p>
        <h1 id="expense-title">مسار المصروف</h1>
        <p>
          خمسة أوامر مالية محصورة: مسودة بأبعاد الحملة والعقار والصفقة، إرفاق
          بيانات المستند المؤيد، إرسال للاعتماد وفق حد المؤسسة، قرار نهائي بموافقة
          مستقلة، وسياسة الحد التي يملكها المالك وحده.
        </p>
      </header>

      <div className={styles.rail} aria-label="مراحل المصروف الخمس">
        <FinanceCommandForm
          index="١"
          title="إنشاء مسودة مصروف"
          note="حدد التصنيف والمرجع والأبعاد؛ المبلغ يبقى قابلًا للتعديل قبل الإرسال."
          pending={pending === "draft"}
          disabled={pending !== null}
          action="إنشاء المسودة"
          onSubmit={submitDraft}
        >
          <label>
            <span>التصنيف</span>
            <select
              value={form.category}
              onChange={(event) => update("category", event.target.value)}
            >
              <option value="OFFICE">OFFICE</option>
              <option value="CAMPAIGN">CAMPAIGN</option>
              <option value="PROPERTY">PROPERTY</option>
              <option value="OTHER">OTHER</option>
            </select>
          </label>
          <TechnicalField
            label="مرجع المورّد / المستفيد"
            value={form.vendorReference}
            onChange={(value) => update("vendorReference", value)}
          />
          <TechnicalField
            label="المبلغ بوحدة صغرى"
            value={form.amountMinor}
            inputMode="numeric"
            onChange={(value) => update("amountMinor", value)}
          />
          <TechnicalField
            label="العملة"
            value={form.currency}
            onChange={(value) => update("currency", value.toUpperCase())}
          />
          <TechnicalField
            label="مرجع الحملة (اختياري)"
            value={form.campaignReference}
            onChange={(value) => update("campaignReference", value)}
          />
          <TechnicalField
            label="معرّف العقار (اختياري)"
            value={form.propertyId}
            onChange={(value) => update("propertyId", value)}
          />
          <TechnicalField
            label="معرّف الصفقة (اختياري)"
            value={form.dealId}
            onChange={(value) => update("dealId", value)}
          />
        </FinanceCommandForm>

        <FinanceCommandForm
          index="٢"
          title="إرفاق بيانات المستند"
          note="بيانات وصفية فقط: النوع والحجم والوقت؛ لا تُرفع ملفات فعلية."
          pending={pending === "evidence"}
          disabled={pending !== null}
          action="إرفاق المستند"
          onSubmit={submitEvidence}
        >
          <TechnicalField
            label="معرّف المصروف"
            value={form.expenseId}
            onChange={(value) => update("expenseId", value)}
          />
          <TechnicalField
            label="معرّف المستند"
            value={form.evidenceId}
            onChange={(value) => update("evidenceId", value)}
          />
          <label>
            <span>نوع المستند</span>
            <select
              value={form.mediaType}
              onChange={(event) => update("mediaType", event.target.value)}
            >
              <option value="PDF">PDF</option>
              <option value="JPEG">JPEG</option>
              <option value="PNG">PNG</option>
              <option value="WEBP">WEBP</option>
            </select>
          </label>
          <TechnicalField
            label="الحجم بالبايت"
            value={form.byteSize}
            inputMode="numeric"
            onChange={(value) => update("byteSize", value)}
          />
          <TechnicalField
            label="ملاحظة (اختياري)"
            value={form.note}
            onChange={(value) => update("note", value)}
          />
          <TechnicalField
            label="وقت الإرفاق UTC"
            placeholder="2026-09-21T10:00:00.000Z"
            value={form.attachedAt}
            onChange={(value) => update("attachedAt", value)}
          />
        </FinanceCommandForm>

        <FinanceCommandForm
          index="٣"
          title="الإرسال للاعتماد"
          note="ما دون حد المؤسسة يُعتمد تلقائيًا؛ وما فوقه ينتظر معتمدًا مستقلًا."
          pending={pending === "submit"}
          disabled={pending !== null}
          action="إرسال المصروف"
          onSubmit={submitForApproval}
        >
          <TechnicalField
            label="معرّف المصروف"
            value={form.expenseId}
            onChange={(value) => update("expenseId", value)}
          />
        </FinanceCommandForm>

        <FinanceCommandForm
          index="٤"
          title="قرار الاعتماد"
          note="المصروف المرسل يحتاج معتمدًا مختلفًا عن مُرسله؛ الرفض يتطلب سببًا."
          pending={pending === "decision"}
          disabled={pending !== null}
          action="تسجيل القرار"
          onSubmit={submitDecision}
        >
          <TechnicalField
            label="معرّف المصروف"
            value={form.expenseId}
            onChange={(value) => update("expenseId", value)}
          />
          <label>
            <span>القرار</span>
            <select
              value={form.decision}
              onChange={(event) => update("decision", event.target.value)}
            >
              <option value="APPROVED">اعتماد</option>
              <option value="REJECTED">رفض</option>
            </select>
          </label>
          <TechnicalField
            label="سبب القرار (إلزامي عند الرفض)"
            value={form.decisionReason}
            onChange={(value) => update("decisionReason", value)}
          />
        </FinanceCommandForm>

        <FinanceCommandForm
          index="٥"
          title="سياسة حد الاعتماد"
          note="أمر للمالك فقط: حد بالوحدة الصغرى فوقه يلزم اعتماد مستقل؛ فراغه يعني اعتمادًا مستقلًا لكل مصروف."
          pending={pending === "policy"}
          disabled={pending !== null}
          action="حفظ السياسة"
          onSubmit={submitPolicy}
        >
          <TechnicalField
            label="حد الاعتماد بوحدة صغرى"
            value={form.thresholdMinor}
            inputMode="numeric"
            onChange={(value) => update("thresholdMinor", value)}
          />
          <TechnicalField
            label="عملة الحد"
            value={form.policyCurrency}
            onChange={(value) => update("policyCurrency", value.toUpperCase())}
          />
        </FinanceCommandForm>
      </div>

      {message && (
        <div
          className={`${styles.message} ${styles[message.kind]}`}
          role={message.kind === "success" ? "status" : "alert"}
        >
          <span>{message.text}</span>
          {message.kind === "error" && isSessionErrorMessage(message.text) && (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                setMessage(null);
                void sessionCsrfProvider.getToken();
              }}
            >
              إعادة التحقق من الجلسة
            </button>
          )}
        </div>
      )}
      <span hidden aria-hidden="true">{evidenceKey}</span>
    </section>
  );
}

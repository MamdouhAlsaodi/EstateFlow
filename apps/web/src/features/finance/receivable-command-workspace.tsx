"use client";

import { useState } from "react";
import { createApiClient } from "../../lib/api-client/index";
import { createSessionCsrfProvider } from "../../lib/api-client/session";
import { useOrganizationContext } from "../organization-context/organization-context";
import {
  EMPTY_RECEIVABLE_FORM,
  isAmount,
  isCurrency,
  isReceivableReplay,
  isSessionError,
  isSessionErrorMessage,
  isUtc,
  isUuid,
  receivableSuccessMessage,
  type ReceivableCommand,
  type ReceivableFormState,
  type ReceivableMessage,
} from "./receivable-command-contract";
import { FinanceCommandForm, TechnicalField } from "./finance-command-form";
import styles from "./receivable-command-workspace.module.css";

const apiClient = createApiClient();
const sessionCsrfProvider = createSessionCsrfProvider(apiClient);

export function ReceivableCommandWorkspace() {
  const { organizationId } = useOrganizationContext();
  const [form, setForm] = useState<ReceivableFormState>(EMPTY_RECEIVABLE_FORM);
  const [pending, setPending] = useState<ReceivableCommand | null>(null);
  const [message, setMessage] = useState<ReceivableMessage | null>(null);
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());

  function update(field: keyof ReceivableFormState, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }
  async function run(
    command: ReceivableCommand,
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
        text: isReceivableReplay(result)
          ? "الأمر مطابق لعملية سابقة؛ لم تُنشأ حركة مالية مكررة."
          : receivableSuccessMessage(command),
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
      !isUuid(form.dealId) ||
      !isAmount(form.draftAmountMinor) ||
      !isCurrency(form.draftCurrency)
    ) {
      validation("تحقق من معرّف الصفقة والمبلغ والعملة.");
      return;
    }
    void run(
      "draft",
      (csrfToken) =>
        apiClient.createInvoiceDraft(
          { organizationId, dealId: form.dealId, csrfToken },
          {
            amountMinor: form.draftAmountMinor,
            currency: form.draftCurrency,
          },
        ),
      () => setForm((current) => ({ ...current, draftAmountMinor: "" })),
    );
  }
  function submitIssue(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (
      !isUuid(form.invoiceId) ||
      !isUuid(form.receivableId) ||
      !isUtc(form.issuedAt) ||
      !isUtc(form.dueAt) ||
      Date.parse(form.dueAt) < Date.parse(form.issuedAt)
    ) {
      validation(
        "تحقق من المعرّفات والتواريخ؛ موعد الاستحقاق لا يسبق الإصدار.",
      );
      return;
    }
    void run(
      "issue",
      (csrfToken) =>
        apiClient.issueInvoice(
          { organizationId, invoiceId: form.invoiceId, csrfToken },
          {
            receivableId: form.receivableId,
            issuedAt: form.issuedAt,
            dueAt: form.dueAt,
          },
        ),
      () =>
        setForm((current) => ({
          ...current,
          invoiceId: "",
          receivableId: "",
          issuedAt: "",
          dueAt: "",
        })),
    );
  }
  function submitPayment(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (
      !isUuid(form.paymentReceivableId) ||
      !isAmount(form.paymentAmountMinor) ||
      !isCurrency(form.paymentCurrency) ||
      !isUtc(form.recordedAt)
    ) {
      validation("تحقق من معرّف المستحق والمبلغ والعملة ووقت التسجيل.");
      return;
    }
    void run(
      "payment",
      (csrfToken) =>
        apiClient.recordReceivablePayment(
          {
            organizationId,
            receivableId: form.paymentReceivableId,
            csrfToken,
            idempotencyKey: paymentKey,
          },
          {
            amountMinor: form.paymentAmountMinor,
            currency: form.paymentCurrency,
            recordedAt: form.recordedAt,
          },
        ),
      () => {
        setForm((current) => ({
          ...current,
          paymentAmountMinor: "",
          recordedAt: "",
        }));
        setPaymentKey(crypto.randomUUID());
      },
    );
  }
  function validation(text: string): void {
    setMessage({ kind: "validation", text });
  }

  return (
    <section className={styles.workspace} aria-labelledby="receivable-title">
      <header className={styles.heading}>
        <p className="eyebrow">الفواتير والمستحقات</p>
        <h1 id="receivable-title">مسار التحصيل</h1>
        <p>
          ثلاثة أوامر مالية واضحة للمؤسسة الحالية. كل مرحلة تعتمد على معرّفات
          مؤكدة، وتظهر أسفلها أدوات الإلغاء وقراءة أعمار المستحقات.
        </p>
      </header>

      <div className={styles.rail} aria-label="مراحل التحصيل الثلاث">
        <FinanceCommandForm
          index="١"
          title="إنشاء مسودة فاتورة"
          note="حدد الصفقة والمبلغ الصريح قبل تثبيت الفاتورة."
          pending={pending === "draft"}
          disabled={pending !== null}
          action="إنشاء المسودة"
          onSubmit={submitDraft}
        >
          <TechnicalField
            label="معرّف الصفقة"
            value={form.dealId}
            onChange={(value) => update("dealId", value)}
          />
          <TechnicalField
            label="المبلغ بوحدة صغرى"
            value={form.draftAmountMinor}
            inputMode="numeric"
            onChange={(value) => update("draftAmountMinor", value)}
          />
          <TechnicalField
            label="العملة"
            value={form.draftCurrency}
            onChange={(value) => update("draftCurrency", value.toUpperCase())}
          />
        </FinanceCommandForm>

        <FinanceCommandForm
          index="٢"
          title="إصدار الفاتورة"
          note="الإصدار يثبت المبلغ وينشئ مستحقًا واحدًا."
          pending={pending === "issue"}
          disabled={pending !== null}
          action="إصدار الفاتورة"
          onSubmit={submitIssue}
        >
          <TechnicalField
            label="معرّف الفاتورة"
            value={form.invoiceId}
            onChange={(value) => update("invoiceId", value)}
          />
          <TechnicalField
            label="معرّف المستحق الجديد"
            value={form.receivableId}
            onChange={(value) => update("receivableId", value)}
          />
          <TechnicalField
            label="وقت الإصدار UTC"
            placeholder="2026-08-17T10:00:00.000Z"
            value={form.issuedAt}
            onChange={(value) => update("issuedAt", value)}
          />
          <TechnicalField
            label="موعد الاستحقاق UTC"
            placeholder="2026-09-17T10:00:00.000Z"
            value={form.dueAt}
            onChange={(value) => update("dueAt", value)}
          />
        </FinanceCommandForm>

        <FinanceCommandForm
          index="٣"
          title="تسجيل دفعة"
          note="أعد المحاولة بأمان عند انقطاع الطلب؛ هوية الدفعة تبقى ثابتة حتى النجاح."
          pending={pending === "payment"}
          disabled={pending !== null}
          action="تسجيل الدفعة"
          onSubmit={submitPayment}
        >
          <TechnicalField
            label="معرّف المستحق"
            value={form.paymentReceivableId}
            onChange={(value) => update("paymentReceivableId", value)}
          />
          <TechnicalField
            label="المبلغ بوحدة صغرى"
            value={form.paymentAmountMinor}
            inputMode="numeric"
            onChange={(value) => update("paymentAmountMinor", value)}
          />
          <TechnicalField
            label="العملة"
            value={form.paymentCurrency}
            onChange={(value) => update("paymentCurrency", value.toUpperCase())}
          />
          <TechnicalField
            label="وقت التسجيل UTC"
            placeholder="2026-08-18T10:00:00.000Z"
            value={form.recordedAt}
            onChange={(value) => update("recordedAt", value)}
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
    </section>
  );
}

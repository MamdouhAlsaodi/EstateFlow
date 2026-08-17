"use client";

import { useState } from "react";
import { ApiError, createApiClient } from "../../lib/api-client/index";
import { createSessionCsrfProvider } from "../../lib/api-client/session";
import { useOrganizationContext } from "../organization-context/organization-context";
import { isUuid } from "./receivable-command-contract";
import styles from "./receivable-reconciliation-workspace.module.css";

const apiClient = createApiClient();
const csrfProvider = createSessionCsrfProvider(apiClient);

export function ReceivableCancellationPanel() {
  const { organizationId } = useOrganizationContext();
  const [invoiceId, setInvoiceId] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);

  async function submit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const normalizedReason = reason.trim();
    const normalizedInvoiceId = invoiceId.trim();
    if (!isUuid(normalizedInvoiceId)) {
      setMessage({ kind: "error", text: "تحقق من معرّف الفاتورة." });
      return;
    }
    if (
      Array.from(normalizedReason).length < 1 ||
      Array.from(normalizedReason).length > 500
    ) {
      setMessage({
        kind: "error",
        text: "أدخل سببًا من 1 إلى 500 حرفًا.",
      });
      return;
    }
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const csrfToken = await csrfProvider.getToken();
      await apiClient.cancelInvoice(
        { organizationId, invoiceId: normalizedInvoiceId, csrfToken },
        { reason: normalizedReason },
      );
      setInvoiceId("");
      setReason("");
      setMessage({
        kind: "success",
        text: "أُلغيت الفاتورة بنجاح دون تعديل أي دفعة.",
      });
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      )
        csrfProvider.clear();
      setMessage({ kind: "error", text: cancellationError(error) });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="cancel-invoice-title">
      <div className={styles.panelHeading}>
        <p className="eyebrow">إجراء مضبوط</p>
        <h2 id="cancel-invoice-title">إلغاء فاتورة</h2>
        <p>يقرر الخادم صلاحية الإلغاء. لا يمكن إلغاء فاتورة لها دفعة.</p>
      </div>
      <form className={styles.form} onSubmit={submit}>
        <label>
          معرّف الفاتورة
          <input
            dir="ltr"
            required
            value={invoiceId}
            onChange={(event) => setInvoiceId(event.target.value)}
          />
        </label>
        <label>
          سبب الإلغاء
          <textarea
            required
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <button
          className="button button-primary"
          type="submit"
          disabled={pending}
        >
          {pending ? "جارٍ الإلغاء…" : "إلغاء الفاتورة"}
        </button>
      </form>
      {message && (
        <p
          className={`${styles.state} ${styles[message.kind]}`}
          role={message.kind === "success" ? "status" : "alert"}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}

function cancellationError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409)
    return "لا يمكن إلغاء فاتورة عليها دفعة مالية.";
  if (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403)
  )
    return "انتهت الجلسة أو لا تملك الصلاحية. أعد التحقق ثم حاول مجددًا.";
  return "تعذر إلغاء الفاتورة. بقي المعرّف والسبب كما هما لمحاولة آمنة.";
}

"use client";

import { useState } from "react";
import { useT, type Translator } from "../../i18n";
import { ApiError, createApiClient } from "../../lib/api-client/index";
import { createSessionCsrfProvider } from "../../lib/api-client/session";
import { useOrganizationContext } from "../organization-context/organization-context";
import { isUuid } from "./receivable-command-contract";
import styles from "./receivable-reconciliation-workspace.module.css";

const apiClient = createApiClient();
const csrfProvider = createSessionCsrfProvider(apiClient);

export function ReceivableCancellationPanel() {
  const t = useT();
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
      setMessage({
        kind: "error",
        text: t("finance.cancellation.invoiceValidation"),
      });
      return;
    }
    if (
      Array.from(normalizedReason).length < 1 ||
      Array.from(normalizedReason).length > 500
    ) {
      setMessage({
        kind: "error",
        text: t("finance.cancellation.reasonValidation"),
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
        text: t("finance.cancellation.success"),
      });
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      )
        csrfProvider.clear();
      setMessage({ kind: "error", text: cancellationError(t, error) });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="cancel-invoice-title">
      <div className={styles.panelHeading}>
        <p className="eyebrow">{t("finance.cancellation.eyebrow")}</p>
        <h2 id="cancel-invoice-title">{t("finance.cancellation.title")}</h2>
        <p>{t("finance.cancellation.subtitle")}</p>
      </div>
      <form className={styles.form} onSubmit={submit}>
        <label>
          {t("finance.cancellation.invoiceLabel")}
          <input
            dir="ltr"
            required
            value={invoiceId}
            onChange={(event) => setInvoiceId(event.target.value)}
          />
        </label>
        <label>
          {t("finance.cancellation.reasonLabel")}
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
          {pending
            ? t("finance.cancellation.cancelling")
            : t("finance.cancellation.submit")}
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

function cancellationError(t: Translator, error: unknown): string {
  if (error instanceof ApiError && error.status === 409)
    return t("finance.cancellation.paidConflict");
  if (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403)
  )
    return t("finance.cancellation.sessionExpired");
  return t("finance.cancellation.genericError");
}

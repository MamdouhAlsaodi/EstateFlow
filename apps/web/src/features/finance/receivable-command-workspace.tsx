"use client";

import { useState } from "react";
import { useT } from "../../i18n";
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
  const t = useT();
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
          ? t("finance.receivable.replayNotice")
          : t(receivableSuccessMessage(command)),
      });
    } catch (error) {
      if (isSessionError(error)) sessionCsrfProvider.clear();
      setMessage({
        kind: "error",
        text: isSessionError(error)
          ? t("finance.receivable.sessionExpired")
          : t("finance.command.actionFailed"),
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
      validation(t("finance.receivable.draftValidation"));
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
      validation(t("finance.receivable.issueValidation"));
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
      validation(t("finance.receivable.paymentValidation"));
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
        <p className="eyebrow">{t("finance.receivable.eyebrow")}</p>
        <h1 id="receivable-title">{t("finance.receivable.title")}</h1>
        <p>{t("finance.receivable.subtitle")}</p>
      </header>

      <div
        className={styles.rail}
        aria-label={t("finance.receivable.railAria")}
      >
        <FinanceCommandForm
          index={t("finance.stepIndex.1")}
          title={t("finance.receivable.draftTitle")}
          note={t("finance.receivable.draftNote")}
          pending={pending === "draft"}
          disabled={pending !== null}
          action={t("finance.receivable.draftAction")}
          onSubmit={submitDraft}
        >
          <TechnicalField
            label={t("finance.field.dealId")}
            value={form.dealId}
            onChange={(value) => update("dealId", value)}
          />
          <TechnicalField
            label={t("finance.field.amountMinor")}
            value={form.draftAmountMinor}
            inputMode="numeric"
            onChange={(value) => update("draftAmountMinor", value)}
          />
          <TechnicalField
            label={t("finance.field.currency")}
            value={form.draftCurrency}
            onChange={(value) => update("draftCurrency", value.toUpperCase())}
          />
        </FinanceCommandForm>

        <FinanceCommandForm
          index={t("finance.stepIndex.2")}
          title={t("finance.receivable.issueTitle")}
          note={t("finance.receivable.issueNote")}
          pending={pending === "issue"}
          disabled={pending !== null}
          action={t("finance.receivable.issueAction")}
          onSubmit={submitIssue}
        >
          <TechnicalField
            label={t("finance.receivable.invoiceIdLabel")}
            value={form.invoiceId}
            onChange={(value) => update("invoiceId", value)}
          />
          <TechnicalField
            label={t("finance.receivable.newReceivableIdLabel")}
            value={form.receivableId}
            onChange={(value) => update("receivableId", value)}
          />
          <TechnicalField
            label={t("finance.receivable.issuedAtLabel")}
            placeholder="2026-08-17T10:00:00.000Z"
            value={form.issuedAt}
            onChange={(value) => update("issuedAt", value)}
          />
          <TechnicalField
            label={t("finance.receivable.dueAtLabel")}
            placeholder="2026-09-17T10:00:00.000Z"
            value={form.dueAt}
            onChange={(value) => update("dueAt", value)}
          />
        </FinanceCommandForm>

        <FinanceCommandForm
          index={t("finance.stepIndex.3")}
          title={t("finance.receivable.paymentTitle")}
          note={t("finance.receivable.paymentNote")}
          pending={pending === "payment"}
          disabled={pending !== null}
          action={t("finance.receivable.paymentAction")}
          onSubmit={submitPayment}
        >
          <TechnicalField
            label={t("finance.receivable.receivableIdLabel")}
            value={form.paymentReceivableId}
            onChange={(value) => update("paymentReceivableId", value)}
          />
          <TechnicalField
            label={t("finance.field.amountMinor")}
            value={form.paymentAmountMinor}
            inputMode="numeric"
            onChange={(value) => update("paymentAmountMinor", value)}
          />
          <TechnicalField
            label={t("finance.field.currency")}
            value={form.paymentCurrency}
            onChange={(value) => update("paymentCurrency", value.toUpperCase())}
          />
          <TechnicalField
            label={t("finance.receivable.recordedAtLabel")}
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
              {t("finance.command.reauthButton")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

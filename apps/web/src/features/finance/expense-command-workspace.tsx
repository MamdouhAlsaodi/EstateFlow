"use client";

import { useState } from "react";
import { useT } from "../../i18n";
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
  const t = useT();
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
          ? t("finance.expense.replayNotice")
          : t(expenseSuccessMessage(command)),
      });
    } catch (error) {
      if (isSessionError(error)) sessionCsrfProvider.clear();
      setMessage({
        kind: "error",
        text: isSessionError(error)
          ? t("finance.expense.sessionExpired")
          : t("finance.command.actionFailed"),
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
      validation(t("finance.expense.draftValidation"));
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
      validation(t("finance.expense.evidenceValidation"));
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
      validation(t("finance.expense.submitValidation"));
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
      validation(t("finance.expense.decisionValidation"));
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
      validation(t("finance.expense.policyValidation"));
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
        <p className="eyebrow">{t("finance.expense.eyebrow")}</p>
        <h1 id="expense-title">{t("finance.expense.title")}</h1>
        <p>{t("finance.expense.subtitle")}</p>
      </header>

      <div className={styles.rail} aria-label={t("finance.expense.railAria")}>
        <FinanceCommandForm
          index={t("finance.stepIndex.1")}
          title={t("finance.expense.draftTitle")}
          note={t("finance.expense.draftNote")}
          pending={pending === "draft"}
          disabled={pending !== null}
          action={t("finance.expense.draftAction")}
          onSubmit={submitDraft}
        >
          <label>
            <span>{t("finance.field.category")}</span>
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
            label={t("finance.expense.vendorLabel")}
            value={form.vendorReference}
            onChange={(value) => update("vendorReference", value)}
          />
          <TechnicalField
            label={t("finance.field.amountMinor")}
            value={form.amountMinor}
            inputMode="numeric"
            onChange={(value) => update("amountMinor", value)}
          />
          <TechnicalField
            label={t("finance.field.currency")}
            value={form.currency}
            onChange={(value) => update("currency", value.toUpperCase())}
          />
          <TechnicalField
            label={t("finance.expense.campaignRefLabel")}
            value={form.campaignReference}
            onChange={(value) => update("campaignReference", value)}
          />
          <TechnicalField
            label={t("finance.expense.propertyIdLabel")}
            value={form.propertyId}
            onChange={(value) => update("propertyId", value)}
          />
          <TechnicalField
            label={t("finance.expense.dealIdLabel")}
            value={form.dealId}
            onChange={(value) => update("dealId", value)}
          />
        </FinanceCommandForm>

        <FinanceCommandForm
          index={t("finance.stepIndex.2")}
          title={t("finance.expense.evidenceTitle")}
          note={t("finance.expense.evidenceNote")}
          pending={pending === "evidence"}
          disabled={pending !== null}
          action={t("finance.expense.evidenceAction")}
          onSubmit={submitEvidence}
        >
          <TechnicalField
            label={t("finance.field.expenseId")}
            value={form.expenseId}
            onChange={(value) => update("expenseId", value)}
          />
          <TechnicalField
            label={t("finance.expense.evidenceIdLabel")}
            value={form.evidenceId}
            onChange={(value) => update("evidenceId", value)}
          />
          <label>
            <span>{t("finance.expense.mediaTypeLabel")}</span>
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
            label={t("finance.expense.byteSizeLabel")}
            value={form.byteSize}
            inputMode="numeric"
            onChange={(value) => update("byteSize", value)}
          />
          <TechnicalField
            label={t("finance.expense.noteLabel")}
            value={form.note}
            onChange={(value) => update("note", value)}
          />
          <TechnicalField
            label={t("finance.expense.attachedAtLabel")}
            placeholder="2026-09-21T10:00:00.000Z"
            value={form.attachedAt}
            onChange={(value) => update("attachedAt", value)}
          />
        </FinanceCommandForm>

        <FinanceCommandForm
          index={t("finance.stepIndex.3")}
          title={t("finance.expense.submitTitle")}
          note={t("finance.expense.submitNote")}
          pending={pending === "submit"}
          disabled={pending !== null}
          action={t("finance.expense.submitAction")}
          onSubmit={submitForApproval}
        >
          <TechnicalField
            label={t("finance.field.expenseId")}
            value={form.expenseId}
            onChange={(value) => update("expenseId", value)}
          />
        </FinanceCommandForm>

        <FinanceCommandForm
          index={t("finance.stepIndex.4")}
          title={t("finance.expense.decisionTitle")}
          note={t("finance.expense.decisionNote")}
          pending={pending === "decision"}
          disabled={pending !== null}
          action={t("finance.expense.decisionAction")}
          onSubmit={submitDecision}
        >
          <TechnicalField
            label={t("finance.field.expenseId")}
            value={form.expenseId}
            onChange={(value) => update("expenseId", value)}
          />
          <label>
            <span>{t("finance.expense.decisionLabel")}</span>
            <select
              value={form.decision}
              onChange={(event) => update("decision", event.target.value)}
            >
              <option value="APPROVED">
                {t("finance.expense.decisionApprove")}
              </option>
              <option value="REJECTED">
                {t("finance.expense.decisionReject")}
              </option>
            </select>
          </label>
          <TechnicalField
            label={t("finance.expense.decisionReasonLabel")}
            value={form.decisionReason}
            onChange={(value) => update("decisionReason", value)}
          />
        </FinanceCommandForm>

        <FinanceCommandForm
          index={t("finance.stepIndex.5")}
          title={t("finance.expense.policyTitle")}
          note={t("finance.expense.policyNote")}
          pending={pending === "policy"}
          disabled={pending !== null}
          action={t("finance.expense.policyAction")}
          onSubmit={submitPolicy}
        >
          <TechnicalField
            label={t("finance.expense.thresholdLabel")}
            value={form.thresholdMinor}
            inputMode="numeric"
            onChange={(value) => update("thresholdMinor", value)}
          />
          <TechnicalField
            label={t("finance.expense.policyCurrencyLabel")}
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
              {t("finance.command.reauthButton")}
            </button>
          )}
        </div>
      )}
      <span hidden aria-hidden="true">
        {evidenceKey}
      </span>
    </section>
  );
}

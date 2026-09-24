"use client";

import { useState } from "react";
import { createApiClient, type ApiError } from "../../lib/api-client/index";
import { createSessionCsrfProvider } from "../../lib/api-client/session";
import type { CommissionPlanInput } from "../../lib/api-client/commission";
import { arMessages, useT } from "../../i18n";
import { useOrganizationContext } from "../organization-context/organization-context";
import styles from "./commission-command-workspace.module.css";

const apiClient = createApiClient();
const sessionCsrfProvider = createSessionCsrfProvider(apiClient);
type Command = "plan" | "value" | "accrual";
type FormState = Readonly<{
  planVersion: string;
  rateBps: string;
  brokerSplit: string;
  officeSplit: string;
  dealId: string;
  amountMinor: string;
  currency: string;
  capturedAt: string;
  commissionableValueId: string;
  planId: string;
  eventId: string;
}>;
const EMPTY: FormState = {
  planVersion: "1",
  rateBps: "",
  brokerSplit: "6000",
  officeSplit: "4000",
  dealId: "",
  amountMinor: "",
  currency: "USD",
  capturedAt: "",
  commissionableValueId: "",
  planId: "",
  eventId: "",
};

export function CommissionCommandWorkspace() {
  const t = useT();
  const { organizationId } = useOrganizationContext();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [pending, setPending] = useState<Command | null>(null);
  const [message, setMessage] = useState<Readonly<{
    kind: "success" | "error" | "validation";
    text: string;
  }> | null>(null);

  function update(field: keyof FormState, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }
  async function run(
    command: Command,
    operation: (csrfToken: string) => Promise<unknown>,
    reset: () => void,
  ): Promise<void> {
    if (pending === command) return;
    setPending(command);
    setMessage(null);
    try {
      const token = await sessionCsrfProvider.getToken();
      const result = await operation(token);
      reset();
      setMessage({
        kind: "success",
        text: isReplay(result)
          ? t("finance.commission.replayedNotice")
          : t("finance.commission.successNotice"),
      });
    } catch (error) {
      if (isSessionError(error)) sessionCsrfProvider.clear();
      setMessage({
        kind: "error",
        text: isSessionError(error)
          ? t("finance.commission.sessionExpired")
          : t("finance.commission.actionFailed"),
      });
    } finally {
      setPending(null);
    }
  }
  function submitPlan(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const version = integer(form.planVersion);
    const rateBps = integer(form.rateBps);
    const brokerSplit = integer(form.brokerSplit);
    const officeSplit = integer(form.officeSplit);
    if (
      !version ||
      (form.rateBps &&
        (!rateBps ||
          !brokerSplit ||
          !officeSplit ||
          brokerSplit + officeSplit !== 10000))
    ) {
      setMessage({
        kind: "validation",
        text: t("finance.commission.planValidation"),
      });
      return;
    }
    const input: CommissionPlanInput = form.rateBps
      ? {
          version,
          rateBps: rateBps as number,
          recipients: [
            { order: 1, kind: "BROKER", splitBps: brokerSplit as number },
            { order: 2, kind: "OFFICE", splitBps: officeSplit as number },
          ],
        }
      : { version };
    void run(
      "plan",
      (csrfToken) =>
        apiClient.createCommissionPlanVersion(
          { organizationId, csrfToken },
          input,
        ),
      () =>
        setForm((current) => ({
          ...current,
          planVersion: String(version),
          rateBps: "",
        })),
    );
  }
  function submitValue(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!isUuid(form.dealId) || !form.amountMinor || !form.capturedAt) {
      setMessage({
        kind: "validation",
        text: t("finance.commission.valueValidation"),
      });
      return;
    }
    const valueId = crypto.randomUUID();
    void run(
      "value",
      (csrfToken) =>
        apiClient.captureCommissionableValue(
          { organizationId, dealId: form.dealId, csrfToken },
          {
            valueId,
            amountMinor: form.amountMinor,
            currency: form.currency,
            capturedAt: form.capturedAt,
          },
        ),
      () =>
        setForm((current) => ({ ...current, amountMinor: "", capturedAt: "" })),
    );
  }
  function submitAccrual(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (
      !isUuid(form.dealId) ||
      !isUuid(form.commissionableValueId) ||
      !isUuid(form.planId) ||
      !isUuid(form.eventId)
    ) {
      setMessage({
        kind: "validation",
        text: t("finance.commission.accrualValidation"),
      });
      return;
    }
    const accrualId = crypto.randomUUID();
    void run(
      "accrual",
      (csrfToken) =>
        apiClient.createExpectedAccrual(
          { organizationId, dealId: form.dealId, csrfToken },
          {
            accrualId,
            commissionableValueId: form.commissionableValueId,
            commissionPlanVersionId: form.planId,
            dealClosedWonEventId: form.eventId,
          },
        ),
      () =>
        setForm((current) => ({
          ...current,
          commissionableValueId: "",
          planId: "",
          eventId: "",
        })),
    );
  }

  return (
    <section
      className={styles.workspace}
      aria-labelledby="commission-command-title"
    >
      <header className={styles.heading}>
        <p className="eyebrow">{t("finance.commission.eyebrow")}</p>
        <h1 id="commission-command-title">{t("finance.commission.title")}</h1>
        <p>{t("finance.commission.subtitle")}</p>
      </header>
      <div className={styles.grid}>
        <form className={styles.card} onSubmit={submitPlan}>
          <h2>{t("finance.commission.planTitle")}</h2>
          <label>
            {t("finance.commission.versionLabel")}
            <input
              required
              inputMode="numeric"
              value={form.planVersion}
              onChange={(event) => update("planVersion", event.target.value)}
            />
          </label>
          <label>
            {t("finance.commission.rateLabel")}{" "}
            <span>{t("finance.commission.rateHint")}</span>
            <input
              inputMode="numeric"
              value={form.rateBps}
              onChange={(event) => update("rateBps", event.target.value)}
            />
          </label>
          {form.rateBps && (
            <>
              <label>
                {t("finance.commission.brokerSplitLabel")}
                <input
                  required
                  inputMode="numeric"
                  value={form.brokerSplit}
                  onChange={(event) =>
                    update("brokerSplit", event.target.value)
                  }
                />
              </label>
              <label>
                {t("finance.commission.officeSplitLabel")}
                <input
                  required
                  inputMode="numeric"
                  value={form.officeSplit}
                  onChange={(event) =>
                    update("officeSplit", event.target.value)
                  }
                />
              </label>
            </>
          )}
          <button
            className="button button-primary"
            disabled={pending === "plan"}
            type="submit"
          >
            {pending === "plan"
              ? t("finance.formPendingAction")
              : t("finance.commission.planSubmit")}
          </button>
        </form>
        <form className={styles.card} onSubmit={submitValue}>
          <h2>{t("finance.commission.valueTitle")}</h2>
          <TextField
            label={t("finance.field.dealId")}
            value={form.dealId}
            onChange={(value) => update("dealId", value)}
          />
          <TextField
            label={t("finance.field.amountMinor")}
            value={form.amountMinor}
            onChange={(value) => update("amountMinor", value)}
          />
          <TextField
            label={t("finance.field.currency")}
            value={form.currency}
            onChange={(value) => update("currency", value)}
          />
          <TextField
            label={t("finance.commission.capturedAtLabel")}
            value={form.capturedAt}
            onChange={(value) => update("capturedAt", value)}
          />
          <button
            className="button button-primary"
            disabled={pending === "value"}
            type="submit"
          >
            {pending === "value"
              ? t("finance.formPendingAction")
              : t("finance.commission.valueSubmit")}
          </button>
        </form>
        <form className={styles.card} onSubmit={submitAccrual}>
          <h2>{t("finance.commission.accrualTitle")}</h2>
          <TextField
            label={t("finance.field.dealId")}
            value={form.dealId}
            onChange={(value) => update("dealId", value)}
          />
          <TextField
            label={t("finance.commission.valueIdLabel")}
            value={form.commissionableValueId}
            onChange={(value) => update("commissionableValueId", value)}
          />
          <TextField
            label={t("finance.commission.planIdLabel")}
            value={form.planId}
            onChange={(value) => update("planId", value)}
          />
          <TextField
            label={t("finance.commission.eventIdLabel")}
            value={form.eventId}
            onChange={(value) => update("eventId", value)}
          />
          <button
            className="button button-primary"
            disabled={pending === "accrual"}
            type="submit"
          >
            {pending === "accrual"
              ? t("finance.formPendingAction")
              : t("finance.commission.accrualSubmit")}
          </button>
        </form>
      </div>
      {message && (
        <div
          className={styles.message}
          role={message.kind === "success" ? "status" : "alert"}
        >
          {message.text}
          {message.kind === "error" && isSessionErrorMessage(message.text) && (
            <button
              className="button button-secondary"
              onClick={() => {
                setMessage(null);
                void sessionCsrfProvider.getToken();
              }}
              type="button"
            >
              {t("finance.command.reauthButton")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}>) {
  return (
    <label>
      {label}
      <input
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function integer(value: string): number | null {
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
}
function isReplay(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "replayed"
  );
}
function isSessionError(value: unknown): boolean {
  return (
    value instanceof Error &&
    ((value as ApiError).status === 401 || (value as ApiError).status === 403)
  );
}
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
function isSessionErrorMessage(value: string): boolean {
  // The session-expired wording lives in the catalog; match the same visible
  // message without hardcoding Arabic text in feature code.
  return value.includes(arMessages["finance.commission.sessionExpired"]);
}

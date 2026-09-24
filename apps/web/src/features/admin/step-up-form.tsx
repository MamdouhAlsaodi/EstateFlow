"use client";

import { useState } from "react";
import { useT } from "../../i18n";
import { confirmStepUp } from "./admin-api";
import styles from "./admin.module.css";

/**
 * EF-620 — inline step-up re-authentication. Sensitive privileged commands
 * (suspend broker, listing takedown) ask for the account password right
 * before the command: the console confirms first, then sends the command.
 * The API independently enforces the fresh-proof requirement.
 */
export function StepUpForm({
  onConfirmed,
  onCancel,
}: {
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length === 0) {
      setError(t("admin.stepUp.required"));
      return;
    }
    setBusy(true);
    try {
      const confirmed = await confirmStepUp(password);
      if (confirmed) {
        setPassword("");
        onConfirmed();
      } else {
        setError(t("admin.stepUp.wrongPassword"));
      }
    } catch {
      setError(t("admin.stepUp.genericError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={styles.commandForm}
      onSubmit={(event) => void submit(event)}
    >
      <p className={styles.hint}>{t("admin.stepUp.description")}</p>
      <label>
        {t("admin.stepUp.passwordLabel")}
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {error && (
        <div className="state-card" role="alert">
          {error}
        </div>
      )}
      <div className="button-row">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? t("admin.stepUp.confirming") : t("admin.stepUp.confirm")}
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={onCancel}
          disabled={busy}
        >
          {t("admin.common.cancel")}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
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
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length === 0) {
      setError("أدخل كلمة المرور لإعادة التأكيد.");
      return;
    }
    setBusy(true);
    try {
      const confirmed = await confirmStepUp(password);
      if (confirmed) {
        setPassword("");
        onConfirmed();
      } else {
        setError("كلمة المرور غير صحيحة. أعد المحاولة.");
      }
    } catch {
      setError("تعذر إعادة التأكيد الآن. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={styles.commandForm}
      onSubmit={(event) => void submit(event)}
    >
      <p className={styles.hint}>
        هذا إجراء حسّاس: أعد تأكيد كلمة المرور قبل المتابعة. التأكيد صالح لدقائق
        معدودة على هذه الجلسة فقط.
      </p>
      <label>
        كلمة المرور
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
          {busy ? "جارٍ التأكيد…" : "تأكيد"}
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={onCancel}
          disabled={busy}
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}

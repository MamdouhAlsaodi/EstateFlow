import type { FormEvent, ReactNode } from "react";
import styles from "./receivable-command-workspace.module.css";

export function FinanceCommandForm({
  index,
  title,
  note,
  pending,
  disabled,
  action,
  onSubmit,
  children,
}: Readonly<{
  index: string;
  title: string;
  note: string;
  pending: boolean;
  disabled: boolean;
  action: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}>) {
  return (
    <form className={styles.step} onSubmit={onSubmit}>
      <div className={styles.stepHeading}>
        <span className={styles.index} aria-hidden="true">
          {index}
        </span>
        <div>
          <h2>{title}</h2>
          <p>{note}</p>
        </div>
      </div>
      <div className={styles.fields}>{children}</div>
      <button
        className="button button-primary"
        disabled={disabled}
        type="submit"
      >
        {pending ? "جارٍ التنفيذ…" : action}
      </button>
    </form>
  );
}

export function TechnicalField({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "numeric";
}>) {
  return (
    <label>
      {label}
      <input
        dir="ltr"
        required
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

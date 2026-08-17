"use client";

import { ReceivableAgingPanel } from "./receivable-aging-panel";
import { ReceivableCancellationPanel } from "./receivable-cancellation-panel";
import { ReceivableCommandWorkspace } from "./receivable-command-workspace";
import styles from "./receivable-reconciliation-workspace.module.css";

export function ReceivableReconciliationWorkspace() {
  return (
    <div className={styles.workspace}>
      <ReceivableCommandWorkspace />
      <div className={styles.reconciliationGrid}>
        <ReceivableCancellationPanel />
        <ReceivableAgingPanel />
      </div>
    </div>
  );
}

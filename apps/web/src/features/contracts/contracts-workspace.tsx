"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "../../i18n";
import {
  approveContractTemplate,
  createContractTemplate,
  fetchContract,
  fetchContracts,
  fetchContractTemplates,
  generateContract,
  requestAmendment,
  signContract,
  voidContract,
} from "./contracts-api";
import {
  CONTRACT_AUDIT_LABELS,
  CONTRACT_ROLE_LABELS,
  CONTRACT_STATUS_LABELS,
  OPERATIONAL_ESIGN_DISCLAIMER_AR,
  contractPdfUrl,
  type ContractDetail,
  type ContractSummary,
  type ContractTemplateSummary,
} from "./contracts-contract";
import { arMessages } from "../../i18n";
import styles from "./contracts.module.css";

const DEFAULT_TITLE_PATTERN =
  arMessages["contracts.template.defaultTitlePattern"];
const DEFAULT_BODY_PATTERN =
  arMessages["contracts.template.defaultBodyPattern"];

function shortHash(hash: string): string {
  return hash.slice(0, 12);
}

export function ContractsWorkspace({
  organizationId,
}: Readonly<{ organizationId: string }>) {
  const t = useT();
  const [templates, setTemplates] = useState<
    readonly ContractTemplateSummary[]
  >([]);
  const [contracts, setContracts] = useState<readonly ContractSummary[]>([]);
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dealIdInput, setDealIdInput] = useState("");
  const [filterDealId, setFilterDealId] = useState<string | undefined>(
    undefined,
  );
  const [templateKey, setTemplateKey] = useState("sale-agreement");
  const [titlePattern, setTitlePattern] = useState(DEFAULT_TITLE_PATTERN);
  const [bodyPattern, setBodyPattern] = useState(DEFAULT_BODY_PATTERN);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const refresh = useCallback(async () => {
    try {
      const [templateItems, contractItems] = await Promise.all([
        fetchContractTemplates(organizationId),
        fetchContracts(organizationId, filterDealId),
      ]);
      setTemplates(templateItems);
      setContracts(contractItems);
      setError(null);
    } catch {
      setError(t("contracts.workspace.loadFailed"));
    }
  }, [organizationId, filterDealId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<string | void>) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const message = await action();
        if (typeof message === "string") setNotice(message);
        await refresh();
      } catch {
        setError(t("contracts.workspace.actionFailed"));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const openDetail = useCallback(
    (contractId: string) => {
      void run(async () => {
        const loaded = await fetchContract(organizationId, contractId);
        setDetail(loaded);
        return undefined;
      });
    },
    [organizationId, run],
  );

  const approvedTemplates = templates.filter(
    (template) => template.status === "APPROVED",
  );
  const effectiveTemplateId =
    approvedTemplates.find(
      (template) => template.templateId === selectedTemplateId,
    )?.templateId ??
    approvedTemplates[0]?.templateId ??
    "";

  return (
    <main className={styles.grid} dir="rtl">
      <h1>{t("contracts.workspace.title")}</h1>
      <p className={styles.disclaimer} role="note">
        ⚠️ {OPERATIONAL_ESIGN_DISCLAIMER_AR}
      </p>

      <section className={styles.panel} aria-labelledby="generate-heading">
        <h2 id="generate-heading">{t("contracts.workspace.generateTitle")}</h2>
        <p className={styles.meta}>{t("contracts.workspace.generateIntro")}</p>
        <div className={styles.toolbar}>
          <label className={styles.field}>
            <span>{t("contracts.workspace.dealIdLabel")}</span>
            <input
              value={dealIdInput}
              onChange={(event) => setDealIdInput(event.target.value)}
              placeholder="33333333-3333-4333-8333-333333333333"
              disabled={busy}
            />
          </label>
          <label className={styles.field}>
            <span>{t("contracts.workspace.templateLabel")}</span>
            <select
              value={effectiveTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              disabled={busy || approvedTemplates.length === 0}
            >
              {approvedTemplates.length === 0 ? (
                <option value="">
                  {t("contracts.workspace.noApprovedTemplates")}
                </option>
              ) : (
                approvedTemplates.map((template) => (
                  <option key={template.templateId} value={template.templateId}>
                    {t("contracts.workspace.templateWithVersion", {
                      templateKey: template.templateKey,
                      version: template.version,
                    })}
                  </option>
                ))
              )}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || effectiveTemplateId === ""}
            onClick={() =>
              run(async () => {
                await generateContract({
                  organizationId,
                  dealId: dealIdInput.trim(),
                  templateId: effectiveTemplateId,
                });
                return t("contracts.workspace.generatedNotice");
              })
            }
          >
            {t("contracts.workspace.generate")}
          </button>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="template-heading">
        <h2 id="template-heading">{t("contracts.workspace.templatesTitle")}</h2>
        <details className={styles.editor}>
          <summary>{t("contracts.workspace.newTemplateSummary")}</summary>
          <div className={styles.toolbar}>
            <label className={styles.field}>
              <span>{t("contracts.workspace.templateKeyLabel")}</span>
              <input
                value={templateKey}
                onChange={(event) => setTemplateKey(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className={styles.field}>
              <span>{t("contracts.workspace.titlePatternLabel")}</span>
              <input
                value={titlePattern}
                onChange={(event) => setTitlePattern(event.target.value)}
                disabled={busy}
              />
            </label>
          </div>
          <label className={styles.fieldWide}>
            <span>{t("contracts.workspace.bodyPatternLabel")}</span>
            <textarea
              value={bodyPattern}
              onChange={(event) => setBodyPattern(event.target.value)}
              rows={4}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await createContractTemplate({
                  organizationId,
                  templateKey: templateKey.trim(),
                  titlePattern,
                  bodyPattern,
                });
                return t("contracts.workspace.templateCreatedNotice");
              })
            }
          >
            {t("contracts.workspace.createTemplate")}
          </button>
        </details>
        {templates.length === 0 ? (
          <p className={styles.meta}>{t("contracts.workspace.noTemplates")}</p>
        ) : (
          <ul className={styles.list}>
            {templates.map((template) => (
              <li key={template.templateId} className={styles.card}>
                <strong>
                  {t("contracts.workspace.templateWithVersion", {
                    templateKey: template.templateKey,
                    version: template.version,
                  })}
                </strong>
                <span className={styles.meta}>
                  {template.status === "APPROVED"
                    ? template.approvedAt
                      ? t("contracts.workspace.templateApprovedAt", {
                          date: template.approvedAt,
                        })
                      : t("contracts.workspace.templateApproved")
                    : t("contracts.workspace.templateDraft")}
                </span>
                <span className={styles.meta}>{template.titlePattern}</span>
                {template.status === "DRAFT" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await approveContractTemplate({
                          organizationId,
                          templateId: template.templateId,
                        });
                        return t("contracts.workspace.templateApprovedNotice");
                      })
                    }
                  >
                    {t("contracts.workspace.approve")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}

      <section className={styles.panel} aria-labelledby="contracts-heading">
        <h2 id="contracts-heading">
          {t("contracts.workspace.contractsTitle")}
        </h2>
        <div className={styles.toolbar}>
          <label className={styles.field}>
            <span>{t("contracts.workspace.filterLabel")}</span>
            <input
              value={filterDealId ?? ""}
              onChange={(event) =>
                setFilterDealId(
                  event.target.value.trim() === ""
                    ? undefined
                    : event.target.value.trim(),
                )
              }
              placeholder={t("contracts.workspace.filterPlaceholder")}
              disabled={busy}
            />
          </label>
        </div>
        {contracts.length === 0 ? (
          <p className={styles.meta}>{t("contracts.workspace.noContracts")}</p>
        ) : (
          <ul className={styles.list}>
            {contracts.map((contract) => (
              <li
                key={contract.contractId}
                className={`${styles.card} ${contract.status === "FINALIZED" ? styles.finalized : ""}`}
              >
                <strong>{contract.title}</strong>
                <span className={styles.meta}>
                  {t(CONTRACT_STATUS_LABELS[contract.status])} ·{" "}
                  {t("contracts.workspace.signatureCount", {
                    count: contract.signatureCount,
                    total: contract.signerTotal,
                  })}{" "}
                  ·{" "}
                  {t("contracts.workspace.contractTemplateVersion", {
                    templateKey: contract.templateKey,
                    version: contract.templateVersion,
                  })}
                </span>
                <span className={styles.hashLine}>
                  {t("contracts.workspace.hashLine", {
                    pdf: shortHash(contract.pdfSha256),
                    content: shortHash(contract.contentHash),
                  })}
                </span>
                <div className={styles.actions}>
                  <a href={contractPdfUrl(organizationId, contract.contractId)}>
                    {t("contracts.workspace.viewPdf")}
                  </a>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openDetail(contract.contractId)}
                  >
                    {t("contracts.workspace.openDetail")}
                  </button>
                  {contract.status === "DRAFT" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const result = await signContract({
                            organizationId,
                            contractId: contract.contractId,
                          });
                          return result.contractStatus === "FINALIZED"
                            ? t("contracts.workspace.finalizedNotice")
                            : t("contracts.workspace.signedNotice");
                        })
                      }
                    >
                      {t("contracts.workspace.sign")}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail ? (
        <section className={styles.panel} aria-labelledby="detail-heading">
          <h2 id="detail-heading">{t("contracts.workspace.detailTitle")}</h2>
          <p className={styles.disclaimer}>{detail.disclaimer}</p>
          <dl className={styles.details}>
            <dt>{t("contracts.workspace.dtTitle")}</dt>
            <dd>{detail.title}</dd>
            <dt>{t("contracts.workspace.dtStatus")}</dt>
            <dd>{t(CONTRACT_STATUS_LABELS[detail.status])}</dd>
            <dt>{t("contracts.workspace.dtProperty")}</dt>
            <dd>
              {detail.propertyTitle} — {detail.propertyType} —{" "}
              {detail.propertyAddress}
            </dd>
            <dt>{t("contracts.workspace.dtOrg")}</dt>
            <dd>{detail.organizationName}</dd>
            <dt>{t("contracts.workspace.dtCapturedAt")}</dt>
            <dd>{detail.capturedAt}</dd>
            <dt>{t("contracts.workspace.dtPdfHash")}</dt>
            <dd className={styles.hashLine}>{detail.pdfSha256}</dd>
            <dt>{t("contracts.workspace.dtContentHash")}</dt>
            <dd className={styles.hashLine}>{detail.contentHash}</dd>
          </dl>
          <pre className={styles.body}>{detail.body}</pre>
          <h3>{t("contracts.workspace.signersTitle")}</h3>
          <ol className={styles.signers}>
            {detail.signers.map((signer) => (
              <li key={signer.userId}>
                {signer.order}.{" "}
                {CONTRACT_ROLE_LABELS[signer.role]
                  ? t(CONTRACT_ROLE_LABELS[signer.role])
                  : signer.role}{" "}
                — {signer.reference} —{" "}
                {signer.signedAt
                  ? t("contracts.workspace.signedAt", {
                      at: signer.signedAt,
                      hash: shortHash(signer.documentHash ?? ""),
                    })
                  : detail.status === "DRAFT"
                    ? t("contracts.workspace.awaitingTurn")
                    : t("contracts.workspace.notSigned")}
              </li>
            ))}
          </ol>
          {detail.nextSignerOrder !== null ? (
            <p className={styles.meta}>
              {t("contracts.workspace.nextSignerRequired", {
                order: detail.nextSignerOrder,
              })}
            </p>
          ) : null}
          <h3>{t("contracts.workspace.auditTitle")}</h3>
          <ul className={styles.auditList}>
            {detail.auditEvents.map((event) => (
              <li key={event.eventId}>
                {t(CONTRACT_AUDIT_LABELS[event.action])} — {event.createdAt}
                {event.reason
                  ? t("contracts.workspace.auditReason", {
                      reason: event.reason,
                    })
                  : ""}
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            {detail.status === "DRAFT" ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await requestAmendment({
                        organizationId,
                        contractId: detail.contractId,
                        reason: t("contracts.workspace.amendmentReason"),
                      });
                      return t("contracts.workspace.amendmentNotice");
                    })
                  }
                >
                  {t("contracts.workspace.requestAmendment")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const reason = window.prompt(
                        t("contracts.workspace.voidPrompt"),
                      );
                      if (!reason || reason.trim().length === 0)
                        return undefined;
                      await voidContract({
                        organizationId,
                        contractId: detail.contractId,
                        reason: reason.trim(),
                      });
                      return t("contracts.workspace.voidedNotice");
                    })
                  }
                >
                  {t("contracts.workspace.void")}
                </button>
              </>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => setDetail(null)}
            >
              {t("contracts.workspace.closeDetail")}
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

import type { GeneratedContractView } from "./contracts-contract";
import {
  normalizeGeneratedContract,
  normalizeContractTemplate,
} from "./contracts-contract";
import type {
  ContractDetail,
  ContractSummary,
  ContractTemplateSummary,
} from "./contracts-contract";
import {
  normalizeContractDetail,
  normalizeContractList,
  normalizeContractTemplateList,
} from "./contracts-contract";
import { createSessionCsrfProvider } from "../../lib/api-client/session";
import { createApiClient } from "../../lib/api-client/index";

const api = createApiClient();

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function id(name: string, value: string): string {
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID.test(value)) throw new TypeError(`Invalid ${name}`);
  return encodeURIComponent(value);
}

async function csrf(): Promise<string> {
  return createSessionCsrfProvider(api).getToken();
}

export function fetchContractTemplates(
  organizationId: string,
): Promise<readonly ContractTemplateSummary[]> {
  return api
    .request(
      `/organizations/${id("organization id", organizationId)}/contract-templates`,
    )
    .then(normalizeContractTemplateList);
}

export function createContractTemplate(input: {
  organizationId: string;
  templateKey: string;
  titlePattern: string;
  bodyPattern: string;
}): Promise<ContractTemplateSummary> {
  return csrf().then((csrfToken) =>
    api
      .request(
        `/organizations/${id("organization id", input.organizationId)}/contract-templates`,
        {
          method: "POST",
          csrfToken,
          body: {
            templateKey: input.templateKey,
            titlePattern: input.titlePattern,
            bodyPattern: input.bodyPattern,
          },
        },
      )
      .then(normalizeContractTemplate),
  );
}

export function approveContractTemplate(input: {
  organizationId: string;
  templateId: string;
}): Promise<void> {
  return csrf()
    .then((csrfToken) =>
      api.request(
        `/organizations/${id("organization id", input.organizationId)}/contract-templates/${id("template id", input.templateId)}/approve`,
        { method: "POST", csrfToken, body: {} },
      ),
    )
    .then(() => undefined);
}

export function generateContract(input: {
  organizationId: string;
  dealId: string;
  templateId: string;
}): Promise<GeneratedContractView> {
  return csrf().then((csrfToken) =>
    api
      .request(
        `/organizations/${id("organization id", input.organizationId)}/contracts/generate`,
        {
          method: "POST",
          csrfToken,
          body: {
            dealId: input.dealId,
            templateId: input.templateId,
          },
        },
      )
      .then(normalizeGeneratedContract),
  );
}

export function fetchContracts(
  organizationId: string,
  dealId?: string,
): Promise<readonly ContractSummary[]> {
  const query =
    dealId && UUID.test(dealId) ? `?dealId=${encodeURIComponent(dealId)}` : "";
  return api
    .request(
      `/organizations/${id("organization id", organizationId)}/contracts${query}`,
    )
    .then(normalizeContractList);
}

export function fetchContract(
  organizationId: string,
  contractId: string,
): Promise<ContractDetail> {
  return api
    .request(
      `/organizations/${id("organization id", organizationId)}/contracts/${id("contract id", contractId)}`,
    )
    .then(normalizeContractDetail);
}

export function signContract(input: {
  organizationId: string;
  contractId: string;
}): Promise<{ contractStatus: string }> {
  return csrf().then((csrfToken) =>
    api
      .request(
        `/organizations/${id("organization id", input.organizationId)}/contracts/${id("contract id", input.contractId)}/signatures`,
        { method: "POST", csrfToken, body: {} },
      )
      .then((payload) => {
        if (
          typeof payload === "object" &&
          payload !== null &&
          "contractStatus" in payload &&
          typeof (payload as Record<string, unknown>).contractStatus ===
            "string"
        )
          return {
            contractStatus: (payload as Record<string, unknown>)
              .contractStatus as string,
          };
        throw new TypeError("Invalid signature response");
      }),
  );
}

export function requestAmendment(input: {
  organizationId: string;
  contractId: string;
  reason: string;
}): Promise<void> {
  return csrf().then((csrfToken) =>
    api
      .request(
        `/organizations/${id("organization id", input.organizationId)}/contracts/${id("contract id", input.contractId)}/amend-requests`,
        { method: "POST", csrfToken, body: { reason: input.reason } },
      )
      .then(() => undefined),
  );
}

export function voidContract(input: {
  organizationId: string;
  contractId: string;
  reason: string;
}): Promise<void> {
  return csrf().then((csrfToken) =>
    api
      .request(
        `/organizations/${id("organization id", input.organizationId)}/contracts/${id("contract id", input.contractId)}/void`,
        { method: "POST", csrfToken, body: { reason: input.reason } },
      )
      .then(() => undefined),
  );
}

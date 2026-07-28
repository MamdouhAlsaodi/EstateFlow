const expectedOperationIds = new Set(["getLiveHealth", "getReadyHealth"]);

function readHealthOperations(document) {
  const operations = Object.entries(document.paths ?? {}).flatMap(
    ([path, item]) => {
      const operation = item?.get;
      return operation ? [{ path, operation }] : [];
    },
  );
  const operationIds = new Set(
    operations.map(({ operation }) => operation.operationId),
  );

  if (
    operations.length !== 2 ||
    operationIds.size !== expectedOperationIds.size ||
    [...expectedOperationIds].some(
      (operationId) => !operationIds.has(operationId),
    )
  ) {
    throw new Error("Unsupported OpenAPI health operations");
  }

  return operations.sort(({ operation: first }, { operation: second }) =>
    first.operationId.localeCompare(second.operationId),
  );
}

function readStatusEnum({ path, operation }) {
  const statusEnum =
    operation.responses?.["200"]?.content?.["application/json"]?.schema
      ?.properties?.status?.enum;

  if (
    !Array.isArray(statusEnum) ||
    statusEnum.length === 0 ||
    statusEnum.some((status) => typeof status !== "string")
  ) {
    throw new Error(
      `OpenAPI health operation ${operation.operationId} at ${path} must define a non-empty string status enum`,
    );
  }

  return statusEnum;
}

export function generateOpenApiClient(document) {
  const operations = readHealthOperations(document);
  const statusLiterals = [...new Set(operations.flatMap(readStatusEnum))].map(
    (status) => JSON.stringify(status),
  );
  const clientMethods = operations
    .map(
      ({ path, operation }) =>
        `    ${operation.operationId}: () => requestHealth(${JSON.stringify(path.slice(1))}),`,
    )
    .join("\n");

  return `export type HealthStatus = {
  status: ${statusLiterals.join(" | ")};
};

export type FetchLike = (
  input: string,
  init?: { method: string },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export type EstateFlowClientOptions = {
  baseUrl: string;
  fetch?: FetchLike;
};

export function createEstateFlowClient({
  baseUrl,
  fetch,
}: EstateFlowClientOptions) {
  const request = fetch ?? (globalThis.fetch as FetchLike | undefined);

  if (!request) throw new Error("A fetch implementation is required");

  const requestHealth = async (path: string): Promise<HealthStatus> => {
    const response = await request(new URL(path, baseUrl).toString(), {
      method: "GET",
    });

    if (!response.ok) throw new Error("EstateFlow API request failed");

    return response.json() as Promise<HealthStatus>;
  };

  return {
${clientMethods}
  };
}
`;
}

export type HealthStatus = {
  status: "ok";
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
    getLiveHealth: () => requestHealth("health/live"),
    getReadyHealth: () => requestHealth("health/ready"),
  };
}

export function resolveApiOrigin(rawOrigin: string | undefined): string {
  if (!rawOrigin || rawOrigin.trim().length === 0) {
    throw new Error(
      "API_ORIGIN is required and must be an absolute http(s) origin",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawOrigin.trim());
  } catch {
    throw new Error(
      "API_ORIGIN must be an absolute http(s) origin without credentials, query, or fragment",
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("API_ORIGIN must use http or https");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      "API_ORIGIN must not contain credentials, a query, or a fragment",
    );
  }
  if (parsed.pathname !== "" && parsed.pathname !== "/") {
    throw new Error(
      "API_ORIGIN must not contain a path; configure the API origin without /api",
    );
  }

  return parsed.origin;
}

export function createApiRewrite(apiOrigin: string): Readonly<{
  source: "/api/:path*";
  destination: string;
}> {
  return {
    source: "/api/:path*",
    destination: `${apiOrigin}/:path*`,
  };
}

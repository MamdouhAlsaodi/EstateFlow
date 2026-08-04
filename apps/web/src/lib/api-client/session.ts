import type { ApiClient } from "./index";

export type SessionResponse = Readonly<{
  id: string;
  verified: boolean;
  csrfToken: string | null;
}>;

export type SessionHelper = Readonly<{
  refresh(): Promise<SessionResponse>;
  getCsrfToken(): string | null;
  clear(): void;
}>;

export type SessionCsrfProvider = Readonly<{
  getToken(): Promise<string>;
  clear(): void;
}>;

export function createSessionCsrfProvider(client: ApiClient): SessionCsrfProvider {
  const session = createSessionHelper(client);
  return {
    async getToken() {
      const existing = session.getCsrfToken();
      if (existing) return existing;
      const refreshed = await session.refresh();
      if (!refreshed.csrfToken) throw new Error("تعذر التحقق من الجلسة");
      return refreshed.csrfToken;
    },
    clear: session.clear,
  };
}

export function createSessionHelper(client: ApiClient): SessionHelper {
  let csrfToken: string | null = null;

  return {
    async refresh(): Promise<SessionResponse> {
      const session = await client.getSession();
      csrfToken = session.csrfToken;
      return session;
    },
    getCsrfToken: () => csrfToken,
    clear: () => {
      csrfToken = null;
    },
  };
}

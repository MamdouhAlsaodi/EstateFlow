"use client";

import { createContext, useContext, type ReactNode } from "react";

export type OrganizationContextValue = Readonly<{
  organizationId: string;
}>;

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export function OrganizationProvider({ organizationId, children }: Readonly<{ organizationId: string; children: ReactNode }>) {
  if (organizationId.trim().length === 0) throw new Error("OrganizationProvider requires an organization ID");
  return <OrganizationContext.Provider value={{ organizationId }}>{children}</OrganizationContext.Provider>;
}

export function useOrganizationContext(): OrganizationContextValue {
  const context = useContext(OrganizationContext);
  if (context === null) throw new Error("useOrganizationContext must be used within OrganizationProvider");
  return context;
}

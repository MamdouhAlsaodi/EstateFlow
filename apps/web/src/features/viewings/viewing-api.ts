import { createApiClient } from "../../lib/api-client/index";
import { createSessionCsrfProvider } from "../../lib/api-client/session";
import {
  normalizeViewingDetail,
  normalizeViewingPage,
  type ViewingDetail,
  type ViewingPage,
} from "./viewing-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const api = createApiClient();
function id(name: string, value: string): string {
  if (!UUID.test(value)) throw new TypeError(`Invalid ${name}`);
  return encodeURIComponent(value);
}
function instant(name: string, value: string): string {
  if (!UTC.test(value)) throw new TypeError(`Invalid ${name}`);
  return value;
}
async function csrf(): Promise<string> {
  return createSessionCsrfProvider(api).getToken();
}
export function fetchViewings(input: {
  organizationId: string;
  from?: string;
  to?: string;
}): Promise<ViewingPage> {
  const organizationId = id("organization id", input.organizationId);
  const query = new URLSearchParams();
  if (input.from !== undefined) query.set("from", instant("from", input.from));
  if (input.to !== undefined) query.set("to", instant("to", input.to));
  const suffix = query.toString() ? `?${query}` : "";
  return api
    .request(`/organizations/${organizationId}/viewings${suffix}`)
    .then(normalizeViewingPage);
}
export function fetchViewingDetail(input: {
  organizationId: string;
  viewingId: string;
}): Promise<ViewingDetail> {
  const organizationId = id("organization id", input.organizationId);
  const viewingId = id("viewing id", input.viewingId);
  return api
    .request(`/organizations/${organizationId}/viewings/${viewingId}`)
    .then(normalizeViewingDetail);
}

export function requestViewing(input: {
  organizationId: string;
  leadId: string;
  propertyId: string;
  brokerId: string;
  startAt: string;
  endAt: string;
  notes?: string;
}): Promise<unknown> {
  const organizationId = id("organization id", input.organizationId);
  return csrf().then((csrfToken) =>
    api.request(`/organizations/${organizationId}/viewings`, {
      method: "POST",
      csrfToken,
      body: {
        leadId: id("lead id", input.leadId),
        propertyId: id("property id", input.propertyId),
        brokerId: id("broker id", input.brokerId),
        startAt: instant("startAt", input.startAt),
        endAt: instant("endAt", input.endAt),
        ...(input.notes ? { notes: input.notes.trim() } : {}),
      },
    }),
  );
}
export function viewingAction(input: {
  organizationId: string;
  viewingId: string;
  action: "confirm" | "cancel" | "complete" | "no-show";
}): Promise<unknown> {
  const organizationId = id("organization id", input.organizationId);
  const viewingId = id("viewing id", input.viewingId);
  return csrf().then((csrfToken) =>
    api.request(
      `/organizations/${organizationId}/viewings/${viewingId}/${input.action}`,
      { method: "POST", csrfToken, body: {} },
    ),
  );
}
export function rescheduleViewing(input: {
  organizationId: string;
  viewingId: string;
  startAt: string;
  endAt: string;
  reason?: string;
}): Promise<unknown> {
  const organizationId = id("organization id", input.organizationId);
  const viewingId = id("viewing id", input.viewingId);
  return csrf().then((csrfToken) =>
    api.request(
      `/organizations/${organizationId}/viewings/${viewingId}/reschedule`,
      {
        method: "POST",
        csrfToken,
        body: {
          startAt: instant("startAt", input.startAt),
          endAt: instant("endAt", input.endAt),
          ...(input.reason ? { reason: input.reason.trim() } : {}),
        },
      },
    ),
  );
}

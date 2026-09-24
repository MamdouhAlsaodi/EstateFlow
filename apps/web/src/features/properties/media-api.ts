import type {
  MediaList,
  PropertySummary,
  UploadIntentView,
} from "./media-contract";
import {
  normalizeMediaList,
  normalizePropertySummary,
  normalizeUploadIntent,
} from "./media-contract";
import { createSessionCsrfProvider } from "../../lib/api-client/session";
import { createApiClient } from "../../lib/api-client/index";

const api = createApiClient();

function id(name: string, value: string): string {
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID.test(value)) throw new TypeError(`Invalid ${name}`);
  return encodeURIComponent(value);
}

async function csrf(): Promise<string> {
  return createSessionCsrfProvider(api).getToken();
}

export function fetchPropertySummary(
  organizationId: string,
  propertyId: string,
): Promise<PropertySummary> {
  return api
    .request(
      `/organizations/${id("organization id", organizationId)}/properties/${id("property id", propertyId)}`,
    )
    .then(normalizePropertySummary);
}

export function fetchMedia(
  organizationId: string,
  propertyId: string,
): Promise<MediaList> {
  return api
    .request(
      `/organizations/${id("organization id", organizationId)}/properties/${id("property id", propertyId)}/media`,
    )
    .then(normalizeMediaList);
}

export function createUploadIntent(input: {
  organizationId: string;
  propertyId: string;
  kind: "IMAGE" | "VIDEO";
  contentType: string;
  byteSize: number;
  fileName: string;
}): Promise<UploadIntentView> {
  const organizationId = id("organization id", input.organizationId);
  const propertyId = id("property id", input.propertyId);
  return csrf().then((csrfToken) =>
    api
      .request(
        `/organizations/${organizationId}/properties/${propertyId}/media/upload-intents`,
        {
          method: "POST",
          csrfToken,
          body: {
            kind: input.kind,
            contentType: input.contentType,
            byteSize: input.byteSize,
            fileName: input.fileName,
          },
        },
      )
      .then(normalizeUploadIntent),
  );
}

/**
 * Direct upload to the storage simulation boundary — the API business layer
 * never sees these bytes; confirm reads them from the storage port.
 */
export async function uploadMediaBytes(input: {
  organizationId: string;
  propertyId: string;
  storageKey: string;
  token: string;
  file: File;
}): Promise<void> {
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID.test(input.organizationId)) throw new TypeError("Invalid org id");
  if (!UUID.test(input.propertyId)) throw new TypeError("Invalid property id");
  const response = await fetch(
    `/api/organizations/${encodeURIComponent(input.organizationId)}` +
      `/properties/${encodeURIComponent(input.propertyId)}` +
      `/media/storage-objects/${encodeURIComponent(input.storageKey)}` +
      `?token=${encodeURIComponent(input.token)}`,
    {
      method: "PUT",
      headers: { "content-type": input.file.type },
      body: input.file,
      credentials: "include",
    },
  );
  if (!response.ok) {
    throw new Error("فشل الرفع المباشر إلى التخزين");
  }
}

export function confirmUpload(input: {
  organizationId: string;
  propertyId: string;
  mediaId: string;
  token: string;
}): Promise<unknown> {
  const organizationId = id("organization id", input.organizationId);
  const propertyId = id("property id", input.propertyId);
  const mediaId = id("media id", input.mediaId);
  return csrf().then((csrfToken) =>
    api.request(
      `/organizations/${organizationId}/properties/${propertyId}/media/${mediaId}/confirm`,
      { method: "POST", csrfToken, body: { token: input.token } },
    ),
  );
}

export function setMediaCover(input: {
  organizationId: string;
  propertyId: string;
  mediaId: string;
}): Promise<unknown> {
  const organizationId = id("organization id", input.organizationId);
  const propertyId = id("property id", input.propertyId);
  const mediaId = id("media id", input.mediaId);
  return csrf().then((csrfToken) =>
    api.request(
      `/organizations/${organizationId}/properties/${propertyId}/media/${mediaId}/cover`,
      { method: "POST", csrfToken, body: {} },
    ),
  );
}

export function removeMedia(input: {
  organizationId: string;
  propertyId: string;
  mediaId: string;
}): Promise<unknown> {
  const organizationId = id("organization id", input.organizationId);
  const propertyId = id("property id", input.propertyId);
  const mediaId = id("media id", input.mediaId);
  return csrf().then((csrfToken) =>
    api.request(
      `/organizations/${organizationId}/properties/${propertyId}/media/${mediaId}`,
      { method: "DELETE", csrfToken, body: {} },
    ),
  );
}

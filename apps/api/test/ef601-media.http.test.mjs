import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { PassThrough } from "node:stream";
import {
  BadRequestException,
  ForbiddenException,
  RequestMethod,
  ValidationPipe,
} from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants.js";
import test from "node:test";
import { BrowserSessionGuard } from "../dist/features/auth/http/browser-session.guard.js";
import { CsrfGuard } from "../dist/features/auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../dist/features/auth/http/origin.guard.js";
import { MediaApplication } from "../dist/features/media/application/media-application.js";
import { MediaIntentSigner } from "../dist/features/media/domain/media-intent.js";
import {
  InMemoryFakeStorageAdapter,
  opaqueStorageKey,
} from "../dist/features/media/domain/storage.port.js";
import { MediaController } from "../dist/features/media/http/media.controller.js";
import { MediaStorageSimController } from "../dist/features/media/http/media-storage.controller.js";
import {
  ConfirmUploadDto,
  CreateUploadIntentDto,
  MediaBytesQueryDto,
} from "../dist/features/media/http/media.dto.js";
import { validPng } from "./support/ef601-media-fixtures.mjs";

const routes = (method) => [
  Reflect.getMetadata(PATH_METADATA, MediaController.prototype[method]),
  Reflect.getMetadata(METHOD_METADATA, MediaController.prototype[method]),
];
const guards = (method) =>
  Reflect.getMetadata(GUARDS_METADATA, MediaController.prototype[method]);

async function validateBody(value, metatype) {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }).transform(value, { type: "body", metatype });
}

test("EF-601 media routes exist with the right methods and browser guards", () => {
  assert.deepEqual(routes("createUploadIntent"), [
    "organizations/:organizationId/properties/:propertyId/media/upload-intents",
    RequestMethod.POST,
  ]);
  assert.deepEqual(routes("confirmUpload"), [
    "organizations/:organizationId/properties/:propertyId/media/:mediaId/confirm",
    RequestMethod.POST,
  ]);
  assert.deepEqual(routes("listMedia"), [
    "organizations/:organizationId/properties/:propertyId/media",
    RequestMethod.GET,
  ]);
  assert.deepEqual(routes("mediaBytes"), [
    "organizations/:organizationId/properties/:propertyId/media/:mediaId/bytes",
    RequestMethod.GET,
  ]);
  assert.deepEqual(routes("setCover"), [
    "organizations/:organizationId/properties/:propertyId/media/:mediaId/cover",
    RequestMethod.POST,
  ]);
  assert.deepEqual(routes("removeMedia"), [
    "organizations/:organizationId/properties/:propertyId/media/:mediaId",
    RequestMethod.DELETE,
  ]);

  const UNSAFE = [RequireCanonicalOriginGuard, BrowserSessionGuard, CsrfGuard];
  for (const method of [
    "createUploadIntent",
    "confirmUpload",
    "setCover",
    "removeMedia",
  ]) {
    assert.deepEqual(guards(method), UNSAFE, method);
  }
  for (const method of ["listMedia", "mediaBytes"]) {
    assert.deepEqual(guards(method), [BrowserSessionGuard], method);
  }
  assert.deepEqual(
    routes === null ? null : MediaStorageSimController.name,
    "MediaStorageSimController",
  );
  const simRoute = [
    Reflect.getMetadata(
      PATH_METADATA,
      MediaStorageSimController.prototype.putObject,
    ),
    Reflect.getMetadata(
      METHOD_METADATA,
      MediaStorageSimController.prototype.putObject,
    ),
  ];
  assert.deepEqual(simRoute, [
    "organizations/:organizationId/properties/:propertyId/media/storage-objects/:storageKey",
    RequestMethod.PUT,
  ]);
});

test("EF-601 intent/confirm DTOs are strict allowlists", async () => {
  const valid = await validateBody(
    {
      kind: "IMAGE",
      contentType: "image/png",
      byteSize: 1234,
      fileName: "photo.png",
    },
    CreateUploadIntentDto,
  );
  assert.equal(valid.kind, "IMAGE");
  assert.equal(valid.byteSize, 1234);
  await assert.rejects(
    () =>
      validateBody(
        {
          kind: "GIF",
          contentType: "image/png",
          byteSize: 10,
          fileName: "a.png",
        },
        CreateUploadIntentDto,
      ),
    BadRequestException,
  );
  await assert.rejects(
    () =>
      validateBody(
        { kind: "IMAGE", contentType: "png", byteSize: 10, fileName: "a.png" },
        CreateUploadIntentDto,
      ),
    BadRequestException,
  );
  await assert.rejects(
    () =>
      validateBody(
        {
          kind: "IMAGE",
          contentType: "image/png",
          byteSize: 0,
          fileName: "a.png",
        },
        CreateUploadIntentDto,
      ),
    BadRequestException,
  );
  await assert.rejects(
    () =>
      validateBody(
        {
          kind: "IMAGE",
          contentType: "image/png",
          byteSize: 10,
          fileName: "a.png",
          extra: true,
        },
        CreateUploadIntentDto,
      ),
    BadRequestException,
  );
  await assert.rejects(
    () => validateBody({ token: "" }, ConfirmUploadDto),
    BadRequestException,
  );
  const bytesQuery = await validateBody(
    { variant: "THUMB" },
    MediaBytesQueryDto,
  );
  assert.equal(bytesQuery.variant, "THUMB");
  await assert.rejects(
    () => validateBody({ variant: "HUGE" }, MediaBytesQueryDto),
    BadRequestException,
  );
});

function controllerHarness(role = "OWNER", overrides = {}) {
  const signer = new MediaIntentSigner(
    Buffer.from("ef601-http-test-secret-000000000000000", "utf8"),
  );
  const storage = new InMemoryFakeStorageAdapter(signer);
  const application = new MediaApplication({
    repository: {
      async findProperty() {
        return { id: "property", coverMediaId: null };
      },
      async createAsset(input) {
        return {
          ...input,
          status: "PENDING",
          format: null,
          byteSize: null,
          sha256: null,
          width: null,
          height: null,
          processingNote: null,
          confirmedAt: null,
          orphanMarkedAt: null,
          updatedAt: input.createdAt,
          variants: [],
        };
      },
      ...overrides,
    },
    storage,
    signer,
  });
  const controller = new MediaController(application, {
    findMembership: async () => ({
      organizationId: "org",
      role,
      status: "ACTIVE",
    }),
  });
  return { controller, application, storage, signer };
}

const REQUEST = {
  auth: { userId: "u1", verified: true, platformRole: "NONE" },
};

test("EF-601 controller maps typed errors to HTTP statuses without leaking internals", async () => {
  const { controller } = controllerHarness("CLIENT");
  await assert.rejects(
    () =>
      controller.createUploadIntent(
        "org",
        "prop",
        {
          kind: "IMAGE",
          contentType: "image/png",
          byteSize: 100,
          fileName: "a.png",
        },
        REQUEST,
      ),
    ForbiddenException,
  );
});

test("EF-601 validation failures surface the typed code as the response message", async () => {
  const pending = {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "org",
    propertyId: "prop",
    kind: "IMAGE",
    status: "PENDING",
    declaredContentType: "image/png",
    declaredFileName: "trick.png",
    declaredByteSize: 10_000,
    storageKey: "et1_seed",
    uploadedBy: "u1",
    intentExpiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { controller, storage, signer } = controllerHarness("OWNER", {
    async findAsset() {
      return pending;
    },
  });
  const grant = signer.sign({
    mediaId: pending.id,
    organizationId: "org",
    propertyId: "prop",
    userId: "u1",
    kind: "IMAGE",
    contentType: "image/png",
    maxBytes: 10_000,
    expiresAtEpochSeconds: Math.floor(pending.intentExpiresAt.getTime() / 1000),
  });
  await storage.putDirect(
    "et1_seed",
    new Uint8Array([0x47, 0x49, 0x46, 0x38]),
    "image/png",
  );
  await assert.rejects(
    () =>
      controller.confirmUpload(
        "org",
        "prop",
        pending.id,
        { token: grant.token },
        REQUEST,
      ),
    (error) =>
      error instanceof BadRequestException &&
      error.message === "UNKNOWN_FORMAT",
  );
});

test("EF-601 storage-sim authorizes by signed grant only and stores through the port", async () => {
  const signer = new MediaIntentSigner(
    Buffer.from("ef601-storage-sim-secret-000000000000", "utf8"),
  );
  const storage = new InMemoryFakeStorageAdapter(signer);
  const controller = new MediaStorageSimController(storage, signer);
  const grant = signer.sign({
    mediaId: "11111111-1111-4111-8111-111111111111",
    organizationId: "org",
    propertyId: "prop",
    userId: "u1",
    kind: "IMAGE",
    contentType: "image/png",
    maxBytes: 10_000,
    expiresAtEpochSeconds: Math.floor(Date.now() / 1000) + 60,
  });
  const key = opaqueStorageKey("11111111-1111-4111-8111-111111111111", "");

  const stream = new PassThrough();
  const request = Object.assign(stream, {
    auth: { userId: "u1", verified: true },
    headers: { "content-type": "image/png" },
  });
  stream.end(Buffer.from(validPng(64, 64)));
  await controller.putObject(
    "org",
    "prop",
    key,
    { token: grant.token },
    request,
  );
  assert.equal(storage.storedKeys().length, 1);

  // Wrong property binding is rejected.
  const stream2 = new PassThrough();
  const request2 = Object.assign(stream2, {
    auth: { userId: "u1", verified: true },
    headers: { "content-type": "image/png" },
  });
  stream2.end(Buffer.from(validPng(64, 64)));
  await assert.rejects(
    () =>
      controller.putObject(
        "org",
        "other-property",
        key,
        { token: grant.token },
        request2,
      ),
    (error) =>
      error instanceof BadRequestException &&
      error.message === "INTENT_BINDING_MISMATCH",
  );

  // Wrong content type is rejected.
  const stream3 = new PassThrough();
  const request3 = Object.assign(stream3, {
    auth: { userId: "u1", verified: true },
    headers: { "content-type": "text/html" },
  });
  stream3.end(Buffer.from("<html></html>"));
  await assert.rejects(
    () =>
      controller.putObject(
        "org",
        "prop",
        key,
        { token: grant.token },
        request3,
      ),
    (error) =>
      error instanceof BadRequestException &&
      error.message === "INTENT_BINDING_MISMATCH",
  );

  // Expired grant is rejected.
  const expired = signer.sign({
    mediaId: "11111111-1111-4111-8111-111111111111",
    organizationId: "org",
    propertyId: "prop",
    userId: "u1",
    kind: "IMAGE",
    contentType: "image/png",
    maxBytes: 10_000,
    expiresAtEpochSeconds: Math.floor(Date.now() / 1000) - 5,
  });
  const stream4 = new PassThrough();
  const request4 = Object.assign(stream4, {
    auth: { userId: "u1", verified: true },
    headers: { "content-type": "image/png" },
  });
  stream4.end(Buffer.from(validPng(64, 64)));
  await assert.rejects(
    () =>
      controller.putObject(
        "org",
        "prop",
        key,
        { token: expired.token },
        request4,
      ),
    (error) =>
      error instanceof BadRequestException &&
      error.message === "INTENT_EXPIRED",
  );
});

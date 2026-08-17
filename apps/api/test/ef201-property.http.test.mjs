import assert from "node:assert/strict";
import test from "node:test";
import {
  BadRequestException,
  ParseUUIDPipe,
  RequestMethod,
  ValidationPipe,
} from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from "@nestjs/common/constants.js";
import { AppModule } from "../dist/app.module.js";
import { BrowserSessionGuard } from "../dist/features/auth/http/browser-session.guard.js";
import { CsrfGuard } from "../dist/features/auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../dist/features/auth/http/origin.guard.js";
import { PropertiesModule } from "../dist/features/properties/properties.module.js";
import {
  CreatePropertyDto,
  ImageMetadataDto,
  PropertyListQueryDto,
  UpdatePropertyDto,
} from "../dist/features/properties/http/property.dto.js";
import { PropertyController } from "../dist/features/properties/http/property.controller.js";

const unsafe = [RequireCanonicalOriginGuard, BrowserSessionGuard, CsrfGuard];
const route = (method) => [
  Reflect.getMetadata(PATH_METADATA, PropertyController.prototype[method]),
  Reflect.getMetadata(METHOD_METADATA, PropertyController.prototype[method]),
];
async function validate(dto, value, type = "body") {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }).transform(value, { type, metatype: dto });
}

test("Nest bootstrap registers PropertiesModule", () => {
  assert.ok(
    Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule).includes(
      PropertiesModule,
    ),
  );
  assert.deepEqual(
    Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PropertiesModule),
    [PropertyController],
  );
});

test("all approved property/listing/image routes and guards are explicit", () => {
  assert.deepEqual(
    [
      "create",
      "update",
      "list",
      "find",
      "createListing",
      "publish",
      "archive",
      "getListing",
      "addImage",
      "listImages",
    ].map(route),
    [
      ["organizations/:organizationId/properties", RequestMethod.POST],
      [
        "organizations/:organizationId/properties/:propertyId",
        RequestMethod.PATCH,
      ],
      ["organizations/:organizationId/properties", RequestMethod.GET],
      [
        "organizations/:organizationId/properties/:propertyId",
        RequestMethod.GET,
      ],
      [
        "organizations/:organizationId/properties/:propertyId/listings",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/listings/:listingId/publish",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/listings/:listingId/archive",
        RequestMethod.POST,
      ],
      ["organizations/:organizationId/listings/:listingId", RequestMethod.GET],
      [
        "organizations/:organizationId/listings/:listingId/images",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/listings/:listingId/images",
        RequestMethod.GET,
      ],
    ],
  );
  for (const method of [
    "create",
    "update",
    "createListing",
    "publish",
    "archive",
    "addImage",
  ])
    assert.deepEqual(
      Reflect.getMetadata(
        GUARDS_METADATA,
        PropertyController.prototype[method],
      ),
      unsafe,
    );
  for (const method of ["list", "find", "getListing", "listImages"])
    assert.deepEqual(
      Reflect.getMetadata(
        GUARDS_METADATA,
        PropertyController.prototype[method],
      ),
      [BrowserSessionGuard],
    );
});

test("listImages calls the application and returns metadata", async () => {
  const organizationId = "22222222-2222-4222-8222-222222222222";
  const listingId = "33333333-3333-4333-8333-333333333333";
  const images = [
    {
      id: "44444444-4444-4444-8444-444444444444",
      listingId,
      mediaType: "JPEG",
      byteSize: 12,
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  const calls = [];
  const controller = new PropertyController(
    {
      listImageMetadata: async (input) => {
        calls.push(input);
        return images;
      },
    },
    {
      findMembership: async () => ({
        organizationId,
        role: "OWNER",
        status: "ACTIVE",
      }),
    },
  );
  const result = await controller.listImages(organizationId, listingId, {
    auth: { userId: "user-1", verified: true, platformRole: "NONE" },
  });
  assert.deepEqual(result, images);
  assert.equal(calls[0].organizationId, organizationId);
  assert.equal(calls[0].listingId, listingId);
  assert.equal(calls[0].actor.memberships[0].role, "OWNER");
});

test("route identifiers use ParseUUIDPipe before application invocation", () => {
  const routes = [
    ["update", 1],
    ["find", 1],
    ["createListing", 1],
    ["publish", 1],
    ["archive", 1],
    ["getListing", 1],
    ["addImage", 1],
    ["listImages", 1],
  ];
  for (const [method, index] of routes) {
    const routeArguments = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      PropertyController,
      method,
    );
    assert.ok(
      Object.values(routeArguments).some(({ pipes }) =>
        pipes.some((pipe) => pipe instanceof ParseUUIDPipe),
      ),
      method,
    );
    assert.equal(index, 1);
  }
});

test("DTOs enforce approved input and query bounds", async () => {
  const created = await validate(CreatePropertyDto, {
    title: "Villa",
    propertyType: "VILLA",
    addressText: "Street",
    ownerReference: null,
  });
  assert.equal(created.title, "Villa");
  await validate(UpdatePropertyDto, { version: 1, title: "Updated" });
  await validate(ImageMetadataDto, {
    mediaType: "PNG",
    byteSize: 1,
    position: 0,
  });
  await validate(
    PropertyListQueryDto,
    { search: "Villa", cursor: "opaque", limit: 50 },
    "query",
  );
  await assert.rejects(
    () => validate(PropertyListQueryDto, { limit: 0 }, "query"),
    BadRequestException,
  );
  await assert.rejects(
    () => validate(PropertyListQueryDto, { limit: 51 }, "query"),
    BadRequestException,
  );
  await assert.rejects(
    () => validate(PropertyListQueryDto, { search: "x".repeat(201) }, "query"),
    BadRequestException,
  );
  await assert.rejects(
    () =>
      validate(ImageMetadataDto, {
        mediaType: "GIF",
        byteSize: 1,
        position: 0,
      }),
    BadRequestException,
  );
});

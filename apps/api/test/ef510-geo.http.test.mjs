import assert from "node:assert/strict";
import {
  BadRequestException,
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
import { GeoSearchController } from "../dist/features/search/http/geo-search.controller.js";
import { GeoSearchQueryDto } from "../dist/features/search/http/geo-search.dto.js";

const route = (method) => [
  Reflect.getMetadata(PATH_METADATA, GeoSearchController.prototype[method]),
  Reflect.getMetadata(METHOD_METADATA, GeoSearchController.prototype[method]),
];
async function validate(value) {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }).transform(value, { type: "query", metatype: GeoSearchQueryDto });
}

test("geo search exposes guarded search and cluster routes with strict modes", async () => {
  assert.deepEqual(route("searchProperties"), [
    "organizations/:organizationId/search/properties",
    RequestMethod.GET,
  ]);
  assert.deepEqual(route("clusters"), [
    "organizations/:organizationId/search/properties/clusters",
    RequestMethod.GET,
  ]);
  assert.deepEqual(
    Reflect.getMetadata(
      GUARDS_METADATA,
      GeoSearchController.prototype.searchProperties,
    ),
    [BrowserSessionGuard],
  );
  const query = await validate({
    mode: "radius",
    centerLat: "30",
    centerLng: "31",
    radiusKm: "5",
    limit: "25",
  });
  assert.equal(query.centerLat, 30);
  assert.equal(query.limit, 25);
  await assert.rejects(
    () => validate({ mode: "radius", centerLat: "91", centerLng: "31" }),
    BadRequestException,
  );
  await assert.rejects(
    () => validate({ mode: "hex", centerLat: "30", centerLng: "31" }),
    BadRequestException,
  );
});

test("geo controller rejects malformed JSON before repository invocation", async () => {
  const controller = new GeoSearchController(
    { search: async () => ({ items: [], nextCursor: null }) },
    {
      findMembership: async () => ({
        organizationId: "org",
        role: "BROKER",
        status: "ACTIVE",
      }),
    },
  );
  await assert.rejects(
    controller.searchProperties(
      "org",
      { mode: "polygon", polygon: "not-json" },
      { auth: { userId: "user", verified: true } },
    ),
    BadRequestException,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, RequestMethod, ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA, MODULE_METADATA } from "@nestjs/common/constants.js";
import { LeadApplication } from "../dist/features/leads/application/lead-application.js";
import { AppModule } from "../dist/app.module.js";
import { BrowserSessionGuard } from "../dist/features/auth/http/browser-session.guard.js";
import { CsrfGuard } from "../dist/features/auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../dist/features/auth/http/origin.guard.js";
import { LeadsModule } from "../dist/features/leads/leads.module.js";
import { CreateLeadDto, TransitionLeadDto } from "../dist/features/leads/http/lead.dto.js";
import { LeadController } from "../dist/features/leads/http/lead.controller.js";

const actor = { userId: "user-1", verified: true, csrfHash: "csrf" };
const unsafe = [RequireCanonicalOriginGuard, BrowserSessionGuard, CsrfGuard];
function controller(overrides = {}) {
  const commands = new Proxy({}, { get: (_, name) => overrides[name] ?? (async () => ({ id: "lead-1", version: 1 })) });
  return new LeadController(commands);
}

async function validate(dto, value) {
  return new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }).transform(value, { type: "body", metatype: dto });
}

test("Nest bootstrap registers LeadsModule and its controller", () => {
  assert.ok(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule).includes(LeadsModule));
  assert.deepEqual(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, LeadsModule), [LeadController]);
});

test("lead routes expose protected explicit commands and required mutation header plumbing", async () => {
  assert.deepEqual(["create", "find", "transition", "assign", "nextAction"].map(method => [Reflect.getMetadata(PATH_METADATA, LeadController.prototype[method]), Reflect.getMetadata(METHOD_METADATA, LeadController.prototype[method])]), [
    ["organizations/:organizationId/leads", RequestMethod.POST], ["organizations/:organizationId/leads/:leadId", RequestMethod.GET], ["organizations/:organizationId/leads/:leadId/transition", RequestMethod.POST], ["organizations/:organizationId/leads/:leadId/assign", RequestMethod.POST], ["organizations/:organizationId/leads/:leadId/next-action", RequestMethod.POST],
  ]);
  for (const method of ["create", "transition", "assign", "nextAction"]) assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, LeadController.prototype[method]), unsafe);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, LeadController.prototype.find), [BrowserSessionGuard]);

  const calls = [];
  const c = controller({ create: async input => { calls.push(input); return { ok: true }; } });
  await c.create("org-1", { id: "lead-1", ownerId: "owner-1", nextAction: "Call", source: "WEB" }, undefined, { auth: actor });
  assert.equal(calls[0].idempotencyKey, "");
  const missingHeader = await new LeadApplication({ createLead: async () => ({}) }, { findMembership: async () => ({ organizationId: "org-1", role: "OWNER", status: "ACTIVE" }) }).create({ actor, userId: "user-1", organizationId: "org-1", lead: { id: "lead-1", ownerId: "owner-1", nextAction: "Call", source: "WEB" }, idempotencyKey: "" });
  assert.deepEqual(missingHeader, { kind: "invalid-idempotency-key" });
});

test("nested UTM DTO validates supported bounded fields and rejects unknown data", async () => {
  const dto = await validate(CreateLeadDto, { id: "lead-1", ownerId: "owner-1", nextAction: "Call", source: "WEB", utm: { source: "google", campaign: "summer" } });
  assert.equal(dto.utm.source, "google");
  await assert.rejects(() => validate(CreateLeadDto, { id: "lead-1", ownerId: "owner-1", nextAction: "Call", source: "WEB", utm: { arbitrary: "x" } }), BadRequestException);
  await assert.rejects(() => validate(CreateLeadDto, { id: "lead-1", ownerId: "owner-1", nextAction: "Call", source: "WEB", utm: { campaign: "x".repeat(256) } }), BadRequestException);
});

test("application denies unverified, missing-principal, missing, inactive and disallowed memberships before repository access", async () => {
  let repositoryCalls = 0;
  const application = new LeadApplication({ async findLead() { repositoryCalls += 1; throw new Error("must not read lead"); } }, { async findMembership() { return null; } });
  const input = { organizationId: "org-1", leadId: "lead-1" };
  for (const [denied, expected] of [
    [{ actor: { verified: false }, userId: "user-1" }, "access-denied"],
    [{ actor: { verified: true }, userId: "" }, "access-denied"],
    [{ actor: { verified: true }, userId: "user-1" }, "ownership-conflict"],
  ]) assert.deepEqual(await application.find({ ...input, ...denied }), { kind: expected });
  for (const membership of [{ organizationId: "org-1", role: "CLIENT", status: "ACTIVE" }, { organizationId: "org-1", role: "BROKER", status: "SUSPENDED" }]) {
    const deniedApplication = new LeadApplication({ async findLead() { repositoryCalls += 1; } }, { async findMembership() { return membership; } });
    assert.deepEqual(await deniedApplication.find({ ...input, actor, userId: "user-1" }), { kind: "access-denied" });
  }
  assert.equal(repositoryCalls, 0);
});

test("controller maps denial and conflicts safely", async () => {
  for (const [kind, exception] of [["access-denied", ForbiddenException], ["ownership-conflict", NotFoundException], ["stale-version-conflict", ConflictException], ["idempotency-conflict", ConflictException]]) {
    const c = controller({ find: async () => ({ kind }), transition: async () => ({ kind }) });
    const operation = kind === "access-denied" || kind === "ownership-conflict" ? c.find("org-1", "lead-1", { auth: actor }) : c.transition("org-1", "lead-1", { to: "CONTACTED", expectedVersion: 1 }, "key", { auth: actor });
    await assert.rejects(operation, exception);
  }
});

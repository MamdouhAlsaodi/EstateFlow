import assert from "node:assert/strict";
import test from "node:test";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  RequestMethod,
  ValidationPipe,
} from "@nestjs/common";
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  MODULE_METADATA,
} from "@nestjs/common/constants.js";
import { LeadApplication } from "../dist/features/leads/application/lead-application.js";
import { AppModule } from "../dist/app.module.js";
import { BrowserSessionGuard } from "../dist/features/auth/http/browser-session.guard.js";
import { CsrfGuard } from "../dist/features/auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../dist/features/auth/http/origin.guard.js";
import { LeadsModule } from "../dist/features/leads/leads.module.js";
import {
  CreateLeadDto,
  CreateLeadNoteDto,
  CreateLeadTaskDto,
  CompleteLeadTaskDto,
  RescheduleLeadTaskDto,
  LeadDetailQueryDto,
  LeadListQueryDto,
  CloseWonDto,
  CloseLostDto,
} from "../dist/features/leads/http/lead.dto.js";
import { LeadController } from "../dist/features/leads/http/lead.controller.js";

const actor = { userId: "user-1", verified: true, csrfHash: "csrf" };
const unsafe = [RequireCanonicalOriginGuard, BrowserSessionGuard, CsrfGuard];
function controller(overrides = {}) {
  const commands = new Proxy(
    {},
    {
      get: (_, name) =>
        overrides[name] ?? (async () => ({ id: "lead-1", version: 1 })),
    },
  );
  return new LeadController(commands);
}

async function validate(dto, value) {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }).transform(value, { type: "body", metatype: dto });
}

test("Nest bootstrap registers LeadsModule and its controller", () => {
  assert.ok(
    Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule).includes(
      LeadsModule,
    ),
  );
  assert.deepEqual(
    Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, LeadsModule),
    [LeadController],
  );
});

test("lead routes expose protected explicit commands and required mutation header plumbing", async () => {
  assert.deepEqual(
    ["create", "find", "transition", "assign", "nextAction"].map((method) => [
      Reflect.getMetadata(PATH_METADATA, LeadController.prototype[method]),
      Reflect.getMetadata(METHOD_METADATA, LeadController.prototype[method]),
    ]),
    [
      ["organizations/:organizationId/leads", RequestMethod.POST],
      ["organizations/:organizationId/leads/:leadId", RequestMethod.GET],
      [
        "organizations/:organizationId/leads/:leadId/transition",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/leads/:leadId/assign",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/leads/:leadId/next-action",
        RequestMethod.POST,
      ],
    ],
  );
  for (const method of ["create", "transition", "assign", "nextAction"])
    assert.deepEqual(
      Reflect.getMetadata(GUARDS_METADATA, LeadController.prototype[method]),
      unsafe,
    );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, LeadController.prototype.find),
    [BrowserSessionGuard],
  );

  const calls = [];
  const c = controller({
    create: async (input) => {
      calls.push(input);
      return { ok: true };
    },
  });
  await c.create(
    "org-1",
    { id: "lead-1", ownerId: "owner-1", nextAction: "Call", source: "WEB" },
    undefined,
    { auth: actor },
  );
  assert.equal(calls[0].idempotencyKey, "");
  const missingHeader = await new LeadApplication(
    { createLead: async () => ({}) },
    {
      findMembership: async () => ({
        organizationId: "org-1",
        role: "OWNER",
        status: "ACTIVE",
      }),
    },
  ).create({
    actor,
    userId: "user-1",
    organizationId: "org-1",
    lead: {
      id: "lead-1",
      ownerId: "owner-1",
      nextAction: "Call",
      source: "WEB",
    },
    idempotencyKey: "",
  });
  assert.deepEqual(missingHeader, { kind: "invalid-idempotency-key" });
});

test("lead detail route is protected, explicit, and validates timeline query input", async () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, LeadController.prototype.find),
    "organizations/:organizationId/leads/:leadId",
  );
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, LeadController.prototype.find),
    RequestMethod.GET,
  );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, LeadController.prototype.find),
    [BrowserSessionGuard],
  );
  const calls = [];
  const response = {
    lead: { id: "lead-1" },
    timeline: { items: [], nextCursor: null },
    notes: [
      {
        id: "note-1",
        body: "Private note",
        createdAt: new Date("2026-08-04T10:00:00.000Z"),
      },
    ],
    tasks: [
      {
        id: "task-1",
        title: "Call",
        dueAt: new Date("2026-08-05T10:00:00.000Z"),
        status: "OPEN",
        createdAt: new Date("2026-08-04T10:00:00.000Z"),
        completedAt: null,
        version: 1,
      },
    ],
  };
  const c = controller({
    findDetail: async (input) => {
      calls.push(input);
      return response;
    },
  });
  const result = await c.find(
    "org-1",
    "lead-1",
    { cursor: "event-1", limit: 10 },
    { auth: actor },
  );
  assert.deepEqual(result, response);
  assert.deepEqual(calls[0], {
    actor,
    userId: "user-1",
    organizationId: "org-1",
    leadId: "lead-1",
    cursor: "event-1",
    limit: 10,
  });
  await assert.rejects(
    () => validate(LeadDetailQueryDto, { limit: 0 }),
    BadRequestException,
  );
  await assert.rejects(
    () => validate(LeadDetailQueryDto, { limit: 101 }),
    BadRequestException,
  );
  await assert.rejects(
    () => validate(LeadDetailQueryDto, { cursor: "" }),
    BadRequestException,
  );
  await assert.rejects(
    () => validate(LeadDetailQueryDto, { stage: "NEW" }),
    BadRequestException,
  );
});

test("lead board list route uses BrowserSessionGuard and validates bounded query input", async () => {
  assert.deepEqual(
    Reflect.getMetadata(PATH_METADATA, LeadController.prototype.list),
    "organizations/:organizationId/leads",
  );
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, LeadController.prototype.list),
    RequestMethod.GET,
  );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, LeadController.prototype.list),
    [BrowserSessionGuard],
  );
  const calls = [];
  const c = controller({
    list: async (input) => {
      calls.push(input);
      return { items: [], nextCursor: null };
    },
  });
  const result = await c.list(
    "org-1",
    { stage: "QUALIFIED", cursor: "lead-1", limit: 25 },
    { auth: actor },
  );
  assert.deepEqual(result, { items: [], nextCursor: null });
  assert.deepEqual(calls[0], {
    actor,
    userId: "user-1",
    organizationId: "org-1",
    stage: "QUALIFIED",
    cursor: "lead-1",
    limit: 25,
  });
  await assert.rejects(
    () => validate(LeadListQueryDto, { stage: "INVALID" }),
    BadRequestException,
  );
  await assert.rejects(
    () => validate(LeadListQueryDto, { limit: 0 }),
    BadRequestException,
  );
  await assert.rejects(
    () => validate(LeadListQueryDto, { limit: 101 }),
    BadRequestException,
  );
  await assert.rejects(
    () => validate(LeadListQueryDto, { cursor: "" }),
    BadRequestException,
  );
});

test("application denies lead board list before repository access", async () => {
  let calls = 0;
  const application = new LeadApplication(
    {
      async listLeads() {
        calls += 1;
        throw new Error("must not query leads");
      },
    },
    {
      async findMembership() {
        return { organizationId: "org-1", role: "CLIENT", status: "ACTIVE" };
      },
    },
  );
  assert.deepEqual(
    await application.list({
      actor,
      userId: "user-1",
      organizationId: "org-1",
    }),
    { kind: "access-denied" },
  );
  assert.equal(calls, 0);
});

test("nested UTM DTO validates supported bounded fields and rejects unknown data", async () => {
  const dto = await validate(CreateLeadDto, {
    id: "lead-1",
    ownerId: "owner-1",
    nextAction: "Call",
    source: "WEB",
    utm: { source: "google", campaign: "summer" },
  });
  assert.equal(dto.utm.source, "google");
  await assert.rejects(
    () =>
      validate(CreateLeadDto, {
        id: "lead-1",
        ownerId: "owner-1",
        nextAction: "Call",
        source: "WEB",
        utm: { arbitrary: "x" },
      }),
    BadRequestException,
  );
  await assert.rejects(
    () =>
      validate(CreateLeadDto, {
        id: "lead-1",
        ownerId: "owner-1",
        nextAction: "Call",
        source: "WEB",
        utm: { campaign: "x".repeat(256) },
      }),
    BadRequestException,
  );
});

test("application denies unverified, missing-principal, missing, inactive and disallowed memberships before repository access", async () => {
  let repositoryCalls = 0;
  const application = new LeadApplication(
    {
      async findLead() {
        repositoryCalls += 1;
        throw new Error("must not read lead");
      },
    },
    {
      async findMembership() {
        return null;
      },
    },
  );
  const input = { organizationId: "org-1", leadId: "lead-1" };
  for (const [denied, expected] of [
    [{ actor: { verified: false }, userId: "user-1" }, "access-denied"],
    [{ actor: { verified: true }, userId: "" }, "access-denied"],
    [{ actor: { verified: true }, userId: "user-1" }, "ownership-conflict"],
  ])
    assert.deepEqual(await application.find({ ...input, ...denied }), {
      kind: expected,
    });
  for (const membership of [
    { organizationId: "org-1", role: "CLIENT", status: "ACTIVE" },
    { organizationId: "org-1", role: "BROKER", status: "SUSPENDED" },
  ]) {
    const deniedApplication = new LeadApplication(
      {
        async findLead() {
          repositoryCalls += 1;
        },
      },
      {
        async findMembership() {
          return membership;
        },
      },
    );
    assert.deepEqual(
      await deniedApplication.find({ ...input, actor, userId: "user-1" }),
      { kind: "access-denied" },
    );
  }
  assert.equal(repositoryCalls, 0);
});

test("CRM-04 exposes guarded note/task routes and closed DTOs", async () => {
  const route = (method) => [
    Reflect.getMetadata(PATH_METADATA, LeadController.prototype[method]),
    Reflect.getMetadata(METHOD_METADATA, LeadController.prototype[method]),
  ];
  assert.deepEqual(
    ["createNote", "createTask", "completeTask", "rescheduleTask"].map(route),
    [
      ["organizations/:organizationId/leads/:leadId/notes", RequestMethod.POST],
      ["organizations/:organizationId/leads/:leadId/tasks", RequestMethod.POST],
      [
        "organizations/:organizationId/leads/:leadId/tasks/:taskId/complete",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/leads/:leadId/tasks/:taskId/reschedule",
        RequestMethod.POST,
      ],
    ],
  );
  assert.deepEqual(
    ["createNote", "createTask", "completeTask", "rescheduleTask"].map(
      (method) =>
        Reflect.getMetadata(
          HTTP_CODE_METADATA,
          LeadController.prototype[method],
        ),
    ),
    [201, 201, 200, 200],
  );
  for (const method of [
    "createNote",
    "createTask",
    "completeTask",
    "rescheduleTask",
  ])
    assert.deepEqual(
      Reflect.getMetadata(GUARDS_METADATA, LeadController.prototype[method]),
      unsafe,
    );
  const calls = [];
  const c = controller({
    createNote: async (input) => {
      calls.push(input);
      return { ok: true };
    },
    createTask: async (input) => {
      calls.push(input);
      return { ok: true };
    },
    completeTask: async (input) => {
      calls.push(input);
      return { ok: true };
    },
    rescheduleTask: async (input) => {
      calls.push(input);
      return { ok: true };
    },
  });
  await c.createNote("org-1", "lead-1", { body: "hello" }, "note-key", {
    auth: actor,
  });
  await c.createTask(
    "org-1",
    "lead-1",
    { title: "Call", dueAt: "2026-01-02T03:04:05.000Z" },
    "task-key",
    { auth: actor },
  );
  await c.completeTask(
    "org-1",
    "lead-1",
    "task-1",
    { expectedVersion: 1 },
    "complete-key",
    { auth: actor },
  );
  await c.rescheduleTask(
    "org-1",
    "lead-1",
    "task-1",
    { dueAt: "2026-01-03T03:04:05.000Z", expectedVersion: 1 },
    "reschedule-key",
    { auth: actor },
  );
  assert.equal(calls[1].dueAt instanceof Date, true);
  assert.equal(calls[3].dueAt instanceof Date, true);
  for (const [dto, value] of [
    [CreateLeadNoteDto, { body: " " }],
    [CreateLeadNoteDto, { body: "x".repeat(2001) }],
    [CreateLeadNoteDto, { body: "ok", id: "forbidden" }],
    [CreateLeadTaskDto, { title: "ok", dueAt: "not-a-date" }],
    [CreateLeadTaskDto, { title: "ok", dueAt: "2026-01-02T03:04:05" }],
    [
      CreateLeadTaskDto,
      { title: "ok", dueAt: "2026-01-02T03:04:05Z", status: "OPEN" },
    ],
    [CompleteLeadTaskDto, { expectedVersion: 0 }],
    [CompleteLeadTaskDto, { expectedVersion: 1, taskId: "forbidden" }],
    [
      RescheduleLeadTaskDto,
      { dueAt: "2026-01-02T03:04:05Z", expectedVersion: 1, version: 1 },
    ],
  ])
    await assert.rejects(() => validate(dto, value), BadRequestException);
  await assert.rejects(
    () => validate(CreateLeadNoteDto, { body: "ok", createdAt: "x" }),
    BadRequestException,
  );
  const task = await validate(CreateLeadTaskDto, {
    title: "ok",
    dueAt: "2026-01-02T03:04:05Z",
  });
  assert.equal(typeof task.dueAt, "string");
});

test("CRM-04 maps child command outcomes without persistence leakage", async () => {
  for (const [kind, exception] of [
    ["access-denied", ForbiddenException],
    ["ownership-conflict", NotFoundException],
    ["invalid-idempotency-key", BadRequestException],
    ["stale-version-conflict", ConflictException],
    ["idempotency-conflict", ConflictException],
  ]) {
    const c = controller({
      createNote: async () => ({ kind }),
      completeTask: async () => ({ kind }),
    });
    const operation =
      kind === "stale-version-conflict" || kind === "idempotency-conflict"
        ? c.completeTask(
            "org-1",
            "lead-1",
            "task-1",
            { expectedVersion: 1 },
            "key",
            { auth: actor },
          )
        : c.createNote("org-1", "lead-1", { body: "x" }, "key", {
            auth: actor,
          });
    await assert.rejects(operation, exception);
  }
});

test("EF-203 close routes expose the guarded HTTP boundary and strict DTOs", async () => {
  const route = (method) => [
    Reflect.getMetadata(PATH_METADATA, LeadController.prototype[method]),
    Reflect.getMetadata(METHOD_METADATA, LeadController.prototype[method]),
  ];
  assert.deepEqual(route("closeWon"), [
    "organizations/:organizationId/leads/:leadId/close-won",
    RequestMethod.POST,
  ]);
  assert.deepEqual(route("closeLost"), [
    "organizations/:organizationId/leads/:leadId/close-lost",
    RequestMethod.POST,
  ]);
  assert.equal(
    Reflect.getMetadata(HTTP_CODE_METADATA, LeadController.prototype.closeWon),
    201,
  );
  assert.equal(
    Reflect.getMetadata(HTTP_CODE_METADATA, LeadController.prototype.closeLost),
    200,
  );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, LeadController.prototype.closeWon),
    unsafe,
  );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, LeadController.prototype.closeLost),
    unsafe,
  );

  const calls = [];
  const c = controller({
    closeWon: async (input) => {
      calls.push(input);
      return { ok: true };
    },
    closeLost: async (input) => {
      calls.push(input);
      return { ok: true };
    },
  });
  await c.closeWon(
    "org-1",
    "lead-1",
    {
      propertyId: "11111111-1111-4111-8111-111111111111",
      brokerId: "22222222-2222-4222-8222-222222222222",
      expectedVersion: 1,
    },
    undefined,
    { auth: actor },
  );
  await c.closeLost(
    "org-1",
    "lead-2",
    { reason: "  No budget  ", expectedVersion: 1 },
    "lost-key",
    { auth: actor },
  );
  assert.deepEqual(calls[0], {
    actor,
    userId: "user-1",
    organizationId: "org-1",
    leadId: "lead-1",
    propertyId: "11111111-1111-4111-8111-111111111111",
    brokerId: "22222222-2222-4222-8222-222222222222",
    expectedVersion: 1,
    idempotencyKey: "",
  });
  assert.equal(calls[1].idempotencyKey, "lost-key");
  for (const [dto, value] of [
    [
      CloseWonDto,
      {
        propertyId: "not-uuid",
        brokerId: "22222222-2222-4222-8222-222222222222",
        expectedVersion: 1,
      },
    ],
    [
      CloseWonDto,
      {
        propertyId: "11111111-1111-4111-8111-111111111111",
        brokerId: "22222222-2222-4222-8222-222222222222",
        expectedVersion: 1,
        dealId: "forbidden",
      },
    ],
    [CloseLostDto, { reason: "   ", expectedVersion: 1 }],
    [CloseLostDto, { reason: "\t\n", expectedVersion: 1 }],
    [CloseLostDto, { reason: "ok", expectedVersion: 1, actor: "forbidden" }],
  ])
    await assert.rejects(() => validate(dto, value), BadRequestException);
  for (const [kind, exception] of [
    ["access-denied", ForbiddenException],
    ["ownership-conflict", NotFoundException],
    ["invalid-idempotency-key", BadRequestException],
    ["stale-version-conflict", ConflictException],
    ["idempotency-conflict", ConflictException],
  ]) {
    const method =
      kind === "access-denied" || kind === "ownership-conflict"
        ? "closeLost"
        : "closeWon";
    const deniedController = controller({ [method]: async () => ({ kind }) });
    const operation =
      method === "closeLost"
        ? deniedController.closeLost(
            "org-1",
            "lead-1",
            { reason: "x", expectedVersion: 1 },
            "key",
            { auth: actor },
          )
        : deniedController.closeWon(
            "org-1",
            "lead-1",
            {
              propertyId: "11111111-1111-4111-8111-111111111111",
              brokerId: "22222222-2222-4222-8222-222222222222",
              expectedVersion: 1,
            },
            "key",
            { auth: actor },
          );
    await assert.rejects(operation, exception);
  }
});

test("controller maps denial and conflicts safely", async () => {
  for (const [kind, exception] of [
    ["access-denied", ForbiddenException],
    ["ownership-conflict", NotFoundException],
    ["stale-version-conflict", ConflictException],
    ["idempotency-conflict", ConflictException],
  ]) {
    const c = controller({
      findDetail: async () => ({ kind }),
      transition: async () => ({ kind }),
    });
    const operation =
      kind === "access-denied" || kind === "ownership-conflict"
        ? c.find("org-1", "lead-1", {}, { auth: actor })
        : c.transition(
            "org-1",
            "lead-1",
            { to: "CONTACTED", expectedVersion: 1 },
            "key",
            { auth: actor },
          );
    await assert.rejects(operation, exception);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { PrismaLeadRepository } from "../dist/features/leads/infrastructure/prisma-lead.repository.js";

test("PrismaLeadRepository exposes the T1 repository behavior", () => {
  assert.equal(typeof PrismaLeadRepository, "function");
});

test("listLeads applies organization, stable cursor ordering, stage filter and bounded page", async () => {
  const calls = [];
  const rows = [
    { id: "lead-1", organizationId: "org-1", ownerId: "user-1", stage: "QUALIFIED", nextAction: "Call", source: "WEB", utm: null, version: 1, createdAt: new Date("2026-08-04T12:00:00.000Z"), updatedAt: new Date("2026-08-04T12:00:00.000Z") },
    { id: "lead-2", organizationId: "org-1", ownerId: "user-2", stage: "QUALIFIED", nextAction: "Email", source: "REFERRAL", utm: null, version: 1, createdAt: new Date("2026-08-04T12:01:00.000Z"), updatedAt: new Date("2026-08-04T12:01:00.000Z") },
  ];
  const repository = new PrismaLeadRepository({ lead: { async findMany(args) { calls.push(args); return rows; } } });
  const page = await repository.listLeads("org-1", { stage: "QUALIFIED", cursor: "lead-0", limit: 1 });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].id, "lead-1");
  assert.equal(page.nextCursor, "lead-1");
  assert.deepEqual(calls[0], { where: { organizationId: "org-1", stage: "QUALIFIED" }, orderBy: { id: "asc" }, cursor: { id: "lead-0" }, skip: 1, take: 2 });
});

test("listLeads returns an empty page without a cursor", async () => {
  const repository = new PrismaLeadRepository({ lead: { async findMany(args) { assert.deepEqual(args.where, { organizationId: "org-1" }); return []; } } });
  assert.deepEqual(await repository.listLeads("org-1", {}), { items: [], nextCursor: null });
});

test("listLeads rejects invalid stage, cursor and limit safely", async () => {
  const repository = new PrismaLeadRepository({ lead: { async findMany() { throw new Error("must not query"); } } });
  for (const input of [{ stage: "INVALID" }, { cursor: "" }, { cursor: "x".repeat(256) }, { limit: 0 }, { limit: 101 }, { limit: 1.5 }]) {
    await assert.rejects(() => repository.listLeads("org-1", input), /Invalid lead list query/);
  }
});

test("findLead always applies the organization boundary", async () => {
  const calls = [];
  const row = {
    id: "lead-1",
    organizationId: "org-1",
    ownerId: "user-1",
    stage: "NEW",
    nextAction: "Call",
    source: "WEBSITE",
    utm: null,
    version: 1,
    createdAt: new Date("2026-08-04T12:00:00.000Z"),
    updatedAt: new Date("2026-08-04T12:00:00.000Z"),
  };
  const repository = new PrismaLeadRepository({
    lead: {
      async findFirst(args) {
        calls.push(args);
        return args.where.organizationId === "org-1" ? row : null;
      },
    },
  });
  assert.equal(
    (await repository.findLead("org-1", "lead-1")).organizationId,
    "org-1",
  );
  assert.equal(await repository.findLead("org-2", "lead-1"), null);
  assert.deepEqual(
    calls.map(({ where }) => where),
    [
      { organizationId: "org-1", id: "lead-1" },
      { organizationId: "org-2", id: "lead-1" },
    ],
  );
});

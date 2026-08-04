import test from "node:test";
import assert from "node:assert/strict";
import { PrismaLeadRepository } from "../dist/features/leads/infrastructure/prisma-lead.repository.js";

test("PrismaLeadRepository exposes the T1 repository behavior", () => {
  assert.equal(typeof PrismaLeadRepository, "function");
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

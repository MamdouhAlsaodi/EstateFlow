import assert from "node:assert/strict";
import test from "node:test";
import { ViewingApplication } from "../dist/features/viewings/application/viewing-application.js";
import {
  createViewing,
  nextViewingState,
  ViewingTransitionError,
} from "../dist/features/viewings/domain/viewing.js";

const org = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const broker = "33333333-3333-4333-8333-333333333333";
const lead = "44444444-4444-4444-8444-444444444444";
const property = "55555555-5555-4555-8555-555555555555";
const now = new Date("2026-11-01T10:00:00.000Z");

function membership(role, userId = owner, organizationId = org) {
  return { organizationId, userId, role, status: "ACTIVE" };
}
function repo() {
  const viewing = createViewing({
    id: "66666666-6666-4666-8666-666666666666",
    organizationId: org,
    leadId: lead,
    propertyId: property,
    brokerId: broker,
    requestedByUserId: broker,
    startAt: new Date("2026-11-02T09:00:00.000Z"),
    endAt: new Date("2026-11-02T10:00:00.000Z"),
    createdAt: now,
  });
  return {
    viewing,
    async findViewing(organizationId, viewingId) {
      return organizationId === org && viewingId === viewing.id
        ? { viewing, transitions: [] }
        : null;
    },
    async listViewings() {
      return { items: [viewing], nextCursor: null };
    },
    async createViewing() {
      return { viewing, transitions: [] };
    },
    async confirmViewing() {
      return { viewing: { ...viewing, status: "CONFIRMED" }, transitions: [] };
    },
    async rescheduleViewing() {
      return { viewing, transitions: [] };
    },
    async transitionViewing() {
      return { viewing, transitions: [] };
    },
    async getAvailability() {
      return { rules: [], exceptions: [] };
    },
    async addAvailabilityRule(input) {
      return input;
    },
    async addAvailabilityException(input) {
      return input;
    },
  };
}

test("EF-501 lifecycle rejects illegal transitions and keeps only CONFIRMED reserving", () => {
  assert.equal(nextViewingState("REQUESTED", "CONFIRMED"), "CONFIRMED");
  assert.equal(nextViewingState("CONFIRMED", "COMPLETED"), "COMPLETED");
  assert.throws(
    () => nextViewingState("REQUESTED", "COMPLETED"),
    ViewingTransitionError,
  );
  assert.throws(
    () => nextViewingState("CANCELLED", "CONFIRMED"),
    ViewingTransitionError,
  );
});

test("EF-501 viewing authority is tenant-safe and broker-scoped", async () => {
  const repository = repo();
  const memberships = {
    async findMembership(organizationId, userId) {
      return organizationId === org
        ? membership(userId === broker ? "BROKER" : "OWNER", userId)
        : null;
    },
  };
  const app = new ViewingApplication(repository, memberships);
  const denied = await app.confirm({
    actor: { verified: true },
    userId: broker,
    organizationId: org,
    viewingId: repository.viewing.id,
  });
  assert.equal(denied.viewing.status, "CONFIRMED");
  const foreign = await app.find({
    actor: { verified: true },
    userId: owner,
    organizationId: "77777777-7777-4777-8777-777777777777",
    viewingId: repository.viewing.id,
  });
  assert.deepEqual(foreign, { kind: "not-found" });
  const otherBroker = await app.request({
    actor: { verified: true },
    userId: broker,
    organizationId: org,
    viewingId: "88888888-8888-4888-8888-888888888888",
    leadId: lead,
    propertyId: property,
    brokerId: owner,
    startAt: now,
    endAt: new Date(now.getTime() + 3600000),
  });
  assert.deepEqual(otherBroker, { kind: "access-denied" });
});

import assert from "node:assert/strict";
import test from "node:test";
import { SecurityAuditService } from "../dist/features/auth/application/security-audit.js";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const REQUEST_CORRELATION_ID = "550e8400-e29b-41d4-a716-446655440000";
const SUBJECT_ID = "9a30f920-575f-4bdb-884c-227109705728";

class RecordingRepository {
  constructor() {
    this.auditEvents = [];
  }

  async createSecurityAuditEvent(event) {
    this.auditEvents.push(event);
  }
}

class RecordingClock {
  constructor(now) {
    this.nowValue = now;
    this.calls = 0;
  }

  now() {
    this.calls += 1;
    return new Date(this.nowValue);
  }
}

function context(requestCorrelationId = REQUEST_CORRELATION_ID) {
  return {
    clientSourceKeyHash: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
    requestCorrelationId,
  };
}

test("allowed audit persistence writes only the approved safe fields at one clock instant", async () => {
  const repository = new RecordingRepository();
  const clock = new RecordingClock(NOW);
  const service = new SecurityAuditService(repository, clock);

  await service.allowed("LOGIN_ALLOWED", context(), SUBJECT_ID);

  assert.equal(clock.calls, 1);
  assert.deepEqual(repository.auditEvents, [
    {
      subjectId: SUBJECT_ID,
      outcome: "ALLOWED",
      reason: "LOGIN_ALLOWED",
      requestCorrelationId: REQUEST_CORRELATION_ID,
      now: NOW,
    },
  ]);
  assert.deepEqual(Object.keys(repository.auditEvents[0]).sort(), [
    "now",
    "outcome",
    "reason",
    "requestCorrelationId",
    "subjectId",
  ]);
});

test("audit persistence rejects the unapproved SESSION_DENIED reason before repository writes", async () => {
  const repository = new RecordingRepository();
  const service = new SecurityAuditService(repository, new RecordingClock(NOW));

  await assert.rejects(
    () => service.denied("SESSION_DENIED", context()),
    /denied audit reason/,
  );

  assert.deepEqual(repository.auditEvents, []);
});

test("audit outcome methods reject reasons assigned to the opposite outcome", async () => {
  const repository = new RecordingRepository();
  const service = new SecurityAuditService(repository, new RecordingClock(NOW));

  await assert.rejects(
    () => service.allowed("LOGIN_DENIED", context()),
    /allowed audit reason/,
  );
  await assert.rejects(
    () => service.denied("LOGIN_ALLOWED", context()),
    /denied audit reason/,
  );
  assert.deepEqual(repository.auditEvents, []);
});

test("audit persistence rejects malformed UUIDs before repository writes", async () => {
  const repository = new RecordingRepository();
  const service = new SecurityAuditService(repository, new RecordingClock(NOW));

  for (const invalidInput of [
    [context("not-a-uuid"), SUBJECT_ID],
    [context("550E8400-E29B-41D4-A716-446655440000"), SUBJECT_ID],
    [context(), "not-a-uuid"],
  ]) {
    await assert.rejects(
      () =>
        service.allowed(
          "REGISTRATION_ACCEPTED",
          invalidInput[0],
          invalidInput[1],
        ),
      /canonical UUID/,
    );
  }
  assert.deepEqual(repository.auditEvents, []);
});

test("audit persistence propagates repository operational errors", async () => {
  const outage = new Error("database unavailable");
  const service = new SecurityAuditService(
    {
      createSecurityAuditEvent: async () => {
        throw outage;
      },
    },
    new RecordingClock(NOW),
  );

  await assert.rejects(
    () => service.denied("LOGIN_DENIED", context()),
    (error) => error === outage,
  );
});

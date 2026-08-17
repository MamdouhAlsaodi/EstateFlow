import test from "node:test";
import assert from "node:assert/strict";
import { LeadApplication } from "../dist/features/leads/application/lead-application.js";
import { createLead } from "../dist/features/leads/domain/lead.js";

const baseInputNow = new Date("2026-08-04T10:00:00.000Z");
const lead = createLead({
  id: "lead-1",
  organizationId: "org-1",
  ownerId: "owner-1",
  nextAction: "Call",
  source: "REFERRAL",
  now: baseInputNow,
});
const actor = { verified: true };
const userId = "user-1";
const activeAllowedMembershipReader = {
  async findMembership(organizationId, membershipUserId) {
    if (organizationId !== "org-1" || membershipUserId !== userId) return null;
    return { organizationId, role: "OWNER", status: "ACTIVE" };
  },
};

test("application returns a closed lead detail with a timeline page after authorization", async () => {
  const detail = {
    lead: {
      id: "lead-1",
      organizationId: "org-1",
      ownerId: "owner-1",
      stage: "NEW",
      nextAction: "Call",
      source: "WEB",
      utm: {},
      version: 1,
      createdAt: baseInputNow,
      updatedAt: baseInputNow,
    },
    timeline: {
      items: [
        {
          id: "event-1",
          type: "LEAD_CREATED",
          occurredAt: baseInputNow,
          data: { stage: "NEW" },
        },
      ],
      nextCursor: null,
    },
    notes: [{ id: "note-1", body: "Private note", createdAt: baseInputNow }],
    tasks: [
      {
        id: "task-1",
        title: "Call",
        dueAt: baseInputNow,
        status: "OPEN",
        createdAt: baseInputNow,
        completedAt: null,
        version: 1,
      },
    ],
  };
  const expected = { ...detail, lead: { ...detail.lead } };
  delete expected.lead.organizationId;
  let calls = 0;
  const repository = {
    async findLeadDetail(organizationId, leadId, criteria) {
      calls += 1;
      assert.deepEqual(
        { organizationId, leadId, criteria },
        {
          organizationId: "org-1",
          leadId: "lead-1",
          criteria: { cursor: "event-0", limit: 10 },
        },
      );
      return detail;
    },
  };
  const result = await new LeadApplication(
    repository,
    activeAllowedMembershipReader,
  ).findDetail({
    actor,
    userId,
    organizationId: "org-1",
    leadId: "lead-1",
    cursor: "event-0",
    limit: 10,
  });
  assert.deepEqual(result, expected);
  assert.equal(calls, 1);
});

test("application denies detail before repository access for a client", async () => {
  let calls = 0;
  const repository = {
    async findLeadDetail() {
      calls += 1;
      throw new Error("must not query lead detail");
    },
  };
  const memberships = {
    async findMembership() {
      return { organizationId: "org-1", role: "CLIENT", status: "ACTIVE" };
    },
  };
  assert.deepEqual(
    await new LeadApplication(repository, memberships).findDetail({
      actor,
      userId,
      organizationId: "org-1",
      leadId: "lead-1",
    }),
    { kind: "access-denied" },
  );
  assert.equal(calls, 0);
});

test("application create succeeds with an immutable create timeline intent", async () => {
  let command;
  const repository = {
    async createLead(input) {
      command = input;
      return {
        kind: "ok",
        lead: input.lead,
        timelineEvents: input.timelineEvents,
      };
    },
  };
  const result = await new LeadApplication(
    repository,
    activeAllowedMembershipReader,
  ).create({
    actor,
    userId,
    organizationId: "org-1",
    lead: {
      id: "lead-created",
      ownerId: "owner-1",
      nextAction: "Call",
      source: "WEBSITE",
    },
    idempotencyKey: "create-1",
    now: baseInputNow,
  });
  assert.equal(result.kind, "ok");
  assert.equal(command.timelineEvents[0].type, "LEAD_CREATED");
  assert.ok(Object.isFrozen(command.timelineEvents));
  assert.ok(Object.isFrozen(command.timelineEvents[0]));
  assert.ok(Object.isFrozen(command.timelineEvents[0].data));
});

test("unverified actor is denied before repository access", async () => {
  let calls = 0;
  const repository = {
    async createLead() {
      calls += 1;
      throw new Error("must not call repository");
    },
  };
  const result = await new LeadApplication(
    repository,
    activeAllowedMembershipReader,
  ).create({
    actor: { verified: false },
    userId,
    organizationId: "org-1",
    lead: {
      id: "lead-denied",
      ownerId: "owner-1",
      nextAction: "Call",
      source: "WEBSITE",
    },
    idempotencyKey: "denied-1",
  });
  assert.deepEqual(result, { kind: "access-denied" });
  assert.equal(calls, 0);
});

test("invalid or empty idempotency keys do not call the repository", async () => {
  let calls = 0;
  const repository = {
    async createLead() {
      calls += 1;
      throw new Error("must not call repository");
    },
  };
  const application = new LeadApplication(
    repository,
    activeAllowedMembershipReader,
  );
  for (const idempotencyKey of ["", "   ", "x".repeat(256)]) {
    const result = await application.create({
      actor,
      userId,
      organizationId: "org-1",
      lead: {
        id: "lead-invalid",
        ownerId: "owner-1",
        nextAction: "Call",
        source: "WEBSITE",
      },
      idempotencyKey,
    });
    assert.deepEqual(result, { kind: "invalid-idempotency-key" });
  }
  assert.equal(calls, 0);
});

test("application transition carries organization ownership, optimistic version and idempotency key", async () => {
  const calls = [];
  const repository = {
    async findLead(organizationId, leadId) {
      return organizationId === "org-1" && leadId === lead.id ? lead : null;
    },
    async updateLead(input) {
      calls.push(input);
      return {
        kind: "ok",
        lead: input.lead,
        timelineEvents: input.timelineEvents,
      };
    },
  };
  const result = await new LeadApplication(
    repository,
    activeAllowedMembershipReader,
  ).transition({
    actor,
    userId,
    organizationId: "org-1",
    leadId: lead.id,
    expectedVersion: 1,
    to: "CONTACTED",
    idempotencyKey: "idem-1",
    now: new Date("2026-08-04T11:00:00.000Z"),
  });
  assert.equal(result.kind, "ok");
  assert.equal(result.lead.stage, "CONTACTED");
  assert.equal(calls[0].organizationId, "org-1");
  assert.equal(calls[0].expectedVersion, 1);
  assert.equal(calls[0].idempotencyKey, "idem-1");
  assert.equal(calls[0].timelineEvents[0].type, "LEAD_STAGE_CHANGED");
});

test("application returns typed stale-version and ownership conflicts without repository mutation", async () => {
  const repository = {
    async findLead() {
      return { ...lead, version: 2 };
    },
    async updateLead() {
      throw new Error("must not mutate stale lead");
    },
  };
  const application = new LeadApplication(
    repository,
    activeAllowedMembershipReader,
  );
  assert.deepEqual(
    await application.assign({
      actor,
      userId,
      organizationId: "org-1",
      leadId: lead.id,
      expectedVersion: 1,
      ownerId: "owner-2",
      idempotencyKey: "idem-2",
    }),
    { kind: "stale-version-conflict", expectedVersion: 1, actualVersion: 2 },
  );
  assert.deepEqual(
    await application.assign({
      actor,
      userId,
      organizationId: "org-2",
      leadId: lead.id,
      expectedVersion: 1,
      ownerId: "owner-2",
      idempotencyKey: "idem-3",
    }),
    { kind: "ownership-conflict" },
  );
});

test("CRM-04 application authorizes note and task commands before repository access", async () => {
  const calls = [];
  const repository = {
    async createLeadNote(input) {
      calls.push(["note", input]);
      return {
        kind: "ok",
        note: input.note,
        timelineEvent: input.timelineEvent,
      };
    },
    async createLeadTask(input) {
      calls.push(["task", input]);
      return {
        kind: "ok",
        task: input.task,
        timelineEvent: input.timelineEvent,
      };
    },
  };
  const application = new LeadApplication(
    repository,
    activeAllowedMembershipReader,
  );
  const note = await application.createNote({
    actor,
    userId,
    organizationId: "org-1",
    leadId: "lead-1",
    body: "Hello",
    idempotencyKey: "note-1",
    now: baseInputNow,
  });
  const task = await application.createTask({
    actor,
    userId,
    organizationId: "org-1",
    leadId: "lead-1",
    title: "Call",
    dueAt: new Date("2026-08-05T10:00:00.000Z"),
    idempotencyKey: "task-1",
    now: baseInputNow,
  });
  assert.equal(note.kind, "ok");
  assert.equal(task.kind, "ok");
  assert.equal(calls[0][1].organizationId, "org-1");
  assert.equal(calls[0][1].createdByUserId, userId);
  assert.equal(calls[0][1].idempotencyKey, "note-1");
  assert.equal(calls[1][1].task.status, "OPEN");
});

test("CRM-04 invalid idempotency keys and denied actors do not call repositories", async () => {
  let calls = 0;
  const repository = {
    async createLeadNote() {
      calls += 1;
    },
    async createLeadTask() {
      calls += 1;
    },
  };
  const application = new LeadApplication(
    repository,
    activeAllowedMembershipReader,
  );
  for (const idempotencyKey of ["", " ", "x".repeat(256)]) {
    assert.deepEqual(
      await application.createNote({
        actor,
        userId,
        organizationId: "org-1",
        leadId: "lead-1",
        body: "Hello",
        idempotencyKey,
      }),
      { kind: "invalid-idempotency-key" },
    );
  }
  assert.deepEqual(
    await application.createTask({
      actor: { verified: false },
      userId,
      organizationId: "org-1",
      leadId: "lead-1",
      title: "Call",
      dueAt: new Date(),
      idempotencyKey: "task-denied",
    }),
    { kind: "access-denied" },
  );
  assert.equal(calls, 0);
});

test("CRM-04 task transitions pass organization, actor, version and intent to typed ports", async () => {
  const task = {
    id: "task-1",
    organizationId: "org-1",
    leadId: "lead-1",
    title: "Call",
    dueAt: new Date("2026-08-05T10:00:00.000Z"),
    status: "OPEN",
    createdByUserId: userId,
    createdAt: baseInputNow,
    completedAt: null,
    version: 1,
  };
  const calls = [];
  const repository = {
    async findLeadTask(organizationId, leadId, taskId) {
      assert.deepEqual(
        [organizationId, leadId, taskId],
        ["org-1", "lead-1", "task-1"],
      );
      return task;
    },
    async completeLeadTask(input) {
      calls.push(["complete", input]);
      return {
        kind: "ok",
        task: input.task,
        timelineEvent: input.timelineEvent,
      };
    },
    async rescheduleLeadTask(input) {
      calls.push(["reschedule", input]);
      return {
        kind: "ok",
        task: input.task,
        timelineEvent: input.timelineEvent,
      };
    },
  };
  const application = new LeadApplication(
    repository,
    activeAllowedMembershipReader,
  );
  const completed = await application.completeTask({
    actor,
    userId,
    organizationId: "org-1",
    leadId: "lead-1",
    taskId: "task-1",
    expectedVersion: 1,
    idempotencyKey: "complete-1",
    now: new Date("2026-08-04T11:00:00.000Z"),
  });
  const rescheduled = await application.rescheduleTask({
    actor,
    userId,
    organizationId: "org-1",
    leadId: "lead-1",
    taskId: "task-1",
    expectedVersion: 1,
    idempotencyKey: "reschedule-1",
    dueAt: new Date("2026-08-06T10:00:00.000Z"),
    now: new Date("2026-08-04T12:00:00.000Z"),
  });
  assert.equal(completed.kind, "ok");
  assert.equal(rescheduled.kind, "ok");
  assert.equal(calls[0][0], "complete");
  assert.equal(calls[0][1].organizationId, "org-1");
  assert.equal(calls[0][1].createdByUserId, userId);
  assert.equal(calls[0][1].idempotencyKey, "complete-1");
  assert.equal(calls[0][1].expectedVersion, 1);
  assert.equal(calls[0][1].timelineEvent.type, "LEAD_TASK_COMPLETED");
  assert.equal(calls[1][0], "reschedule");
  assert.equal(calls[1][1].organizationId, "org-1");
  assert.equal(calls[1][1].createdByUserId, userId);
  assert.equal(calls[1][1].idempotencyKey, "reschedule-1");
  assert.equal(calls[1][1].expectedVersion, 1);
  assert.equal(calls[1][1].timelineEvent.type, "LEAD_TASK_RESCHEDULED");
});

test("repository fake replays the original result without duplicate timeline append intent", async () => {
  const accepted = new Map();
  let updateCalls = 0;
  const repository = {
    async findLead() {
      return lead;
    },
    async updateLead(input) {
      updateCalls += 1;
      const prior = accepted.get(input.idempotencyKey);
      if (prior)
        return {
          kind: "idempotent-replay",
          lead: prior.lead,
          timelineEvents: prior.timelineEvents,
        };
      const result = {
        kind: "ok",
        lead: input.lead,
        timelineEvents: input.timelineEvents,
      };
      accepted.set(input.idempotencyKey, result);
      return result;
    },
  };
  const application = new LeadApplication(
    repository,
    activeAllowedMembershipReader,
  );
  const command = {
    actor,
    userId,
    organizationId: "org-1",
    leadId: lead.id,
    expectedVersion: 1,
    nextAction: "Email",
    idempotencyKey: "idem-replay",
  };
  const first = await application.setNextAction(command);
  const replay = await application.setNextAction(command);
  assert.equal(first.kind, "ok");
  assert.equal(replay.kind, "idempotent-replay");
  assert.strictEqual(replay.lead, first.lead);
  assert.strictEqual(replay.timelineEvents, first.timelineEvents);
  assert.equal(updateCalls, 2);
  assert.equal("deleteTimelineEvent" in repository, false);
});

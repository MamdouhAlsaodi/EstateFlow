import test from "node:test";
import assert from "node:assert/strict";
import {
  LeadStage,
  LeadOwnershipConflictError,
  LeadVersionConflictError,
  createLead,
  transitionLead,
  assignLead,
  setLeadNextAction,
  createLeadNote,
  createLeadTask,
  completeLeadTask,
  rescheduleLeadTask,
  LeadValidationError,
} from "../dist/features/leads/domain/lead.js";

const baseInput = {
  id: "lead-1",
  organizationId: "org-1",
  ownerId: "owner-1",
  nextAction: "Call the client",
  source: "WEBSITE",
  utm: { source: "google", medium: "cpc", campaign: "summer" },
  now: new Date("2026-08-04T10:00:00.000Z"),
};

test("lead creation uses the active stages and version one", () => {
  const lead = createLead(baseInput);
  assert.deepEqual(LeadStage, {
    NEW: "NEW",
    CONTACTED: "CONTACTED",
    QUALIFIED: "QUALIFIED",
    NURTURING: "NURTURING",
    CLOSED_WON: "CLOSED_WON",
    CLOSED_LOST: "CLOSED_LOST",
  });
  assert.equal(lead.stage, "NEW");
  assert.equal(lead.version, 1);
  assert.equal(lead.organizationId, "org-1");
  assert.deepEqual(lead.utm, baseInput.utm);
});

test("lead creation requires organization ownership, owner assignment and next action", () => {
  assert.throws(
    () => createLead({ ...baseInput, organizationId: "" }),
    LeadOwnershipConflictError,
  );
  assert.throws(() => createLead({ ...baseInput, ownerId: null }), /owner/);
  assert.throws(
    () => createLead({ ...baseInput, nextAction: "" }),
    /next action/,
  );
});

test("only the approved lead transitions are accepted", () => {
  const allowed = [
    ["NEW", "CONTACTED"],
    ["CONTACTED", "QUALIFIED"],
    ["QUALIFIED", "NURTURING"],
    ["CONTACTED", "NEW"],
    ["QUALIFIED", "CONTACTED"],
    ["NURTURING", "CONTACTED"],
  ];
  for (const [from, to] of allowed) {
    const lead = { ...createLead(baseInput), stage: from, version: 4 };
    const result = transitionLead(lead, to, 4, baseInput.now);
    assert.equal(result.lead.stage, to);
    assert.equal(result.lead.version, 5);
    assert.equal(result.timelineEvent.type, "LEAD_STAGE_CHANGED");
  }
  assert.throws(
    () => transitionLead(createLead(baseInput), "NURTURING", 1, baseInput.now),
    /transition/,
  );
  assert.throws(
    () => transitionLead(createLead(baseInput), "WON", 1, baseInput.now),
    /stage/,
  );
});

test("assignment and next-action changes produce explicit timeline intents", () => {
  const lead = createLead(baseInput);
  const assigned = assignLead(lead, "owner-2", 1, baseInput.now);
  assert.equal(assigned.lead.ownerId, "owner-2");
  assert.equal(assigned.timelineEvent.type, "LEAD_ASSIGNED");
  const nextAction = setLeadNextAction(
    assigned.lead,
    "Send brochure",
    2,
    baseInput.now,
  );
  assert.equal(nextAction.lead.nextAction, "Send brochure");
  assert.equal(nextAction.timelineEvent.type, "LEAD_NEXT_ACTION_CHANGED");
});

test("terminal leads reject transition, assignment, and next-action changes at the expected version", () => {
  for (const stage of [LeadStage.CLOSED_WON, LeadStage.CLOSED_LOST]) {
    const lead = { ...createLead(baseInput), stage, version: 7 };
    assert.throws(
      () => transitionLead(lead, LeadStage.CONTACTED, 7, baseInput.now),
      /transition/,
    );
    assert.throws(
      () => assignLead(lead, "owner-2", 7, baseInput.now),
      /transition/,
    );
    assert.throws(
      () => setLeadNextAction(lead, "Email", 7, baseInput.now),
      /transition/,
    );
  }
});

test("domain mutations reject stale versions", () => {
  const lead = createLead(baseInput);
  assert.throws(
    () => assignLead(lead, "owner-2", 0, baseInput.now),
    LeadVersionConflictError,
  );
});

test("note creation trims bounded text and emits only the note identity", () => {
  const note = createLeadNote({
    id: "note-1",
    organizationId: "org-1",
    leadId: "lead-1",
    body: "  Met client  ",
    createdByUserId: "user-1",
    createdAt: baseInput.now,
  });
  assert.equal(note.body, "Met client");
  assert.equal(note.organizationId, "org-1");
  assert.deepEqual(note.timelineEvent, {
    type: "LEAD_NOTE_ADDED",
    leadId: "lead-1",
    organizationId: "org-1",
    occurredAt: baseInput.now,
    data: { noteId: "note-1" },
  });
  assert.ok(Object.isFrozen(note));
  assert.throws(
    () =>
      createLeadNote({
        id: "note-1",
        organizationId: "org-1",
        leadId: "lead-1",
        body: " ",
        createdByUserId: "user-1",
        createdAt: baseInput.now,
      }),
    LeadValidationError,
  );
  assert.throws(
    () =>
      createLeadNote({
        id: "note-1",
        organizationId: "org-1",
        leadId: "lead-1",
        body: "x".repeat(2001),
        createdByUserId: "user-1",
        createdAt: baseInput.now,
      }),
    LeadValidationError,
  );
});

test("task creation validates due date and emits the exact creation allowlist", () => {
  const task = createLeadTask({
    id: "task-1",
    organizationId: "org-1",
    leadId: "lead-1",
    title: "  Call client  ",
    dueAt: new Date("2026-08-05T10:00:00.000Z"),
    createdByUserId: "user-1",
    createdAt: baseInput.now,
  });
  assert.equal(task.title, "Call client");
  assert.equal(task.status, "OPEN");
  assert.equal(task.version, 1);
  assert.deepEqual(task.timelineEvent.data, {
    taskId: "task-1",
    dueAt: "2026-08-05T10:00:00.000Z",
  });
  assert.throws(
    () =>
      createLeadTask({
        id: "task-1",
        organizationId: "org-1",
        leadId: "lead-1",
        title: "Call",
        dueAt: new Date("invalid"),
        createdByUserId: "user-1",
        createdAt: baseInput.now,
      }),
    LeadValidationError,
  );
});

test("only open tasks can complete or reschedule with the expected version", () => {
  const task = createLeadTask({
    id: "task-1",
    organizationId: "org-1",
    leadId: "lead-1",
    title: "Call",
    dueAt: new Date("2026-08-05T10:00:00.000Z"),
    createdByUserId: "user-1",
    createdAt: baseInput.now,
  });
  const completed = completeLeadTask(
    task,
    1,
    new Date("2026-08-04T11:00:00.000Z"),
  );
  assert.equal(completed.task.status, "COMPLETED");
  assert.equal(completed.task.version, 2);
  assert.deepEqual(completed.timelineEvent.data, {
    taskId: "task-1",
    completedAt: "2026-08-04T11:00:00.000Z",
  });
  assert.throws(
    () => completeLeadTask(task, 0, baseInput.now),
    LeadVersionConflictError,
  );
  assert.throws(
    () => completeLeadTask(completed.task, 2, baseInput.now),
    LeadValidationError,
  );
  assert.throws(
    () =>
      rescheduleLeadTask(
        completed.task,
        new Date("2026-08-06T10:00:00.000Z"),
        2,
      ),
    LeadValidationError,
  );
  const rescheduled = rescheduleLeadTask(
    task,
    new Date("2026-08-06T10:00:00.000Z"),
    1,
  );
  assert.equal(rescheduled.task.version, 2);
  assert.deepEqual(rescheduled.timelineEvent.data, {
    taskId: "task-1",
    fromDueAt: "2026-08-05T10:00:00.000Z",
    toDueAt: "2026-08-06T10:00:00.000Z",
  });
});

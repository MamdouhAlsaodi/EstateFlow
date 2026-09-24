import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultViewingAutomationRules,
  viewingAutomationOccurrenceId,
  viewingReminderDueAt,
} from "../dist/features/automation/domain/viewing-automation.js";

test("EF-502 occurrence ids are deterministic and reset by a new schedule occurrence", () => {
  const base = {
    organizationId: "11111111-1111-4111-8111-111111111111",
    viewingId: "22222222-2222-4222-8222-222222222222",
    kind: "REMINDER_1H",
  };
  const first = viewingAutomationOccurrenceId({
    ...base,
    occurrence: "2026-10-01T10:00:00.000Z",
  });
  assert.equal(
    first,
    viewingAutomationOccurrenceId({
      ...base,
      occurrence: "2026-10-01T10:00:00.000Z",
    }),
  );
  assert.notEqual(
    first,
    viewingAutomationOccurrenceId({
      ...base,
      occurrence: "2026-10-01T11:00:00.000Z",
    }),
  );
  assert.notEqual(
    first,
    viewingAutomationOccurrenceId({
      ...base,
      kind: "REMINDER_24H",
      occurrence: "2026-10-01T10:00:00.000Z",
    }),
  );
});

test("EF-502 reminder due times are exact UTC offsets", () => {
  const start = new Date("2026-10-01T10:00:00.000Z");
  assert.equal(
    viewingReminderDueAt(start, "REMINDER_24H").toISOString(),
    "2026-09-30T10:00:00.000Z",
  );
  assert.equal(
    viewingReminderDueAt(start, "REMINDER_1H").toISOString(),
    "2026-10-01T09:00:00.000Z",
  );
});

test("EF-502 starter rules contain both reminders and outcome follow-up without Lead closing", () => {
  const rules = defaultViewingAutomationRules();
  assert.deepEqual(
    rules.map((rule) => rule.definition.trigger.eventType),
    [
      "viewing.reminder_24h",
      "viewing.reminder_1h",
      "viewing.outcome_requested",
    ],
  );
  assert.equal(
    rules[2].definition.action.actionType,
    "CREATE_VIEWING_FOLLOW_UP",
  );
  assert.equal(
    rules[2].definition.action.payload.suggestedLeadStage,
    "QUALIFIED",
  );
  assert.equal("closeLead" in rules[2].definition.action.payload, false);
});

-- EF-502 extends the EF-302 durable job allowlist for the viewing follow-up executor.
ALTER TABLE "AutomationJob"
  DROP CONSTRAINT "AutomationJob_action_type_check";
ALTER TABLE "AutomationJob"
  ADD CONSTRAINT "AutomationJob_action_type_check"
  CHECK ("actionType" IN ('CREATE_LEAD_TASK', 'CREATE_INTERNAL_NOTIFICATION', 'ADD_LEAD_TIMELINE_NOTE', 'CREATE_VIEWING_FOLLOW_UP'));

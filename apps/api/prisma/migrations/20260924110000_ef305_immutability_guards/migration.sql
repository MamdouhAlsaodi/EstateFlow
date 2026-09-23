-- EF-305: database-enforced immutable approved template and one-way approval transitions.
CREATE FUNCTION "ef305_reject_template_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'APPROVED' THEN
    RAISE EXCEPTION 'approved notification template is immutable';
  END IF;
  IF NEW."organizationId" <> OLD."organizationId" OR NEW."templateKey" <> OLD."templateKey"
     OR NEW."locale" <> OLD."locale" OR NEW."version" <> OLD."version"
     OR NEW."subject" IS DISTINCT FROM OLD."subject" OR NEW."body" <> OLD."body"
     OR NEW."createdBy" <> OLD."createdBy" OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'notification template content is immutable; create a revision';
  END IF;
  IF NEW."status" <> 'APPROVED' OR NEW."approvedBy" IS NULL OR NEW."approvedAt" IS NULL THEN
    RAISE EXCEPTION 'notification template approval must be a complete transition';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ef305_notification_template_immutable"
  BEFORE UPDATE ON "NotificationTemplate"
  FOR EACH ROW EXECUTE FUNCTION "ef305_reject_template_mutation"();

CREATE FUNCTION "ef305_reject_approval_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'notification approval is immutable after decision';
  END IF;
  IF NEW."organizationId" <> OLD."organizationId" OR NEW."templateId" <> OLD."templateId"
     OR NEW."recipientUserId" <> OLD."recipientUserId" OR NEW."channel" <> OLD."channel"
     OR NEW."locale" <> OLD."locale" OR NEW."variables" <> OLD."variables"
     OR NEW."requestedBy" <> OLD."requestedBy" OR NEW."requestedAt" <> OLD."requestedAt"
     OR NEW."status" NOT IN ('APPROVED', 'DENIED') OR NEW."decidedBy" IS NULL OR NEW."decidedAt" IS NULL THEN
    RAISE EXCEPTION 'notification approval transition is invalid';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ef305_notification_approval_transition"
  BEFORE UPDATE ON "NotificationApproval"
  FOR EACH ROW EXECUTE FUNCTION "ef305_reject_approval_mutation"();

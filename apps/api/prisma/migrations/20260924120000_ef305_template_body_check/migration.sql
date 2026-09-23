-- EF-305: use a PostgreSQL POSIX whitespace expression for non-blank template bodies.
ALTER TABLE "NotificationTemplate" DROP CONSTRAINT "NotificationTemplate_body_check";
ALTER TABLE "NotificationTemplate" ADD CONSTRAINT "NotificationTemplate_body_check"
  CHECK ("body" <> '' AND "body" ~ '[^[:space:]]');

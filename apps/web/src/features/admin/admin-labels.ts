/**
 * EF-620/EF-630 — admin label maps hold translation-catalog keys; the
 * written Arabic/English text lives in `src/i18n/messages/admin.ts`.
 * Unknown values keep the raw typed code so nothing is ever invented.
 */

import type { MessageKey } from "../../i18n";
import type { AdminAuditAction } from "./admin-contract";

export const MEMBERSHIP_STATUS_LABELS: Readonly<Record<string, MessageKey>> = {
  PENDING: "admin.membership.PENDING",
  ACTIVE: "admin.membership.ACTIVE",
  SUSPENDED: "admin.membership.SUSPENDED",
  REVOKED: "admin.membership.REVOKED",
};

export const LISTING_STATUS_LABELS: Readonly<Record<string, MessageKey>> = {
  DRAFT: "admin.listing.DRAFT",
  PUBLISHED: "admin.listing.PUBLISHED",
  ARCHIVED: "admin.listing.ARCHIVED",
};

export const MODERATION_STATUS_LABELS: Readonly<Record<string, MessageKey>> = {
  PENDING: "admin.moderation.PENDING",
  APPROVED: "admin.moderation.APPROVED",
  REJECTED: "admin.moderation.REJECTED",
  TAKEN_DOWN: "admin.moderation.TAKEN_DOWN",
};

export const AUDIT_ACTION_LABELS: Readonly<
  Record<AdminAuditAction, MessageKey>
> = {
  BROKER_APPROVED: "admin.auditAction.BROKER_APPROVED",
  BROKER_SUSPENDED: "admin.auditAction.BROKER_SUSPENDED",
  BROKER_REINSTATED: "admin.auditAction.BROKER_REINSTATED",
  LISTING_MODERATION_APPROVED: "admin.auditAction.LISTING_MODERATION_APPROVED",
  LISTING_MODERATION_REJECTED: "admin.auditAction.LISTING_MODERATION_REJECTED",
  LISTING_MODERATION_TAKEN_DOWN:
    "admin.auditAction.LISTING_MODERATION_TAKEN_DOWN",
};

export const AUDIT_TARGET_LABELS: Readonly<Record<string, MessageKey>> = {
  MEMBERSHIP: "admin.auditTarget.MEMBERSHIP",
  LISTING: "admin.auditTarget.LISTING",
};

export const FAILURE_KIND_LABELS: Readonly<Record<string, MessageKey>> = {
  "action-executor-not-configured":
    "admin.failure.action-executor-not-configured",
  "action-permanent-failure": "admin.failure.action-permanent-failure",
  "action-transient-failure": "admin.failure.action-transient-failure",
  "unexpected-executor-error": "admin.failure.unexpected-executor-error",
};

/**
 * EF-610 — immutable deal/property snapshot for contract generation.
 *
 * A contract is generated from exactly (approved template version, snapshot).
 * The snapshot is captured once from the deal, its property, the organization,
 * and the ordered signing parties; it is stored verbatim on the contract and
 * is immutable (DB trigger). Every template placeholder resolves ONLY from
 * this snapshot — there is no other source of truth, no free-form input, and
 * no invented facts.
 *
 * EF-610 boundary: contracts carry operational identifiers only. Leads hold
 * no customer PII in this platform by design, and the snapshot keeps that
 * property: parties are represented by organization membership references,
 * never personal chats/notes/credentials.
 */

export const CONTRACT_SNAPSHOT_SCHEMA_VERSION = 1;

export type ContractSignerRole = "OWNER" | "MANAGER" | "BROKER";

/** One ordered signing party. Order 1 = deal broker, order 2 = org principal. */
export type ContractSigner = Readonly<{
  userId: string;
  role: ContractSignerRole;
  order: number;
  /** Organization-scoped reference label (account identifier of the member). */
  reference: string;
}>;

export type ContractSnapshot = Readonly<{
  schemaVersion: 1;
  capturedAt: string;
  deal: Readonly<{
    dealId: string;
    leadId: string;
    status: string;
    dealVersion: number;
    dealCreatedAt: string;
  }>;
  property: Readonly<{
    propertyId: string;
    title: string;
    propertyType: string;
    addressText: string;
    propertyVersion: number;
  }>;
  organization: Readonly<{
    organizationId: string;
    name: string;
  }>;
  signers: readonly ContractSigner[];
}>;

/** Inputs the application assembles from the persisted deal aggregate. */
export type DealSnapshotInputs = Readonly<{
  now: Date;
  deal: Readonly<{
    id: string;
    organizationId: string;
    leadId: string;
    propertyId: string;
    status: string;
    version: number;
    createdAt: Date;
  }>;
  property: Readonly<{
    id: string;
    title: string;
    propertyType: string;
    addressText: string;
    version: number;
  }>;
  organizationName: string;
  broker: Readonly<{
    userId: string;
    role: ContractSignerRole;
    reference: string;
  }>;
  principal: Readonly<{
    userId: string;
    role: ContractSignerRole;
    reference: string;
  }>;
}>;

export class ContractSnapshotError extends Error {
  readonly code = "CONTRACT_SNAPSHOT_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "ContractSnapshotError";
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireText(name: string, value: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new ContractSnapshotError(`${name} is required`);
  if (value.length > maxLength)
    throw new ContractSnapshotError(`${name} exceeds ${maxLength} characters`);
  return value;
}

function requireUuid(name: string, value: string): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new ContractSnapshotError(`${name} is not a valid id`);
  return value;
}

function requireInstant(name: string, value: Date): string {
  const instant = value.toISOString();
  return instant;
}

function requireRole(value: string): ContractSignerRole {
  if (value !== "OWNER" && value !== "MANAGER" && value !== "BROKER")
    throw new ContractSnapshotError(`invalid signer role ${value}`);
  return value;
}

/**
 * Builds the frozen snapshot with deterministic signer ordering:
 * order 1 = the deal broker, order 2 = the organization principal
 * (Owner/Manager picked deterministically by the reader).
 */
export function buildContractSnapshot(
  inputs: DealSnapshotInputs,
): ContractSnapshot {
  const brokerOrder = 1;
  const principalOrder = 2;
  if (inputs.broker.userId === inputs.principal.userId)
    throw new ContractSnapshotError(
      "the deal broker and the organization principal must differ",
    );
  const signers: readonly ContractSigner[] = [
    {
      userId: requireUuid("broker user id", inputs.broker.userId),
      role: requireRole(inputs.broker.role),
      order: brokerOrder,
      reference: requireText("broker reference", inputs.broker.reference, 200),
    },
    {
      userId: requireUuid("principal user id", inputs.principal.userId),
      role: requireRole(inputs.principal.role),
      order: principalOrder,
      reference: requireText(
        "principal reference",
        inputs.principal.reference,
        200,
      ),
    },
  ];
  return Object.freeze({
    schemaVersion: CONTRACT_SNAPSHOT_SCHEMA_VERSION,
    capturedAt: requireInstant("capturedAt", inputs.now),
    deal: Object.freeze({
      dealId: requireUuid("deal id", inputs.deal.id),
      leadId: requireUuid("deal lead id", inputs.deal.leadId),
      status: requireText("deal status", inputs.deal.status, 50),
      dealVersion: inputs.deal.version,
      dealCreatedAt: requireInstant("deal createdAt", inputs.deal.createdAt),
    }),
    property: Object.freeze({
      propertyId: requireUuid("property id", inputs.property.id),
      title: requireText("property title", inputs.property.title, 200),
      propertyType: requireText(
        "property type",
        inputs.property.propertyType,
        200,
      ),
      addressText: requireText(
        "property address",
        inputs.property.addressText,
        500,
      ),
      propertyVersion: inputs.property.version,
    }),
    organization: Object.freeze({
      organizationId: requireUuid(
        "organization id",
        inputs.deal.organizationId,
      ),
      name: requireText("organization name", inputs.organizationName, 200),
    }),
    signers: Object.freeze(signers),
  });
}

/**
 * Strict placeholder allowlist: the only variables a contract template may
 * reference, each resolving exclusively from the snapshot above.
 */
export const CONTRACT_SLOTS = [
  "ORGANIZATION_NAME",
  "DEAL_REFERENCE",
  "DEAL_STATUS",
  "PROPERTY_TITLE",
  "PROPERTY_TYPE",
  "PROPERTY_ADDRESS",
  "BROKER_REFERENCE",
  "SNAPSHOT_CAPTURED_AT",
] as const;

export type ContractSlot = (typeof CONTRACT_SLOTS)[number];

/** Pure, deterministic slot resolution from the frozen snapshot. */
export function snapshotSlotValues(
  snapshot: ContractSnapshot,
): Readonly<Record<ContractSlot, string>> {
  const broker = snapshot.signers.find((signer) => signer.order === 1);
  if (!broker)
    throw new ContractSnapshotError("snapshot has no order-1 broker signer");
  return Object.freeze({
    ORGANIZATION_NAME: snapshot.organization.name,
    DEAL_REFERENCE: snapshot.deal.dealId,
    DEAL_STATUS: snapshot.deal.status,
    PROPERTY_TITLE: snapshot.property.title,
    PROPERTY_TYPE: snapshot.property.propertyType,
    PROPERTY_ADDRESS: snapshot.property.addressText,
    BROKER_REFERENCE: broker.reference,
    SNAPSHOT_CAPTURED_AT: snapshot.capturedAt,
  });
}

/** Runtime re-validation of snapshots read back from the database. */
export function parseContractSnapshot(value: unknown): ContractSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new ContractSnapshotError("snapshot is not an object");
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== CONTRACT_SNAPSHOT_SCHEMA_VERSION)
    throw new ContractSnapshotError("unsupported snapshot schema version");
  const deal = raw.deal as Record<string, unknown>;
  const property = raw.property as Record<string, unknown>;
  const organization = raw.organization as Record<string, unknown>;
  if (
    typeof deal !== "object" ||
    deal === null ||
    typeof property !== "object" ||
    property === null ||
    typeof organization !== "object" ||
    organization === null
  )
    throw new ContractSnapshotError("snapshot sections are malformed");
  if (!Array.isArray(raw.signers) || raw.signers.length === 0)
    throw new ContractSnapshotError("snapshot signers are missing");
  const signers = raw.signers.map((entry) => {
    const signer = entry as Record<string, unknown>;
    return Object.freeze({
      userId: requireUuid("signer user id", signer.userId as string),
      role: requireRole(signer.role as string),
      order: signer.order as number,
      reference: requireText(
        "signer reference",
        signer.reference as string,
        200,
      ),
    });
  });
  return Object.freeze({
    schemaVersion: 1,
    capturedAt: requireText("capturedAt", raw.capturedAt as string, 40),
    deal: Object.freeze({
      dealId: requireUuid("deal id", deal.dealId as string),
      leadId: requireUuid("deal lead id", deal.leadId as string),
      status: requireText("deal status", deal.status as string, 50),
      dealVersion: deal.dealVersion as number,
      dealCreatedAt: requireText(
        "deal createdAt",
        deal.dealCreatedAt as string,
        40,
      ),
    }),
    property: Object.freeze({
      propertyId: requireUuid("property id", property.propertyId as string),
      title: requireText("property title", property.title as string, 200),
      propertyType: requireText(
        "property type",
        property.propertyType as string,
        200,
      ),
      addressText: requireText(
        "property address",
        property.addressText as string,
        500,
      ),
      propertyVersion: property.propertyVersion as number,
    }),
    organization: Object.freeze({
      organizationId: requireUuid(
        "organization id",
        organization.organizationId as string,
      ),
      name: requireText("organization name", organization.name as string, 200),
    }),
    signers: Object.freeze(signers),
  });
}

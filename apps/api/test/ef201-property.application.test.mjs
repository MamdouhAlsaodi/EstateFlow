import test from "node:test";
import assert from "node:assert/strict";
import { PropertyApplication, PropertyAccessDeniedError, PropertyNotFoundError } from "../dist/features/properties/application/property-application.js";
import { ListingStatus } from "../dist/features/properties/domain/property.js";

const property = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  title: "Villa",
  propertyType: "VILLA",
  addressText: "Street",
  ownerReference: null,
  status: "ACTIVE",
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

test("application update uses the current version and returns the next version", async () => {
  const repository = {
    async findProperty(organizationId, id) { return organizationId === property.organizationId && id === property.id ? property : null; },
    async updateProperty(input) { return { ...property, ...input.changes, version: input.version + 1 }; },
  };
  const application = new PropertyApplication(repository);
  const result = await application.update({ actor: { verified: true, memberships: [{ organizationId: property.organizationId, role: "OWNER", active: true }] }, organizationId: property.organizationId, propertyId: property.id, version: 1, changes: { title: "New Villa" } });
  assert.equal(result.version, 2);
  assert.equal(result.title, "New Villa");
});

test("application does not disclose a property from another organization", async () => {
  const repository = { async findProperty() { return property; } };
  const application = new PropertyApplication(repository);
  await assert.rejects(() => application.update({ actor: { verified: true, memberships: [{ organizationId: "44444444-4444-4444-8444-444444444444", role: "OWNER", active: true }] }, organizationId: "44444444-4444-4444-8444-444444444444", propertyId: property.id, version: 1, changes: { title: "Nope" } }), /not found/);
});

test("management commands require a verified actor with active organization membership", async () => {
  const repository = { async createProperty() { return property; } };
  const application = new PropertyApplication(repository);
  await assert.rejects(() => application.createProperty({ actor: { verified: false, memberships: [] }, organizationId: property.organizationId, property: {} }), PropertyAccessDeniedError);
  await assert.rejects(() => application.createProperty({ actor: { verified: true, memberships: [{ organizationId: property.organizationId, role: "OWNER", active: false }] }, organizationId: property.organizationId, property: {} }), PropertyAccessDeniedError);
});

test("broker reads published listings only and client has no access", async () => {
  const published = { id: "listing-1", organizationId: property.organizationId, propertyId: property.id, status: ListingStatus.PUBLISHED, version: 1, createdAt: new Date(), updatedAt: new Date() };
  const repository = { async findListing() { return published; } };
  const application = new PropertyApplication(repository);
  const broker = { verified: true, memberships: [{ organizationId: property.organizationId, role: "BROKER", active: true }] };
  assert.equal(await application.getListing({ actor: broker, organizationId: property.organizationId, listingId: published.id }), published);
  await assert.rejects(() => application.getListing({ actor: { verified: true, memberships: [{ organizationId: property.organizationId, role: "CLIENT", active: true }] }, organizationId: property.organizationId, listingId: published.id }), PropertyNotFoundError);
});

test("broker property reads require a published active listing", async () => {
  const repository = { async findProperty() { return { ...property, activeListing: { status: ListingStatus.DRAFT } }; } };
  const application = new PropertyApplication(repository);
  await assert.rejects(() => application.getProperty({ actor: { verified: true, memberships: [{ organizationId: property.organizationId, role: "BROKER", active: true }] }, organizationId: property.organizationId, propertyId: property.id }), PropertyNotFoundError);
});

test("property search is organization-scoped and broker results contain published listings only", async () => {
  const draft = { ...property, title: "Draft Villa", activeListing: { status: "DRAFT" } };
  const published = { ...property, id: "33333333-3333-4333-8333-333333333333", title: "Published Villa", activeListing: { status: "PUBLISHED" } };
  const repository = { async searchProperties(organizationId, criteria) {
    assert.deepEqual(criteria, { titleOrAddress: "Villa" });
    return { items: [draft, published], nextCursor: "opaque-next" };
  } };
  const application = new PropertyApplication(repository);
  const result = await application.searchProperties({ actor: { verified: true, memberships: [{ organizationId: property.organizationId, role: "BROKER", active: true }] }, organizationId: property.organizationId, search: "Villa" });
  assert.deepEqual(result.items.map((item) => item.id), [published.id]);
  assert.equal(result.nextCursor, "opaque-next");
});

test("property search accepts an opaque cursor and preserves repository pagination", async () => {
  const repository = { async searchProperties(organizationId, criteria) {
    assert.equal(organizationId, property.organizationId);
    assert.deepEqual(criteria, { titleOrAddress: "Villa" });
    return { items: [property], nextCursor: null };
  } };
  const application = new PropertyApplication(repository);
  const result = await application.searchProperties({ actor: { verified: true, memberships: [{ organizationId: property.organizationId, role: "OWNER", active: true }] }, organizationId: property.organizationId, search: "Villa", cursor: "opaque-cursor", limit: 10 });
  assert.deepEqual(result.items, [property]);
  assert.equal(result.nextCursor, null);
});

test("inactive membership and platform admin do not gain implicit tenant access", async () => {
  const repository = { async findProperty() { return property; } };
  const application = new PropertyApplication(repository);
  const request = { organizationId: property.organizationId, propertyId: property.id };
  await assert.rejects(() => application.getProperty({ actor: { verified: true, memberships: [{ organizationId: property.organizationId, role: "MANAGER", active: false }] }, ...request }), PropertyNotFoundError);
  await assert.rejects(() => application.getProperty({ actor: { verified: true, memberships: [], platformAdmin: true }, ...request }), PropertyNotFoundError);
});

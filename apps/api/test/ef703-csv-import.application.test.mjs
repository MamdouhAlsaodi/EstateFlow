// EF-703 — application-level unit tests for CSV import dry-run/commit.
// Fake repository + fixed signing key; no DB, no HTTP. Synthetic data only.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { CsvImportApplication } from "../dist/features/properties/application/csv-import-application.js";
import {
  CsvDryRunTokenError,
  CsvDryRunTokenSigner,
} from "../dist/features/properties/domain/csv-import.js";
import { PropertyAccessDeniedError } from "../dist/features/properties/application/property-application.js";

const HEADER =
  "title,propertyType,addressText,ownerReference,latitude,longitude";
const ORG_A = "a2222222-2222-4222-8222-222222222222";
const ORG_B = "b2222222-2222-4222-8222-222222222222";
const CSV = `${HEADER}\nVilla One,VILLA,1 Alpha Street,OWN-1,25.2,55.3\nVilla Two,VILLA,2 Beta Street,,,`;

function actor(
  role = "OWNER",
  { verified = true, organizationId = ORG_A } = {},
) {
  // Allow `actor({ organizationId })` shorthand: an object passed as the
  // first argument is treated as the options bag with the default role.
  if (typeof role !== "string") return actor("OWNER", role);
  return {
    verified,
    memberships: [{ organizationId, role, active: true }],
  };
}

class FakeCsvImportRepository {
  constructor() {
    this.persisted = [];
    this.existingKeys = new Set();
    this.failAfter = null;
  }
  key(title, addressText) {
    // Structured, case-sensitive key matching the real adapter semantics.
    return JSON.stringify([addressText, title]);
  }
  async importProperties(rows, organizationId) {
    const fresh = [];
    const batchKeys = new Set();
    for (const row of rows) {
      const key = this.key(row.title, row.addressText);
      if (
        this.existingKeys.has(key) ||
        batchKeys.has(key) // intra-batch duplicate: skip once
      )
        continue;
      batchKeys.add(key);
      fresh.push({ ...row, organizationId });
    }
    const batch = rows.length;
    if (this.failAfter !== null) {
      this.attempted = (this.attempted ?? 0) + batch;
      if (this.attempted > this.failAfter) throw new Error("db failure");
    }
    this.persisted.push(...fresh);
    for (const row of fresh)
      this.existingKeys.add(this.key(row.title, row.addressText));
    return {
      imported: fresh.length,
      skippedDuplicate: rows.length - fresh.length,
    };
  }
}

function application(repository = new FakeCsvImportRepository()) {
  return {
    app: new CsvImportApplication({
      repository,
      signer: new CsvDryRunTokenSigner(Buffer.alloc(32, 9)),
    }),
    repository,
  };
}

test("CLIENT, BROKER, and unverified actors are denied on dry-run and commit", async () => {
  const { app } = application();
  for (const denied of [
    actor("CLIENT"),
    actor("BROKER"),
    actor("OWNER", { verified: false }),
    actor("OWNER", { organizationId: ORG_B }),
  ]) {
    await assert.rejects(
      () => app.dryRun({ actor: denied, organizationId: ORG_A, csv: CSV }),
      PropertyAccessDeniedError,
    );
    await assert.rejects(
      () =>
        app.commit({
          actor: denied,
          organizationId: ORG_A,
          csv: CSV,
          dryRunToken: "anything",
        }),
      PropertyAccessDeniedError,
    );
  }
});

test("dry-run writes nothing and returns a report plus a bound token", async () => {
  const { app, repository } = application();
  const result = await app.dryRun({
    actor: actor(),
    organizationId: ORG_A,
    csv: CSV,
  });
  assert.deepEqual(repository.persisted, []);
  assert.equal(result.report.totalRows, 2);
  assert.equal(result.report.validRows, 2);
  assert.equal(typeof result.dryRunToken, "string");
  assert.ok(result.dryRunToken.includes("."));
  assert.ok(result.expiresAtEpochSeconds > Math.floor(Date.now() / 1000));
});

test("commit with a token bound to the wrong org or different bytes is rejected", async () => {
  const { app } = application();
  const orgAToken = (
    await app.dryRun({ actor: actor(), organizationId: ORG_A, csv: CSV })
  ).dryRunToken;
  await assert.rejects(
    () =>
      app.commit({
        actor: actor({ organizationId: ORG_B }),
        organizationId: ORG_B,
        csv: CSV,
        dryRunToken: orgAToken,
      }),
    (error) =>
      error instanceof CsvDryRunTokenError && error.code === "TOKEN_MISMATCH",
  );
  await assert.rejects(
    () =>
      app.commit({
        actor: actor(),
        organizationId: ORG_A,
        csv: `${CSV}trailing\n`,
        dryRunToken: orgAToken,
      }),
    (error) =>
      error instanceof CsvDryRunTokenError && error.code === "TOKEN_MISMATCH",
  );
});

test("token replay is rejected single-use and the second commit inserts nothing", async () => {
  const { app, repository } = application();
  const { dryRunToken } = await app.dryRun({
    actor: actor(),
    organizationId: ORG_A,
    csv: CSV,
  });
  const first = await app.commit({
    actor: actor(),
    organizationId: ORG_A,
    csv: CSV,
    dryRunToken,
  });
  assert.equal(first.imported, 2);
  await assert.rejects(
    () =>
      app.commit({
        actor: actor(),
        organizationId: ORG_A,
        csv: CSV,
        dryRunToken,
      }),
    (error) => error instanceof CsvDryRunTokenError,
  );
  assert.equal(repository.persisted.length, 2);
});

test("expired tokens are rejected", async () => {
  const signer = new CsvDryRunTokenSigner(Buffer.alloc(32, 9));
  const { app } = application();
  const expiredToken = signer.sign({
    organizationId: ORG_A,
    csvSha256: createHash("sha256").update(CSV, "utf8").digest("hex"),
    expiresAtEpochSeconds: Math.floor(Date.now() / 1000) - 1,
  });
  await assert.rejects(
    () =>
      app.commit({
        actor: actor(),
        organizationId: ORG_A,
        csv: CSV,
        dryRunToken: expiredToken,
      }),
    (error) =>
      error instanceof CsvDryRunTokenError && error.code === "TOKEN_EXPIRED",
  );
});

test("commit refuses rows that did not fully validate (validRows must equal totalRows)", async () => {
  const { app, repository } = application();
  const badCsv = `${CSV}\nBad Lat,VILLA,3 Gamma Street,,95,55.3\n`;
  const { dryRunToken } = await app.dryRun({
    actor: actor(),
    organizationId: ORG_A,
    csv: badCsv,
  });
  await assert.rejects(
    () =>
      app.commit({
        actor: actor(),
        organizationId: ORG_A,
        csv: badCsv,
        dryRunToken,
      }),
    (error) => error instanceof Error && /did not validate/.test(error.message),
  );
  assert.deepEqual(repository.persisted, []);
});

test("duplicate addressText+title rows are skipped and counted, not errors", async () => {
  const { app, repository } = application();
  repository.existingKeys.add(repository.key("Villa One", "1 Alpha Street"));
  const duplicateCsv = `${HEADER}\nVilla One,VILLA,1 Alpha Street,OWN-1,25.2,55.3\nVilla Two,VILLA,2 Beta Street,,,`;
  const { dryRunToken } = await app.dryRun({
    actor: actor(),
    organizationId: ORG_A,
    csv: duplicateCsv,
  });
  const result = await app.commit({
    actor: actor(),
    organizationId: ORG_A,
    csv: duplicateCsv,
    dryRunToken,
  });
  assert.equal(result.imported, 1);
  assert.equal(result.skippedDuplicate, 1);
  assert.equal(repository.persisted.length, 1);
  assert.equal(repository.persisted[0].title, "Villa Two");
});

test("intra-batch duplicates are skipped once and counted, not both inserted", async () => {
  const { app, repository } = application();
  const duplicateCsv = `${HEADER}\nVilla One,VILLA,1 Alpha Street,OWN-1,25.2,55.3\nVilla One,VILLA,1 Alpha Street,OWN-1,25.2,55.3\n`;
  const { dryRunToken } = await app.dryRun({
    actor: actor(),
    organizationId: ORG_A,
    csv: duplicateCsv,
  });
  const result = await app.commit({
    actor: actor(),
    organizationId: ORG_A,
    csv: duplicateCsv,
    dryRunToken,
  });
  assert.equal(result.imported, 1);
  assert.equal(result.skippedDuplicate, 1);
  assert.equal(repository.persisted.length, 1);
});

test("addressText values containing :: import correctly without mis-splitting", async () => {
  const { app, repository } = application();
  const trickyCsv = `${HEADER}\nVilla One,VILLA,1 Alpha :: Street,OWN-1,25.2,55.3\n`;
  const { dryRunToken } = await app.dryRun({
    actor: actor(),
    organizationId: ORG_A,
    csv: trickyCsv,
  });
  const result = await app.commit({
    actor: actor(),
    organizationId: ORG_A,
    csv: trickyCsv,
    dryRunToken,
  });
  assert.equal(result.imported, 1);
  assert.equal(result.skippedDuplicate, 0);
  assert.equal(repository.persisted[0].addressText, "1 Alpha :: Street");
});

test("case-variant title+addressText pairs are distinct, not duplicates", async () => {
  const { app, repository } = application();
  const variantCsv = `${HEADER}\nVilla One,VILLA,1 Alpha Street,OWN-1,25.2,55.3\nvilla one,VILLA,1 alpha street,OWN-1,25.2,55.3\n`;
  const { dryRunToken } = await app.dryRun({
    actor: actor(),
    organizationId: ORG_A,
    csv: variantCsv,
  });
  const result = await app.commit({
    actor: actor(),
    organizationId: ORG_A,
    csv: variantCsv,
    dryRunToken,
  });
  assert.equal(result.imported, 2);
  assert.equal(result.skippedDuplicate, 0);
  assert.equal(repository.persisted.length, 2);
});

test("an invalid-row commit does not burn the single-use token", async () => {
  const { app, repository } = application();
  const badCsv = `${HEADER}\nBad Lat,VILLA,3 Gamma Street,,95,55.3\n`;
  const { dryRunToken } = await app.dryRun({
    actor: actor(),
    organizationId: ORG_A,
    csv: badCsv,
  });
  await assert.rejects(
    () =>
      app.commit({
        actor: actor(),
        organizationId: ORG_A,
        csv: badCsv,
        dryRunToken,
      }),
    (error) => error instanceof Error && /did not validate/.test(error.message),
  );
  // The token was not burned: the retry with the same bytes+token reaches
  // row validation (CsvImportRejectedError) instead of the single-use
  // registry (CsvDryRunTokenError / TOKEN_MISMATCH).
  await assert.rejects(
    () =>
      app.commit({
        actor: actor(),
        organizationId: ORG_A,
        csv: badCsv,
        dryRunToken,
      }),
    (error) => error instanceof Error && /did not validate/.test(error.message),
  );
  assert.deepEqual(repository.persisted, []);
});

test("a repository failure mid-commit leaves nothing persisted", async () => {
  const repository = new FakeCsvImportRepository();
  repository.failAfter = 1; // fail once more than one row is attempted
  const { app } = application(repository);
  const { dryRunToken } = await app.dryRun({
    actor: actor(),
    organizationId: ORG_A,
    csv: CSV,
  });
  await assert.rejects(
    () =>
      app.commit({
        actor: actor(),
        organizationId: ORG_A,
        csv: CSV,
        dryRunToken,
      }),
    /db failure/,
  );
  assert.deepEqual(repository.persisted, []);
});

test("reports are bounded: no addressText, ownerReference, or coordinate values leak", async () => {
  const { app } = application();
  const result = await app.dryRun({
    actor: actor(),
    organizationId: ORG_A,
    csv: CSV,
  });
  const serialized = JSON.stringify(result.report);
  for (const secret of [
    "1 Alpha Street",
    "2 Beta Street",
    "OWN-1",
    "25.2",
    "55.3",
  ]) {
    assert.ok(!serialized.includes(secret), `leaked ${secret}`);
  }
  // Valid-row previews expose only title, propertyType, and the presence flag.
  assert.deepEqual(result.report.previews, [
    {
      row: 1,
      title: "Villa One",
      propertyType: "VILLA",
      hasOwnerReference: true,
    },
    {
      row: 2,
      title: "Villa Two",
      propertyType: "VILLA",
      hasOwnerReference: false,
    },
  ]);
});

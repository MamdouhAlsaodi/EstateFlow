# EF-232 T1-R1/R2 — Independent Plan Command and Type-Safety Verification (2026-08-14)

## Verdict

**PASS — accepted as part of EF-232 T1.**

## Reason for recovery

T1 originally exposed plan factories but not an authorized primitive plan-creation command. T1-R1 added that application/repository boundary. Independent review then found assertion-based narrowing in the explicit-policy branch; T1-R2 replaced it with a type guard and added half-policy rejection.

## Fresh independent verification

```text
API build: PASS
EF-232 + EF-231 domain/application tests: 37/37 PASS
EF232_T1_R2_INDEPENDENT_HALF_POLICY_NO_MUTATION=PASS
git diff --check: PASS
```

## Accepted properties

- Verified active Owner/Manager only may create a plan version; authorization precedes repository action.
- Plan command accepts primitives only. Omitted policy produces 500 bps / broker 6000 / office 4000; explicit policy is canonicalized by domain validation.
- Caller-shaped aggregate extras do not influence plan output.
- Rate-only and recipients-only policy inputs reject before repository mutation.
- `CommissionApplication` contains no `as number`, `as readonly CommissionRecipient[]`, `as any`, or `as unknown as` assertion.
- No schema, migration, Prisma repository, module, DB, HTTP, OpenAPI/client, Web, Deal/Lead, or ledger change occurred in R1/R2.

## Next boundary

T2 may now persist plan versions/ordered recipients, one auditable commissionable value per Deal, and immutable expected-accrual/split snapshots. It must consume a `DEAL_CLOSED_WON` event at most once per organization, run mutations atomically on guarded `estateflow_test`, and preserve all non-persistence boundaries.

# EF-701 — bounded tracked-index security baseline

This increment adds an offline accidental-publication guard; it is not whole EF-701 completion or a pilot-security approval.

## Exact behavior

`scripts/verify-security-baseline.mjs` reads `git ls-files --stage -z` records and scans each stage-0 blob by object ID using `git cat-file blob <OID>` (no shell). It does not read working-tree file bytes. Malformed records, unmerged stages, unsupported modes, missing blobs, or Git errors fail closed with paths and contents suppressed. Tracked symlinks are rejected. It rejects `.env` names other than the exact, case-sensitive `.env.example`; private-key filename extensions/names; credential/OAuth data filenames; and high-confidence sensitive directory segments (`credentials`, `credential`, `oauth`, `.ssh`, `.aws`, `.gnupg`, `secrets`, `private`, case-insensitive). Auth/credential/OAuth source-code files are exempt from directory-name matching to avoid flagging implementation code. Common PEM private-key BEGIN markers are detected in staged blobs. Findings and failures never print paths or values.

This is intentionally not a general secret scanner: it does not inspect untracked/ignored files, identify arbitrary passwords/tokens, or guarantee detection of every key format. Exact `.env.example` content is permitted. No real secrets or customer data were used/read; fixtures are synthetic and isolated.

## Verification evidence

Parent verified Node v24.14.1 and pnpm 10.33.2; frozen-lockfile install; `pnpm security:check`, lint, typecheck, test, `format:check`, `check:openapi-drift`, and build all PASS. Build used the synthetic `API_ORIGIN=http://127.0.0.1:3000`. The focused fixture suite passed 5/5 after the final correction.

The exact staged scanner passed, checking 861 index entries including the five staged approved files. Before correction, it caught its own tracked literal synthetic PEM fixture; the fixture was corrected to construct the marker at runtime. `git diff --check` and `git diff --cached --check` PASS. A separate audit of the five staged blobs passed (patterns and paths checked; no values printed). CI has not yet run remotely.

These checks do not establish database integration, live penetration testing, independent privacy review, or EF-701 completion. Runtime tenant isolation/IDOR, CSRF/auth/session review, dependency/license advisory review, and independent privacy/security review remain future gates.

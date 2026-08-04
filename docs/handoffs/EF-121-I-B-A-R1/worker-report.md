# EF-121-I-B-A-R1 Worker Report

## Goal

Make the existing API integration-test Node glob run serially without changing its guard, generation, migration, build, or glob sequence.

## Allowed paths used

- `apps/api/package.json`
- `docs/handoffs/EF-121-I-B-A-R1/worker-report.md`

## Files changed

- `apps/api/package.json` — added Node's documented `--test-concurrency=1` option to the existing `node --test test/*.integration.mjs` command.
- `docs/handoffs/EF-121-I-B-A-R1/worker-report.md` — this report.

## Commands run

```sh
node -e 'const fs=require("fs"); const pkg=JSON.parse(fs.readFileSync("apps/api/package.json", "utf8")); const script=pkg.scripts["test:integration"]; if (!script.includes("node --test --test-concurrency=1 test/*.integration.mjs")) process.exit(1); console.log("package.json: valid JSON; test:integration contains node --test --test-concurrency=1 with the existing glob.");'
```

## Observed output

```text
package.json: valid JSON; test:integration contains node --test --test-concurrency=1 with the existing glob.
```

## Verification

- Static package JSON parsing passed.
- The integration command still has the original guard → generate → migrate → build → integration-test order and the same test glob.
- Integration tests, Docker, migrations, and database commands were not run, as required by the packet. No runtime test result is claimed.

## Status

PASS

## Risks

- Runtime verification of the serial integration run remains for Yui against the approved target; it was intentionally outside this writer packet.

## Next recommended step

Run the approved target integration verification and record its evidence in the next governed phase.

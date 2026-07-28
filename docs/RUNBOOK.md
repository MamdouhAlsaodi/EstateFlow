# Runbook

## Local operations

1. Verify the project root with `pwd`; it must equal
   `/home/server/projects/estateflow`.
2. Open the registry entry for `estateflow` to confirm phases and
   pending decisions are current.
3. Edit `docs/PLAN.md` and the registry `phases` array when a
   phase changes status.

## Incident playbook

- **Registry drift**: the directory exists but the registry does
  not list the project. Do NOT create a second entry — reconcile
  by re-reading the document set under `docs/` first.
- **Stale phase state**: cross-check the latest handoff in
  `docs/handoffs/`. The handoff is the source of truth.
- **Suspected unsafe state**: stop, do not delete files, and
  consult the operator before any cleanup.

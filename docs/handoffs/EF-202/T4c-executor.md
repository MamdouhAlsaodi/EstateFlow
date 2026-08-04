# Role Report — EF-202/T4c Security Correction

## Status
PASS

## Authorization and scope
The execution packet explicitly authorized the frontend-only EF-202/T4c security correction. Changes were limited to the approved web API-client, lead feature, web test, and this handoff artifact paths. No API/server/schema/UI outside the lead board, dependencies, commit, push, or deploy changes were made.

## Implemented behavior
- Mutation `401`, `403`, and CSRF-coded rejections are classified as a dedicated safe CSRF/session state with precedence over generic mutation authorization states.
- The mutation rejection path clears only the closure-held CSRF token through `SessionCsrfProvider.clear()` before storing the safe action error.
- No automatic mutation retry is performed after rejection.
- The dedicated state offers an explicit Arabic session revalidation action. That user action calls `getToken()` and reacquires a token; it does not retry the rejected mutation.
- Read/list `401` and `403` responses retain their existing unauthorized/forbidden states.

## Changed paths
- `apps/web/src/features/leads/lead-board-model.ts`
- `apps/web/src/features/leads/lead-board.tsx`
- `apps/web/src/test/api-client.test.ts`
- `apps/web/src/test/leads-board.test.ts`
- `docs/handoffs/EF-202/T4c-executor.md`

## Focused test evidence
- Mutation error precedence distinguishes safe CSRF/session state from read authorization states.
- CSRF-coded rejection classification is covered.
- Session provider tests prove the in-memory token is cleared and a later explicit `getToken()` action makes a fresh session request.
- Lead-board source assertions cover token clearing, dedicated state, explicit reacquisition, and absence of retry logic.

## Required verification
Command:
```text
source ~/.nvm/nvm.sh && cd /home/server/projects/estateflow && pnpm --dir apps/web run lint && pnpm --dir apps/web run typecheck && pnpm --dir apps/web run test && API_ORIGIN=http://127.0.0.1:3001 pnpm --dir apps/web run build && git diff --check
```

Evidence:
- Web lint: exit 0.
- Web typecheck: exit 0.
- Web test: 23 passed, 0 failed.
- Web build: exit 0; lead organization route compiled successfully.
- `git diff --check`: exit 0.

No staging, commit, push, deploy, or follow-up task was performed or implied.

## Next human decision
Accept this bounded frontend security correction. Any assurance, publication, or additional repair requires a separate approved packet.

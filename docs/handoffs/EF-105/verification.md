# EF-105 Verification

## Verdict

**PASS** — EstateFlow now has a runnable Arabic-first App Router shell and a reusable design-token foundation, without adding domain workflows or server/data coupling.

## Delivered

- `@estateflow/design-tokens` workspace package:
  - semantic colors, spacing, radii, Arabic and numeric type roles;
  - CSS custom-property contract consumed by the web root layout;
  - regression tests for the financial gold token and structural token scale.
- Next.js App Router foundation under `apps/web/src/app`:
  - Arabic document semantics: `lang="ar"`, `dir="rtl"`;
  - `/` redirects to `/ar`;
  - responsive owner-workspace shell and Arabic navigation;
  - static design-system demo for typography, financial metrics, statuses, controls, table, empty state, loading state, error state, and custom Arabic not-found state;
  - semantic landmarks, skip link, accessible names for icon-only controls, focus-visible styling, and reduced-motion handling.
- `apps/web` now uses `next build` rather than a TypeScript-only placeholder build.

## Design decisions

- The shell follows the approved calm operational-cockpit direction: light neutral canvas, deep navy for trust, restrained teal for operational movement, and gold reserved for financial/deal meaning.
- All visible records and figures are synthetic demo content. The shell deliberately states that it has no live operational connection.
- No API, Prisma, database, authentication, authorization, domain model, or external provider was introduced.

## Visual/runtime evidence

Production server: `next start` bound to `127.0.0.1:39002` during verification only.

| Evidence                             | Result                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `evidence/desktop-production.png`    | Arabic desktop shell rendered at 1280px; `lang=ar`, `dir=rtl`; document `scrollWidth=1265` within `innerWidth=1280`.       |
| `evidence/mobile-360-production.png` | Arabic shell rendered at 360×900 CSS pixels; `scrollWidth=345` within `innerWidth=360`; no page-level horizontal overflow. |
| `/not-a-route`                       | Custom Arabic not-found page rendered with a labelled return action.                                                       |

A visual regression surfaced during mobile verification: the table's intentional minimum width escaped its panel and expanded the page. It was fixed by setting `min-width: 0` on grid-card primitives and constraining `.table-scroll`; the table remains internally scrollable while the document no longer overflows.

## Canonical verification

All commands ran from `/home/server/projects/estateflow` using Node `v24.14.1` and pnpm `10.33.2`:

```text
pnpm install --frozen-lockfile  PASS
pnpm lint                       PASS
pnpm typecheck                  PASS
pnpm test                       PASS
pnpm test:integration           PASS
pnpm build                      PASS
pnpm format:check               PASS
```

Additional focused proof:

```text
pnpm --filter @estateflow/design-tokens test  PASS (2/2)
pnpm --filter @estateflow/web typecheck       PASS
pnpm --filter @estateflow/web build           PASS
```

`pnpm test:integration` used only the EF-102 isolated test PostgreSQL instance. The destructive guard accepted `estateflow_test` on loopback port `55433`; no local production-like database was targeted.

## Scope and safety audit

- Baseline checksum compared before and after EF-105.
- No deletion, commit, push, deployment, public listener, secret, real customer data, or API/data-layer edit.
- The temporary web server, screenshot Chromium process, and EF-102 test containers/volumes are stopped after verification.

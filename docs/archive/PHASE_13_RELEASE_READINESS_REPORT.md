# Phase 13 — Release Readiness Report

## Scope

Phase 13 addresses repository-only release gates: the dashboard lint error,
dedicated session signing, environment documentation, app-specific Playwright
smokes, migration/backup/staging/monitoring runbooks, and a consolidated release
checklist. No migration command, remote database write, secret value, or
authenticated user workflow was performed.

## Changes made

- [Dashboard page](src/app/(subsystems)/info/user/dashboard/page.js): deferred
  mount recommendation loading and external interests-event state updates until
  microtasks, removing the
  `react-hooks/set-state-in-effect` effect body trigger without changing the
  route, recommendation fetch, or interests behavior.
- [Server auth](src/lib/serverAuth.js): `SESSION_SECRET` is used when present;
  `SUPABASE_SERVICE_ROLE_KEY` remains the fallback and emits a server-side
  warning. Switching from the fallback to a dedicated secret changes session
  signatures and may invalidate currently issued app-session cookies. This
  rollout impact must be accepted explicitly before production configuration
  changes. Existing cookies continue to work when the fallback is retained.
- [Auth tests](src/lib/authSecurity.test.js): added dedicated-secret and
  service-role-fallback unit coverage, including fallback warning assertions.
- [.env.example](.env.example): added placeholder-only variable names with
  required/optional and public/server-only labels for Supabase, SendGrid,
  VAPID, moderation, GIF, weather/geocoding, site URLs, cron, and session
  signing.
- [.gitignore](.gitignore): allows `.env.example` while continuing to ignore
  real environment files.
- [Playwright config](playwright.config.js): configured production server
  startup, `http://127.0.0.1:3000`, Chromium-only execution, and reuse of an
  existing server.
- [Playwright smoke tests](tests/connect-daet.smoke.spec.js): replaced starter
  tests with visitor home, tourist directory/category, auth pages,
  unauthenticated protected APIs, and tourist detail loading checks.
- Runbooks and checklist:
  [migration reconciliation](docs/migration-reconciliation.md),
  [staging test plan](docs/staging-test-plan.md),
  [backup/restore runbook](docs/backup-restore-runbook.md),
  [monitoring plan](docs/monitoring-plan.md),
  [release checklist](docs/release-checklist.md).

No file in `supabase/migrations/` was created, edited, renamed, populated, or
deleted.

## Validation

### `npm.cmd test`

- **Pass:** 278 tests, 0 failures.

### `npm.cmd run lint`

- Before: **1 error, 150 warnings**.
  The remaining error was `react-hooks/set-state-in-effect` in the dashboard
  at `src/app/(subsystems)/info/user/dashboard/page.js:789`.
- After: **0 errors, 150 warnings**.
- The before/after warning count is unchanged. The lint command passes; ESLint
  exits with no errors.

### `npm.cmd run build`

- **Pass:** production build compiled and generated all 133 static pages.

### `npx.cmd playwright test`

- **Pass:** 5 Chromium tests, 0 failures.
- The public and auth page checks, category URL change, protected API 401
  checks, and tourist detail branch ran without submissions or database writes.
- The tourist detail test reached HTTP 200 and did not detect
  “Loading destination…” during the sampled run. The underlying data request
  and live Supabase response remain **inconclusive** without a stable staging
  or hosted Supabase connection.

### `git diff --check`

- **Pass:** no whitespace errors. Git emitted line-ending replacement warnings
  for existing LF/CRLF worktree files; these did not produce diff-check failures.

## What is still blocked and who must unblock it

- **Database/release owner:** reconcile the exact local 118 versus remote
  147-152 mismatch, the duplicate 080/081 pair, and ten empty migrations.
  Use the read-only reconciliation checklist before any write command.
- **Vercel/deployment owner:** verify production environment scopes and values,
  domain/Auth callbacks, cron secrets/execution, and the live deployment.
- **Supabase/backup owner:** verify the hosted migration catalog, RLS, recent
  backup, private `admin-backups` bucket, managed backup retention, and restore
  drill on a disposable database.
- **Operations/monitoring owner:** configure and verify error tracking,
  uptime, slow-query, failed-auth, and Realtime monitoring.
- **Product/privacy and database owners:** approve the staging role matrix
  findings for profiles, shares, vote rows, and generic interaction tables.
- **QA owner:** execute authenticated staging workflows and RLS tests with
  disposable accounts. Repository smoke tests do not replace staging or
  production verification.

## Remaining risks

- The migration mismatch remains unresolved and is a deployment blocker.
- A dedicated `SESSION_SECRET` rollout may invalidate sessions signed by the
  previous service-role fallback; treat this as an explicit deployment decision.
- Supabase RLS findings are source-migration observations, not live-catalog
  verification.
- Production providers and credentials remain unverified.
- Backups and restore have only implementation/runbook evidence; neither a
  restore nor a live backup run was completed here.
- Monitoring recommendations are not configured or measured.
- Tourist detail behavior remains inconclusive for the underlying data request.
- There is no measured Core Web Vitals, API/database latency, or payload baseline.

The project remains **not production-ready** until the migration mismatch,
production environment, backup/restore, monitoring, and staging tests are
verified externally.

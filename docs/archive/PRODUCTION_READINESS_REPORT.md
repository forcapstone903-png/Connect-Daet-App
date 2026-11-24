# Phase 12 — Production Readiness and Deployment Report

## Status

**Not production-ready for release.** The fresh production build and local read-only smoke checks passed, but migration history is inconsistent, production environment/deployment settings cannot be inspected from this workspace, and live backup, restore, monitoring, and staging checks are unverified. No deployment or database write was performed.

## Environment and service configuration

Secret values were not read or included in this report.

- `.env.local` exists locally and is ignored by `.gitignore`. The Supabase URL, anon-key, and service-role-key variable names are present in that local file. This only establishes local name presence; no values were validated and no production environment settings were inspected.
- A dedicated local `SESSION_SECRET` and `CRON_SECRET` were not present by name. Server auth has a service-role-key fallback for signing, while all scheduled job routes require `CRON_SECRET` to be at least 32 bytes. Production Vercel values and scopes remain unknown.
- SendGrid, moderation, GIF, weather, site URL, and VAPID-related variables are referenced by application code. Provider credentials, sender verification, quotas, and production values were not tested.
- `supabase/config.toml` configures localhost Auth URLs and SendGrid SMTP for local development. The hosted Supabase Auth callback allowlist, SMTP settings, and production site URL were not verified.
- The service-role key is referenced by server-side modules and is not named with a `NEXT_PUBLIC_` prefix. A production deployment bundle inspection was not performed.

## Build and local production smoke checks

- `npm.cmd run build` — **passed**. Turbopack compiled successfully, TypeScript completed, and all 133 static pages were generated.
- Local production-server GET checks:
  - `/info/visitor`, `/info/login`, `/info/visitor/tourist-spots` — HTTP 200.
  - `/info/api/admin/analytics`, `/info/api/user/feed` — HTTP 401 without a session.
  - `/info/api/cron/backups`, `/info/api/cron/account-deletions` — HTTP 401 without the cron authorization header.
- These checks used the local production build only. They do not prove a live deployment is serving these routes.
- The build output confirms routes and static-page generation; there is no bundle analyzer configured, so bundle-size analysis was not completed.
- The last full ESLint run recorded in the Phase 11 report failed with one existing error and 150 warnings. It was not rerun here; the production build does not resolve that lint gate.

## Migration and database deployment status

`npx.cmd supabase migration list --linked` was run read-only on 2026-11-22. It reconfirmed:

- Local migration `118` has no linked remote history entry.
- Remote migrations `147`–`152` have no corresponding SQL files in the repository.
- Local migrations otherwise matched remote history through `146`.

This is a release blocker. The repository also documents identical SQL in migrations `080` and `081`, both recorded remotely. No migration was applied, repaired, rewritten, or deleted. Do not run `db push`, migration repair, or production reset until the database/release owner supplies and reconciles the authoritative `147`–`152` SQL and the missing `118` status across environments.

No staging database, deployed RLS policies, production functions, query plans, or live schema was inspected. Local migration presence is not evidence that a migration has been applied.

## Deployment and environment platform

- `vercel.json` indicates Vercel Cron configuration for account deletions, admin messages, scheduled backups, and moderation lifecycle.
- No local `.vercel` project metadata or deployment workflow was found. The connected Vercel project, production domain, build settings, branch promotion rules, environment scopes, and latest deployment status could not be verified.
- No staging deployment was identified or tested. No production deployment was initiated.

## Monitoring

- The application has internal site analytics and an admin system-health endpoint; these are not evidence of external alerting or production observability.
- No Sentry/error-tracking or APM integration was found in the repository dependencies/source scan.
- Vercel runtime logs, Supabase database alerts/slow-query monitoring, authentication failure alerts, Realtime health monitoring, uptime checks, and notification destinations were not accessible for verification.

## Backup and recovery

- Repository configuration schedules `/info/api/cron/backups` daily at 01:00 UTC. The route requires a `CRON_SECRET` bearer token. Its implementation performs retention cleanup on non-Sundays and creates scheduled snapshots on Sundays.
- Migration `095` defines a private `admin-backups` Storage bucket and backup run/settings tables. The backup service snapshots a fixed set of application tables and, when enabled, copies configured media buckets. The default retention in the migration is seven days; the data snapshot limit is 50 MiB.
- Backup configuration and implementation are present in source, but the live bucket privacy, enabled setting, last successful backup, Vercel Cron execution history, retention outcome, and managed Supabase backup plan were not verified.
- Restore code/schema exists, but no documented operational restore runbook or restore drill against a disposable/staging database was verified. Do not consider backups proven until an actual snapshot is checked and restored in staging.

## Known issues and release gates

1. **Migration history mismatch:** reconcile local `118` and remote-only `147`–`152` using authoritative release artifacts before any migration deployment.
2. **Production environment:** verify required values in Vercel and hosted Supabase without exposing them; especially `CRON_SECRET`, session signing, service-role isolation, production site URL, Auth callback URLs, SMTP, and provider credentials.
3. **Backups:** verify cron execution and private bucket settings, inspect a recent successful run, and complete a staging restore drill. Confirm external database and Storage backup/retention policies.
4. **Monitoring:** configure and test application error alerts, uptime checks, API/database latency alerts, failed-auth visibility, and Realtime health monitoring.
5. **Lint:** resolve the existing lint error and review warnings before treating CI quality gates as green.
6. **Staging/post-deploy checks:** exercise authentication, user/admin/moderator workflows, messaging, notifications, tourism details, and mobile layouts against staging with test accounts. No production data was changed in this assessment.

## Commands executed

- `npm.cmd run build`
- `npx.cmd supabase migration list --linked` (read-only)
- Local production-server GET checks for public pages, protected APIs, and cron routes without credentials
- Environment-variable-name inventory and `.gitignore` check; secret values were not read

## Changes made

Only this report was added. No application code, credentials, migrations, production data, or deployment settings were changed.

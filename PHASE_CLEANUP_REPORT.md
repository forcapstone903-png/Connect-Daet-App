# Phase Cleanup Report

## Scope

This cleanup operated on a new `chore/file-cleanup` branch. It preserved the
pre-existing dirty worktree and did not stash or commit unrelated changes.

Only approved ARCHIVE actions were executed. No DELETE, source, migration,
configuration, public asset, environment, or script file was changed.

## Files archived

The following historical reports and superseded Supabase documents were moved
with `git mv` into `docs/archive/`:

- `ADMIN_DASHBOARD_OPTIMIZATION_REPORT.md`
- `ADMIN_SYSTEM_AUDIT.md`
- `API_BACKEND_ARCHITECTURE_REPORT.md`
- `DATABASE_OPTIMIZATION_REPORT.md`
- `DUPLICATES_REPORT.md`
- `PHASE_13_RELEASE_READINESS_REPORT.md`
- `PRODUCTION_READINESS_REPORT.md`
- `QUALITY_ASSURANCE_REPORT.md`
- `SOCIAL_REALTIME_OPTIMIZATION_REPORT.md`
- `TOURISM_DISCOVERY_REPORT.md`
- `UI_UX_RESPONSIVE_ACCESSIBILITY_REPORT.md`
- `USER_DASHBOARD_OPTIMIZATION_REPORT.md`
- `SUPABASE_IMPLEMENTATION.md`
- `SUPABASE_COMPLETE_SUMMARY.md`
- `SUPABASE_FILES_INDEX.md`
- `recommendation.md`

## Files deleted

None. The approved manifest decision was ARCHIVE only.

## Files kept

Protected documentation and Phase 13 runbooks/checklists were preserved.
Referenced operational documents including caching, alerts, notification,
places, analytics, settings, user guide, visitor, and push documentation remain
in place.

Manuscript files and duplicate-looking `(1)` artifacts were not changed.
The `(1)` questionnaire and response workbook remain unclassified pending
content comparison or explicit owner decision.

## Link fixes

The archived superseded Supabase documents had their canonical setup-guide link
updated from `./SUPABASE_SETUP.md` to `../../SUPABASE_SETUP.md`.

No inbound links to the archived root reports or recommendation were found,
so no README or docs link required updates.

## Validation

### Archive batch

- `npm.cmd test`: pass, 278 tests, 0 failures.
- `npm.cmd run lint`: pass, 0 errors, 150 warnings. This is unchanged from the
  Phase 13 lint baseline.
- `npm.cmd run build`: pass, 133 static pages generated.
- `git diff --check`: pass.

## Commit

The archive batch is staged and committed separately after validation.

## Left for later

- Generated/junk tracked logs and route inventories were not deleted.
- The two manuscript `(1)` artifacts require owner decision.
- Knip candidates and empty source/migration placeholders remain untouched.
- Migration `118`, remote-only `147`-`152`, duplicate `080`/`081`, and the ten
  empty migrations remain unresolved as externally verified release items.

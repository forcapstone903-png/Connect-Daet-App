# Cleanup Manifest

Status: **Awaiting user approval. No files have been deleted or moved.**

This manifest applies only to documentation and generated/junk files at the
repository root and under `docs/`. It excludes protected documentation,
`supabase/migrations/**`, `node_modules`, `.git`, environment files, source,
configuration, public assets, and scripts.

## Audit scope summary

- Branch: `chore/file-cleanup`
- Existing worktree changes were preserved. No stash or commit was created.
- The inventory and reference checks found no runtime `fs` read, import,
  module import, static fetch, package script, Vercel setting, or public asset
  reference for the proposed DELETE or ARCHIVE candidates.
- The Duplication Audit explicitly found no source or migration file safe to
  delete from static analysis alone.

## DELETE

| Candidate | Size | Git | Last commit | Description and reason | Reference hits / inbound links |
|---|---:|---|---|---|---|
| `admin_pages_list.txt` | 2,742 | tracked | 2026-11-07 | Generated route inventory; stale generated scratch data. | No hits in code, scripts, package, Vercel, GitHub, README, docs, or candidate docs. |
| `automated-test-logs.txt` | 41,328 | tracked | 2026-11-19 | Captured automated test output. | No hits. |
| `build.log` | 9,972 | tracked | 2026-09-11 | Captured build output. | No hits. |
| `dev-server.log` | 28,039 | tracked | 2026-09-05 | Captured development-server output. | No hits. |
| `diff_sample.txt` | 1,823 | tracked | 2026-09-05 | Historical diff sample. | No hits. |
| `lint_baseline.txt` | 68,583 | tracked | 2026-09-18 | Historical lint output. | No hits. |
| `profile_id_diff.txt` | 114,990 | tracked | 2026-09-18 | Historical profile route diff. | No hits. |

`dev-server.log` actual size is 28,039 bytes.

## ARCHIVE

Move to `docs/archive/` with `git mv` after approval. Historical reports retain
context but do not belong at repository root. `git mv` will preserve history.

| Candidate | Size | Git | Last commit | Description | Reference hits / inbound links to update |
|---|---:|---|---|---|---|
| `ADMIN_DASHBOARD_OPTIMIZATION_REPORT.md` | 2,060 | untracked | never committed | Phase 7 admin dashboard optimization report. | No inbound links found. Move only. |
| `ADMIN_SYSTEM_AUDIT.md` | 17,093 | tracked | 2026-11-07 | Static admin audit and remediation report. | `AGENTS.md` and `src/app/(subsystems)/info/user/settings/page.js`? No, the reference hit for `docs/caching.md` was separate. No link to this file found. |
| `API_BACKEND_ARCHITECTURE_REPORT.md` | 4,562 | untracked | never committed | Phase 5 API/backend architecture report. | No inbound links found. |
| `DATABASE_OPTIMIZATION_REPORT.md` | 13,453 | untracked | never committed | Phase 3 database optimization report. | No inbound links found. |
| `DUPLICATES_REPORT.md` | 42,258 | untracked | never committed | Duplication audit and cleanup guidance. | Its text mentions Supabase docs and source paths, but no other document links to this file. No inbound Markdown link. |
| `PHASE_13_RELEASE_READINESS_REPORT.md` | 5,747 | untracked | never committed | Repository phase 13 release-readiness report. | No inbound links found. |
| `PRODUCTION_READINESS_REPORT.md` | 7,212 | untracked | never committed | Phase 12 production-readiness report. | No inbound links found. |
| `QUALITY_ASSURANCE_REPORT.md` | 5,694 | untracked | never committed | Phase 11 testing and QA report. | No inbound links found. |
| `SOCIAL_REALTIME_OPTIMIZATION_REPORT.md` | 5,047 | untracked | never committed | Phase 9 realtime/social optimization report. | No inbound links found. |
| `TOURISM_DISCOVERY_REPORT.md` | 4,035 | untracked | never committed | Phase 8 tourism/discovery report. | No inbound links found. |
| `UI_UX_RESPONSIVE_ACCESSIBILITY_REPORT.md` | 2,874 | untracked | never committed | Phase 10 UI/UX/accessibility report. | No inbound links found. |
| `USER_DASHBOARD_OPTIMIZATION_REPORT.md` | 3,536 | untracked | never committed | Phase 6 user dashboard optimization report. | No inbound links found. |
| `SUPABASE_IMPLEMENTATION.md` | 280 | tracked | 2026-11-07 | Marked superseded; points only to canonical `SUPABASE_SETUP.md`. | Only filename mention in `DUPLICATES_REPORT.md`; no application/runtime reference. Moving to archive requires no live documentation link update. |
| `SUPABASE_COMPLETE_SUMMARY.md` | 223 | tracked | 2026-11-07 | Marked superseded; historical Supabase overview. | Only filename mention in `DUPLICATES_REPORT.md`; no application/runtime reference. |
| `SUPABASE_FILES_INDEX.md` | 227 | tracked | 2026-11-07 | Marked superseded; historical Supabase file index. | Only filename mention in `DUPLICATES_REPORT.md`; no application/runtime reference. |
| `recommendation.md` | 9,976 | tracked | 2026-11-10 | Historical system recommendations and verification gaps. | No inbound links found. |

## KEEP

| Candidate | Size | Git | Last commit | Description and reason |
|---|---:|---|---|---|
| `docs/alerts.md` | 2,901 | tracked | 2026-11-12 | Real-time alerts setup; referenced by source comments and migration 098. |
| `docs/caching.md` | 75,876 | tracked | 2026-11-20 | Canonical caching standard; referenced by `AGENTS.md`, source comments, and `SUPABASE_SETUP.md`. Protected by user instructions only partially? It is a core doc and remains in normal documentation scope. |
| `docs/hybrid-post-moderation.md` | 3,757 | tracked | 2026-11-19 | Hybrid moderation behavior; linked by feature map and caching docs. |
| `docs/notification-delivery.md` | 5,686 | tracked | 2026-11-19 | Notification delivery operations; linked by README and feature map. |
| `docs/places-directory.md` | 6,924 | tracked | 2026-11-12 | Places/events documentation; linked by feature map. |
| `docs/site-visit-analytics.md` | 4,655 | tracked | 2026-11-12 | Analytics/privacy documentation; linked by README and feature map. |
| `docs/source-code-excerpts.md` | 11,673 | tracked | 2026-11-19 | Source-code appendix; no runtime reference, but it has historical/study value. |
| `docs/user-guide.md` | 15,760 | tracked | 2026-11-19 | Product user guide; linked by README and feature map. |
| `docs/user-settings.md` | 14,382 | tracked | 2026-11-19 | User settings and cache behavior; linked by README/source comments/feature map. |
| `docs/visitor-page.md` | 2,108 | tracked | 2026-09-18 | Visitor behavior documentation; linked by README and feature map. |
| `docs/web-push-vite-setup.md` | 6,989 | tracked | 2026-11-07 | Push setup notes; explicitly linked by README and marked with Vite/Next.js caveats. |
| `docs/manuscript/Connect-Daet-Capstone-Manuscript-v6.pdf` | 1,470,845 | tracked | 2026-11-12 | Canonical-looking latest manuscript PDF; no duplicate evidence confirms removal. |
| `docs/manuscript/Connect-Daet-Capstone-Manuscript-v6.docx` | 1,600,025 | tracked | 2026-11-12 | Canonical-looking latest manuscript DOCX; no duplicate evidence confirms removal. |
| `docs/manuscript/Connect-Daet-Capstone-Manuscript-v3.docx` | 1,387,971 | tracked | 2026-11-12 | Earlier manuscript; historical value. |
| `docs/manuscript/04 FORMS 0 Template Manuscript Capstone Project.doc` | 124,416 | tracked | 2026-11-12 | Source/template artifact; historical value. |

Protected Phase 13 files and protected documentation are not candidates.

## NEEDS MY DECISION

| Candidate | Size | Git | Last commit | Description and reason |
|---|---:|---|---|---|
| `docs/manuscript/Daet_Tourist_Information_Usability_Evaluation_Questionnaire (1).docx` | 34,432 | tracked | 2026-11-12 | Duplicate-looking questionnaire with `(1)` suffix. It may be a separate response artifact or accidental copy; content comparison was not performed. |
| `docs/manuscript/DAET TOURIST INFORMATION SURVEY (Responses) (1).xlsx` | 14,777 | tracked | 2026-11-12 | Duplicate-looking survey response workbook with `(1)` suffix. It may contain unique submissions or be a separate export. |

No other root or docs `.md`, `.txt`, `.log`, `.bak`, `.old`, `.tmp`, `.orig`,
screenshot, or scratch candidate remained after exclusions.

## Approved execution is required

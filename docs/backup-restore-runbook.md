# Backup and restore runbook

**Every operation below is UNVERIFIED until it is executed by an authorized release/database owner.** The project remains blocked until backup and restore evidence exists.

## Verify a recent backup run

- [ ] **UNVERIFIED** — Confirm the scheduled `/info/api/cron/backups` job is active in Vercel.
- [ ] **UNVERIFIED** — Confirm `CRON_SECRET` is present in the server environment and not exposed publicly.
- [ ] **UNVERIFIED** — Open Supabase/Vercel execution history and locate the latest successful run.
- [ ] **UNVERIFIED** — Record run time, success status, snapshot type, table count, object count, and retention result.
- [ ] **UNVERIFIED** — Inspect run metadata without printing secret values.
- [ ] **UNVERIFIED** — Verify the managed Supabase backup schedule and retention policy separately.

## Verify private backup storage

- [ ] **UNVERIFIED** — Confirm bucket `admin-backups` exists.
- [ ] **UNVERIFIED** — Confirm the bucket is private, not public.
- [ ] **UNVERIFIED** — Verify read/download access requires authorized server/admin checks.
- [ ] **UNVERIFIED** — Test that an anonymous URL or anon request cannot enumerate or download objects.
- [ ] **UNVERIFIED** — Confirm lifecycle/retention settings match the approved policy.

## Disposable restore drill

1. Obtain a fresh disposable Supabase project or staging database approved for data restoration.
2. Obtain a recent restore-eligible snapshot from the backup owner.
3. Import into the disposable project using the Supabase-supported restore workflow.
4. Verify only the minimum restore scope needed for the drill.
5. Run schema, table-count, RLS-policy, Storage-bucket, Auth-identity, and application smoke checks.
6. Confirm a user-visible read and a safe staging-only write.
7. Verify backup media/object restoration without contacting production.
8. Record duration, missing records, policy differences, failures, and the responsible owner.
9. Destroy or reset the disposable database after the evidence is captured.
10. Do not run the restore workflow against production.

## Evidence

- Verified by:
- Date:
- Supabase project/environment:
- Snapshot identifier:
- Restore duration:
- Result:

# Migration reconciliation runbook

**Release status: UNVERIFIED.** No migration write or remote database query is authorized by this document.

## Known discrepancy

The repository and read-only linked history differ as follows:

| Item | Local repository | Linked remote history | Status |
|---|---:|---:|---|
| Migration count | 118 migration entries observed by ID through the reported baseline | Remote history IDs 147-152 exist without local SQL | Mismatch |
| Missing local migration | `118` has no matching remote history entry | Not represented remotely | Unverified |
| Remote-only migrations | No SQL | `147`, `148`, `149`, `150`, `151`, `152` | Unverified |
| Identical pair | `080_blog_admin_approval.sql` and `081_blog_admin_approval.sql` are byte-identical | Both IDs appear remotely | Review pair only |
| Empty migrations | `122`, `123`, `124`, `125`, `126`, `132`, `137`, `138`, `139`, `144` | Same ten IDs appear remotely | Preserve |

Do not infer the SQL for remote-only IDs from a database name or create/repair migration entries.

## Read-only comparison procedure

1. Record the Supabase project reference and environment owner.
2. Run `npx supabase migration list --linked`. It is read-only.
3. Capture the command output, project reference, and date. Redact project secrets and all connection strings.
4. For each local migration, compare the numeric ID and filename with the remote list.
5. Obtain the authoritative SQL and deployment records for remote-only `147`-`152` from the release/database owner.
6. Confirm whether migration `118` was renamed, merged, never deployed, or deployed under a nonnumeric/repair entry.
7. Reconcile the ten empty files against remote history; do not delete or populate them solely to make counts match.
8. Confirm that `080` and `081` are intentional identical applications or duplicate records, then identify the authoritative deployment record.
9. Compare a staging schema dump and RLS policy catalog against the checked-in migrations only after a staging project is available.

No step above repairs, pushes, resets, or rewrites a migration.

## Release-owner decision checklist

- [ ] Database owner supplied the authoritative migration source and deployment history.
- [ ] All local and remote IDs are mapped one-to-one or a written exception is approved.
- [ ] Remote-only `147`-`152` SQL is reviewed and stored without guessing.
- [ ] Migration `118` status is explained across every environment.
- [ ] `080` and `081` duplicate handling is approved.
- [ ] Ten empty migrations are approved to remain unchanged.
- [ ] Staging migration history matches the reconciled plan.
- [ ] Staging schema and RLS catalog checks pass.
- [ ] Final migration deployment plan is approved before any write command.

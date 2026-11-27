# Supabase workspace

The root [Supabase operations guide](../SUPABASE_SETUP.md) is the canonical
source for local setup, environment variables, migration safety, and validation.
Read its migration-history warning before attempting to apply database changes.

## Contents

- `config.toml` — local Supabase CLI configuration.
- `migrations/` — ordered database migrations; inspect these files directly for
  schema and RLS definitions.
- `queries/` — reference SQL queries; review before execution.
- `functions/` — Supabase Edge Functions, including push delivery.
- `templates/` — email templates used by the project.

Check linked migration status with `npx supabase migration list --linked`.
Listing is read-only. Do not push or repair migration history until local and
remote IDs have been reconciled as described in the canonical guide.

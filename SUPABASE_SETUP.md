# Supabase operations guide

This is the canonical Supabase setup and operations guide for Connect Daet. The
repository's SQL migrations are the source of truth for schema and policy
changes; this guide intentionally does not duplicate their table or function
definitions.

## Repository layout

- `supabase/config.toml` — local Supabase CLI configuration. Migrations are
  enabled; sample-data seeding is disabled.
- `supabase/migrations/` — ordered SQL migration files. The checked-in files
  currently span IDs `001` through `146` with a gap at `019`; the migration
  directory, not an older documentation list, is authoritative.
- `supabase/queries/common_operations.sql` — SQL reference queries; review each
  query before running it.
- `supabase/functions/push/` — the push-notification Edge Function and its
  documentation.

## Current migration-history warning

The linked project was inspected read-only with `supabase migration list
--linked` on 2026-11-21. Its history does **not** match the checked-in
migrations:

- Local migration `118` is present in the repository but has no corresponding
  remote history entry.
- Remote history includes migrations `147`–`152`, but this repository contains
  no SQL files for those IDs.
- Migrations `080` and `081` have identical SQL and both appear in remote
  history.
- Ten checked-in migration files are zero bytes and also appear in remote
  history: `122`, `123`, `124`, `125`, `126`, `132`, `137`, `138`, `139`, and
  `144`.

**Do not run `supabase db push`, migration repair, or a production reset while
these differences are unresolved.** Do not recreate the missing `147`–`152`
SQL from names or database guesses, and do not rewrite or delete an applied
migration. Ask the database/release owner for the authoritative migration
source and deployment records, reconcile every environment, and review the
resulting plan before any write operation.

To re-check status without applying migrations:

```sh
npx supabase migration list --linked
```

The command lists local and linked-project migration IDs. It does not repair or
apply them.

## Local development

Install the repository's locked dependencies with `npm ci`. If Docker and the
Supabase CLI are available, start the local Supabase services and inspect their
status:

```sh
npx supabase --version
npx supabase start
npx supabase status
```

Do not use a linked/production database for local experimentation. The local
seed configuration is disabled, and the repository does not define the old
sample-data workflow described in superseded guides. Do not insert an admin
user directly or paste credentials into SQL.

## Application configuration

Configure these values in a local, untracked environment file such as
`.env.local`; never add real values to source control:

| Variable | Use |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL used by the app and server routes. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public/anon key used by the browser Supabase client. |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server-side operations only. Never expose it to browser code or `NEXT_PUBLIC_*` variables. |
| `NEXT_PUBLIC_APP_URL` | Optional public app URL used when constructing links; the server helper has environment-specific fallback behavior. |

`src/lib/supabase.js` creates the browser client with the anon key. Server
routes and `src/proxy.js` contain privileged server-side Supabase operations.
Keep authorization checks in place and rely on the current database policies;
never use a service-role key to bypass a missing user permission check.

## Schema and storage changes

1. Inspect the existing migration files and their predecessors before proposing
   a database change.
2. Add a new, uniquely numbered migration only after the history mismatch above
   is reconciled and the SQL is reviewed.
3. Keep schema, RLS policy, trigger, function, and storage changes in reviewed
   migrations. Do not assume bucket names, tables, functions, or policies from
   an old guide.
4. Validate the migration against a disposable local database or staging
   environment first. Never edit production data as part of setup.
5. Before deployment, compare `supabase migration list --linked` with the
   expected release and obtain approval for any missing or remote-only IDs.

## Validation

Run the application checks from the repository root:

```sh
npm test
npm run lint
npm run build
```

For Supabase changes, also review the SQL diff, migration history, RLS behavior,
and affected API routes in a non-production environment. A successful Next.js
build does not validate SQL or database permissions.

## Related documentation

- [Feature and file map](./docs/feature-file-map.md)
- [Supabase directory overview](./supabase/README.md)
- [Role-based access control](./docs/rbac.md)
- [Caching standards](./docs/caching.md)
- [Push Edge Function guide](./supabase/functions/push/README.md)

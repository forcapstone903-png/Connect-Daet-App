# API and Backend Architecture — Phase 5

## Scope

Static inspection covered the App Router API tree under
`src/app/(subsystems)/info/api/` (125 route files), shared server helpers, and
the route changes listed below. No production or staging API calls or database
operations were performed. Existing worktree changes from earlier phases and
the user were preserved.

## Baseline observations

- Server authentication and authorization have reusable foundations:
  `src/lib/serverAuth.js`, `src/lib/adminApiAuth.js`, and
  `src/lib/sessionVersions.js`. Individual route handlers still choose their
  own combination of session checks, role checks, and response behavior.
- `NextResponse.json` envelopes and error mappings are constructed in route
  handlers. Existing contracts differ (`success`, `message`, resource-specific
  keys, and status codes), so a blanket response-wrapper migration would risk
  breaking callers.
- Request validation is mostly route-specific. The upload route has
  destination, size, and content-signature checks; JSON routes apply their own
  parameter and body guards. No common schema-validation dependency is present
  in `package.json`.
- Supabase service-role initialization was repeated in several route modules.
  The six user/social routes changed in this phase used the same URL/key
  resolution and `createClient` pattern. The session-version helper repeated
  the same environment lookup but supplied explicit server auth options.
- Error handling and logging are likewise route-local. Existing
  `publicErrorMessage` and feature-specific helpers remain in use; no global
  error envelope or logger was introduced.

## Changes implemented

Added `src/lib/supabaseAdmin.js` with
`createSupabaseServiceRoleClient(options)`. It trims the existing environment
variables, returns `null` when the URL or service-role key is absent, and
passes optional Supabase client options through unchanged.

Updated the following handlers to use the factory, without changing route
URLs, authorization checks, query logic, response bodies, or status codes:

- `/info/api/users/[id]`
- `/info/api/users/[id]/follow`
- `/info/api/users/[id]/block`
- `/info/api/users/followers`
- `/info/api/users/following`
- `/info/api/search/users`

`src/lib/sessionVersions.js` now delegates service-role construction to the
same factory and retains its explicit non-persistent, non-refreshing server
auth configuration. The helper is imported only by server route/helper
modules, not client components.

Added `src/lib/supabaseAdmin.test.mjs` to verify missing configuration returns
`null` and valid configuration creates a client without making a network
request.

## Validation

- `npm test`: 270 passed, 0 failed.
- Targeted ESLint on the helper, test, session helper, and six migrated routes:
  passed with no reported errors or warnings.
- `npm run build`: succeeded; Next.js generated all 133 static pages and
  compiled the API routes.
- `git diff --check`: passed.

No endpoint contract snapshots or authenticated staging calls were run; the
tests and build verify the helper and compilation, not live API behavior.

## Remaining technical debt

1. The 125 route handlers still have route-specific validation, authorization,
   response, and error conventions. Inventory and contract tests should precede
   any broad standardization.
2. Service-role initialization remains varied outside the six migrated routes.
   Each candidate should be migrated only after its auth options, missing-env
   behavior, and runtime lifecycle are compared.
3. Pagination and payload limits vary by endpoint. Standardize these only with
   caller compatibility tests and explicit cursor/limit contracts.
4. Route-specific error messages and status codes need an endpoint contract
   matrix before introducing a shared response layer.
5. Authentication, role-boundary, IDOR, upload, and database/RLS behavior
   require staging integration tests; they were not exercised in this phase.

## Suggested next sequence

1. Add request/response contract tests for the highest-traffic and privileged
   route groups.
2. Migrate another small group of routes to shared initialization only where
   construction options and missing-config behavior are equivalent.
3. Extract validation or business services one domain at a time, retaining
   existing authorization and response contracts.
4. Add staging tests for role boundaries and pagination before changing
   behavior.

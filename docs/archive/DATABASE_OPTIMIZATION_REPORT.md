# Database and Supabase Optimization — Phase 3

## Scope and evidence

This report records the repository architecture before Phase 3 changes. It is
based on the checked-in SQL migrations, Supabase configuration, and application
query call sites. No database connection, production write, migration apply, or
query-plan capture was performed. Accordingly, the migration SQL describes the
repository's intended schema, not a verified live catalog.

The current worktree already contains unrelated Phase 1/2 and user changes.
Those changes were preserved.

## Architecture baseline

- `supabase/migrations/` contains 145 SQL files spanning migration IDs 001–146,
  with a gap at 019. A static scan found 99 distinct table names, repeated
  function/trigger definitions across repair migrations, and no `CREATE VIEW`
  or materialized-view definitions.
- The schema is organized around `info_*` application tables, the legacy
  `profiles` table, `user_*` social and account tables, generic `content_*`
  interaction tables, forum tables, and operational analytics/moderation
  tables. Primary keys are predominantly UUIDs; foreign keys are used for
  account-owned records. Generic `content_type/content_id` and report target
  pairs are polymorphic and therefore do not have ordinary foreign keys.
- The schema includes checks, unique constraints/indexes, RLS policies,
  `SECURITY DEFINER` functions, and row triggers. Notable write-side work
  includes comment synchronization/reward triggers, forum reply metrics, event
  attendance synchronization, notification/push bridges, and tourist-spot
  rating rollups.
- There are parallel representations which should be treated as compatibility
  or migration history until their consumers are reconciled: `info_users` and
  `profiles`; `follows` and `user_follows`; `info_comments` and
  `content_comments`; and `notifications` and `info_notifications`. Migrations
  012/036 synchronize blog comments between the two comment tables.
- The browser client in `src/lib/supabase.js` uses the public anon key. Server
  routes and `src/proxy.js` contain service-role operations. Those routes must
  continue to enforce session/role/ownership checks because service-role
  requests bypass RLS.

### Migration/deployment constraint

The canonical [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) records a read-only
linked-history check from 2026-11-21: local migration 118 was absent remotely;
remote IDs 147–152 had no checked-in SQL; 080/081 were identical and both in
remote history; and ten zero-byte local files also appeared remotely. This
status was not re-queried for this audit. The ten empty files are 122–126,
132, 137–139, and 144. Do not push, repair, reset, delete, or rewrite
migrations until the authoritative release history is reconciled.

The two populated files `080_blog_admin_approval.sql` and
`081_blog_admin_approval.sql` are byte-identical. Repair migrations also
repeat `IF NOT EXISTS` index statements. Separately, migrations 100 and 103
declare differently named indexes on the same `info_audit_log(created_at
DESC)` key; if both ran, those are physically redundant indexes and add write
and storage cost. The live catalog must be checked before any cleanup.

## Query-path findings

| Area | Evidence in application code | Assessment / next step |
|---|---|---|
| Profiles | `/info/api/profile` selects a bounded field list for one user. The public directory in `api/user/discover` selects `address` along with city/country although its scoring code does not read `address`; it later reads latitude/longitude that are not in that projection. | Remove unused sensitive fields from projections. Confirm the location source separately before changing recommendation behavior. |
| Community feed | `api/user/feed` batches posts, reposts, follow/block rows, related repost content, and profiles; current results are capped at 50 posts and 50 reposts without a cursor. | Bulk profile/content lookups avoid per-post queries, but repeated feed pages cannot be fetched and some related content projections are large. Preserve visibility checks when adding cursor pagination. |
| Comments/mentions | `api/comments` performs owner/actor/parent lookups and resolves free-text mentions in a loop; each candidate may cause exact and prefix user queries. Notification deduplication also reads once per recipient. | Clear N+1/serial round-trip candidate. A batched rewrite needs tests for ambiguous names, selected mention references, and notification compatibility. |
| Reactions | `api/reactions` resolves content owner, actor, and recipient rows before inserting notifications; comment reactions add a comment lookup. | Several dependent reads per interaction; a database transaction/RPC could reduce round trips, but requires staging tests and migration-history reconciliation. |
| Followers/following | Followers first loads at most 500 follower IDs, then searches users. Following loads all relationship IDs and then all user rows. | The cap can omit matches and the following response is unpaged. Add explicit page/cursor contracts before changing existing API responses. |
| Messages | `api/messages` loads up to 1,000 full message rows, then computes conversations and unread counts in application memory. `api/messages/[id]` loads an entire conversation without a limit. | Payload and result growth are unbounded at the conversation level. Introduce cursor pagination and database-side unread aggregation only with a compatibility plan for the current response shape. |
| Notifications | `api/notifications` loads 50 rows with `select('*')`, performs an exact unread count, and batches actor profiles. | The actor lookup is batched, but the row projection can be narrowed after checking all response consumers. Exact counts may become expensive at scale; validate with query stats. |
| Tourist spots/events | Visitor spots uses `select('*')`, loads all active rows, and filters/sorts in the browser; it has a public, versioned one-day localStorage cache with background refresh and admin/realtime invalidation. Events selects explicit columns but loads all published/approved rows and filters in the browser. | Spot projection and list bounds are optimization candidates. Preserve the existing cache contract; use server pagination only with a deliberate change to client-side filtering and sorting. |
| Discovery/recommendations | `api/user/discover` fetches up to 300 rows for each enabled content type, performs filtering/scoring/sorting in Node, then pages the combined result. | A request for all types can read up to five 300-row candidate sets before returning a page. Profile/follow aggregates are also loaded into application memory. Push filter/order/aggregate work into SQL only where scoring and visibility semantics remain equivalent. |
| Admin analytics/reviews | Analytics calls a report RPC plus separate traffic/count queries. Review exports cap their review/inquiry/feedback reads at 5,000 rows. | RPC aggregation reduces endpoint round trips; both analytics and exports still need representative `EXPLAIN (ANALYZE, BUFFERS)`/Supabase query-stat evidence before index or function changes. |

### Phase 3 application changes

- The discovery viewer lookup now selects only `city`; the prior
  `id,city,country,address` projection included three fields not consumed by
  the scoring code. Its existing filters and response are unchanged.
- The public tourist-spots list now selects only the 15 columns read by the
  directory UI instead of `*`. Filters, ordering, cache TTL, refresh, and
  invalidation behavior are unchanged. The listing cache version was bumped
  from `daet-directory-v2` to `daet-directory-v3` so old cached row shapes are
  ignored.
- These changes reduce the requested row shape, but no production/staging
  payload-size or query-time comparison was available; no quantitative speedup
  is claimed. The existing cache is public-only, uses a versioned key and
  24-hour TTL, renders cached data while refreshing, and is invalidated after
  successful admin writes and realtime listing changes. Users can manually
  clear it by clearing this site's local storage.

## Index and database-work review

The migrations already provide indexes for several observed access paths:

- `(user_id, is_read, created_at DESC)` on `info_notifications`;
- follower/following lookup indexes on `user_follows`;
- status/time indexes for feed posts, moderation queues, and public blog
  listings;
- message participant indexes, including recipient/time;
- attraction-rating indexes by attraction and reviewer;
- content-comment indexes by content, parent, pinned state, and creation time.

Candidate indexes to evaluate in staging—not approved migrations—include:

1. A comment-list index beginning with `(content_type, content_id)` and
   continuing with the actual visibility filter and descending creation time.
   The existing content and created-time indexes are separate.
2. A sender/time message index to complement the existing participant and
   recipient/time indexes, if plans show the conversation OR predicate and
   ordering are not adequately served.
3. A public tourist-spot status/rating index only if the active-listing plan
   shows a material sort/scan cost.

No candidate should be added until staging plans, table sizes, and
`pg_stat_user_indexes` demonstrate a benefit. The two audit-log indexes noted
above should be reconciled in the live catalog before considering a drop.

Potential write amplification also merits measurement:

- The rating trigger in migration 068 locks the spot row and recomputes count
  and average over that spot's ratings after each review mutation.
- The base forum-reply trigger recounts a thread's active replies after
  inserts/status updates.
- Blog comments are synchronized between two tables by triggers.
- Notification push bridges and engagement/reward triggers add work to
  application writes.

These are not safe to replace with guessed incremental logic without
transactional/concurrency tests and representative data.

## RLS findings from checked-in migrations

These are source-migration findings, not a claim about the current remote
policy catalog:

1. **High — profile row projection is broad.** Migration 001 grants public-key
   table reads and permits selecting `profiles` rows where `is_public = TRUE`;
   the policy does not check `privacy_level`. The row contains fields such as
   address/location and later-added privacy preferences. Migration 104 restricts
   sensitive columns on `info_users`, but does not add equivalent column
   restrictions to `profiles`. Confirm the intended public profile contract
   and align row/column permissions before changing it.
2. **High — share metadata is publicly selectable.** Migration 004 defines
   `content_shares_select_all` with `USING (true)`. That table includes
   `recipient_user_id`, `share_type` (including `dm`), and captions. No later
   policy replacement was found in the checked-in migrations.
3. **Medium/High — vote rows are broadly readable.** Migration 004 defines
   public read policies for `user_poll_votes`; migration 031 does the same for
   `daily_feedback_votes`; migration 053 allows any authenticated user to read
   all `poll_votes`. These rows contain user IDs and selected responses, and the
   vote policies do not encode each poll's `results_visibility`.
4. **Medium — generic interaction rows are public.** `content_reactions`,
   `review_helpfulness`, and `content_shares` have broad read policies. Public
   reaction/review visibility may be intentional; verify whether raw actor IDs
   and metadata are part of the public contract.
5. **Positive controls:** migration 104 removes public access to private
   `info_users` columns; migration 101 narrows comment reads to approved/active
   content, owner, or staff; migration 011 restricts direct-message reads to
   participants; and later staff-role migrations use active-role helper
   functions. These controls still require validation against the deployed
   catalog and service-role route checks.

Do not weaken RLS. Review each finding with product/privacy owners, then test
anon, ordinary authenticated, owner, moderator, tourism officer, administrator,
and service-role behavior against staging.

## Execution status and safe order

- Validation completed: `npm test` passed all 269 tests; targeted ESLint passed
  with zero errors and two existing `@next/next/no-img-element` warnings in the
  tourist-spots page; `npm run build` completed successfully for all routes.
- `git diff --check` is run after this report update. No live RLS, query-plan,
  database-latency, or before/after payload-size test was available.
- No migration was created, applied, repaired, or deleted. No production data
  was modified.
- No live query plan or database latency was available; all index items above
  are hypotheses from query shapes, not measured recommendations.
- Next: obtain authoritative SQL/history for remote-only migrations; compare
  staging schema and policies with the repository; capture query stats/plans;
  resolve the RLS findings; then propose reversible, uniquely numbered
  migrations and test them on a disposable/staging database before deployment.
